"""Stage 2b -- turn monthly normals into the metrics the search actually needs.

WorldClim gives a high-resolution *spatial* field on a 1970-2000 baseline. Two
things are missing, and this stage supplies both from real recent daily data:

  1. The baseline is ~25 years stale. Spain has warmed materially since.
  2. Monthly means cannot directly answer "how many days above 30" or "how many
     nights above 20" -- and those are the questions that actually decide whether
     a Spanish summer is liveable.

Method
------
Fetch real ERA5 daily series (2020-2024) for a spatially spread set of ~80 anchor
municipalities -- small enough to fit inside Open-Meteo's quota, wide enough to
span Spain's climate space. From those anchors, fit two corrections:

  bias_m   monthly offset between WorldClim's baseline and the present
  sigma_m  within-month standard deviation of daily temperature, modelled as a
           linear function of continentality (annual temperature range), since
           inland Spain swings far harder day to day than the Atlantic coast

Then, for every municipality, treat daily temperature within a month as normally
distributed around the corrected mean and integrate the tail:

  days_above_T = sum over months of  n_days_m * P(N(mu_m, sigma_m) > T)

Every estimate is validated against the anchors' true values and the error is
reported, both in the log and in the shipped data. Anchors keep their real
measured values; everywhere else is marked `modelled`.
"""
from __future__ import annotations

import math
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import common as c  # noqa: E402
import countries as co  # noqa: E402

ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"
START, END = "2020-01-01", "2024-12-31"
YEARS = 5.0
DAILY = "temperature_2m_max,temperature_2m_min,apparent_temperature_max"
# ERA5-Land carries no apparent temperature (nor sunshine) -- it returns nulls.
# Humidity matters too much here to fake, so it gets its own small ERA5 pass.
DAILY_APP = "apparent_temperature_max"

# Spain keeps its own 80 so the existing cached fetches stay valid; the rest of
# Europe gets its own spread. A calibration fitted only on Iberia has no business
# being applied to Finland.
N_ANCHORS_ES = 80
N_ANCHORS_EU = 60
N_ANCHORS_ASIA = 45

# Regions added after the first three. Each is (continent, northern?, n).
#
# The hemisphere split is not cosmetic. The bias being fitted is
# `ERA5 2020-2024 minus WorldClim 1970-2000`, i.e. a warming signal, and warming
# is far stronger at high northern latitudes than at high southern ones. A
# single `a + b*latitude` line through both hemispheres has to average two
# genuinely different slopes, and it is the far south -- Patagonia, Tasmania,
# the Cape -- that ends up worst served. Splitting costs a handful of extra
# anchors and removes the problem.
#
# The counts are modest because the fit has two parameters per month, not
# because the regions are unimportant: 20 well-spread anchors already determine
# a line, and every anchor is a paced API call against a daily quota.
EXTRA_REGIONS = {
    "Europe (non-EU)": ("Europe", True, 16),
    "Americas N": ("Americas", True, 30),
    "Americas S": ("Americas", False, 20),
    "Africa N": ("Africa", True, 18),
    "Africa S": ("Africa", False, 12),
    "Oceania": ("Oceania", False, 14),
}
BATCH = 10          # 10 loc x 3 vars x 1826 days / 100 ~= 548 units, under the 600/min cap
BATCH_APP = 25      # single variable, so more locations fit in the same budget
PACE_S = 62.0       # one batch per minute-window

DAYS_IN_MONTH = np.array([31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], dtype=np.float64)

# How many months each seasonal metric averages over. The months themselves are
# chosen per place from its own annual cycle, see seasons() below.
N_SUMMER = 4
N_PEAK = 2
N_WINTER = 3

LAPSE = 0.0065  # deg C per metre


# --------------------------------------------------------------------- anchors


def seasons(tmax_12, tmin_12):
    """Which months are this place's summer, peak and winter.

    Returns (summer, peak, winter, hottest) as index arrays into the 12 monthly
    values. Chosen from the place's own annual cycle rather than the calendar,
    which is what makes the metrics mean the same thing in Bilbao, Hobart and
    Nairobi. A fixed Jun-Sep summer would report the southern hemisphere's
    coldest months as its hottest, and would still miss Delhi, where the year
    peaks in May and July is cooler under the monsoon.

    Warm seasons are ranked on daily maxima and the cold season on daily minima,
    because those are the numbers that actually decide whether a summer is
    liveable and whether a winter is.
    """
    warm = np.argsort(-tmax_12, kind="stable")
    cold = np.argsort(tmin_12, kind="stable")
    return warm[:N_SUMMER], warm[:N_PEAK], cold[:N_WINTER], int(warm[0])


def climate_region(m):
    """Which set of places this one shares a bias correction with.

    Europe and Asia keep their bare continent name so their existing fits are
    reproduced byte for byte. Everything added later is split by hemisphere,
    because the correction is a warming signal and the northern and southern
    warming slopes against latitude are not the same line.
    """
    cont = m.get("continent", "Europe")
    if cont in ("Europe", "Asia"):
        return cont
    return cont if m["lat"] >= 0 else cont + " S"


def pick_anchors(munis, n):
    """Farthest-point sampling in (lat, lon, elevation) space.

    Seeded with the largest cities so the well-known reference climates are
    always included, then greedily adds whichever municipality is furthest from
    everything already chosen. That guarantees the anchor set spans the coast,
    the meseta and the mountains instead of clustering in the populous parts.
    """
    lat = np.array([m["lat"] for m in munis])
    lon = np.array([m["lon"] for m in munis])
    elev = np.array([m["elev"] if m["elev"] is not None else 0 for m in munis], dtype=np.float64)
    pop = np.array([m["pop"] for m in munis])

    # Normalise so 1000 m of ascent counts about as much as 1 degree of latitude.
    feat = np.stack([lat, lon * 0.75, elev / 1000.0], axis=1)

    seeds = list(np.argsort(-pop)[:12])
    chosen = list(seeds)
    d = np.min(
        np.linalg.norm(feat[:, None, :] - feat[None, chosen, :], axis=2), axis=1
    )
    while len(chosen) < n:
        i = int(np.argmax(d))
        chosen.append(i)
        d = np.minimum(d, np.linalg.norm(feat - feat[i], axis=1))
    return chosen


def fetch_anchor_daily(anchors, daily=DAILY, model="era5_land", prefix="anchor", batch_n=BATCH):
    """Paced Open-Meteo fetch. Cached, so a rerun costs nothing."""
    out = {}
    batches = [anchors[i : i + batch_n] for i in range(0, len(anchors), batch_n)]
    # Same circuit breaker as the air-quality stage: two failures in a row mean
    # the daily cap is spent, and every further attempt costs five 65-second
    # sleeps to learn the same thing again. From then on the run drains the
    # cache and reports how many anchors it is short.
    cache_only = False
    consecutive = 0
    for bi, batch in enumerate(batches):
        q = {
            "latitude": ",".join(f"{m['lat']:.4f}" for m in batch),
            "longitude": ",".join(f"{m['lon']:.4f}" for m in batch),
            "elevation": ",".join(str(int(m["elev"] or 0)) for m in batch),
            "start_date": START,
            "end_date": END,
            "daily": daily,
            "models": model,
            "timezone": "Europe/Madrid",
        }
        url = ARCHIVE + "?" + urllib.parse.urlencode(q)
        # Spanish anchors key on the bare INE code, which is what the original
        # Spain-only run used -- so those (expensive) fetches stay cached after
        # the move to continent-wide ids.
        key = f"{prefix}|" + ",".join(m.get("ine") or m["id"] for m in batch)

        cached = c._cache_path(key, ".txt.gz").exists()
        blocks = None
        if cache_only and not cached:
            continue
        for attempt in range(6):
            try:
                data = c.fetch_json(url, cache_key=key, retries=1, timeout=300)
                blocks = data if isinstance(data, list) else [data]
                break
            except Exception as exc:  # 429 is expected; wait out the window
                if attempt == 5:
                    # The daily quota is finite and the world does not fit
                    # inside one day of it. Raising here would discard every
                    # batch already paid for, so the run continues with the
                    # anchors it has and the next run fills the rest in from
                    # cache. fit_bias falls back by region when a set is thin.
                    c.warn(f"anchor batch {bi + 1} unavailable after 6 tries "
                           f"({type(exc).__name__}); continuing without it")
                    break
                c.warn(f"anchor batch {bi + 1} rate-limited, waiting 65s ({type(exc).__name__})")
                time.sleep(65)
        if blocks is None:
            consecutive += 1
            if consecutive >= 2 and not cache_only:
                cache_only = True
                c.warn("daily quota looks spent; finishing this stage from cache alone. "
                       "Rerun tomorrow to fill in the missing anchors.")
            continue
        consecutive = 0
        for m, blk in zip(batch, blocks):
            out[m["id"]] = blk["daily"]
        c.log(f"{prefix} {min((bi + 1) * batch_n, len(anchors))}/{len(anchors)}"
              + ("  (cached)" if cached else ""), 1)
        if not cached and bi < len(batches) - 1:
            time.sleep(PACE_S)
    return out


def _col(daily, name):
    v = daily.get(name)
    if not v:
        return None
    return np.array([np.nan if x is None else x for x in v], dtype=np.float64)


def _month_agg(arr, months, fn):
    """Per-calendar-month aggregate that tolerates a wholly absent variable."""
    if arr is None or not np.isfinite(arr).any():
        return np.full(12, np.nan)
    return np.array([fn(arr[months == m + 1]) for m in range(12)])


def monthly_stats(daily, app_daily=None):
    """Per-calendar-month mean and sd of daily tmax/tmin, plus apparent tmax."""
    months = np.array([int(t[5:7]) for t in daily["time"]], dtype=np.int8)
    tmax = _col(daily, "temperature_2m_max")
    tmin = _col(daily, "temperature_2m_min")

    app, app_months = None, months
    if app_daily:
        app = _col(app_daily, "apparent_temperature_max")
        app_months = np.array([int(t[5:7]) for t in app_daily["time"]], dtype=np.int8)

    res = {}
    for k, arr, mo in (("tmax", tmax, months), ("tmin", tmin, months), ("app", app, app_months)):
        res[k + "_mean"] = _month_agg(arr, mo, np.nanmean)
        res[k + "_sd"] = _month_agg(arr, mo, np.nanstd)
    res["daysOver30"] = float(np.nansum(tmax > 30) / YEARS)
    res["daysOver35"] = float(np.nansum(tmax > 35) / YEARS)
    res["tropicalNights"] = float(np.nansum(tmin >= 20) / YEARS)
    if app is not None and np.isfinite(app).any():
        res["appDaysOver32"] = float(np.nansum(app > 32) / YEARS)
        summer = app[np.isin(app_months, [6, 7, 8, 9])]
        res["appTmaxP90"] = float(np.nanpercentile(summer[np.isfinite(summer)], 90))
        res["hasApp"] = True
    else:
        res["appDaysOver32"] = float("nan")
        res["appTmaxP90"] = float("nan")
        res["hasApp"] = False
    return res


# ------------------------------------------------------------------ estimation


# numpy has no erfc, and pulling in scipy for one function is not worth the
# install risk on 3.14. Vectorising math.erfc is plenty fast at this scale.
_erfc = np.vectorize(math.erfc, otypes=[np.float64])


def _phi(z):
    """Standard normal survival function, P(Z > z)."""
    return 0.5 * _erfc(np.asarray(z, dtype=np.float64) / math.sqrt(2.0))


def days_above(mu, sigma, thresh):
    """Expected days per year above `thresh`, integrating the monthly tails."""
    z = (thresh - mu) / np.maximum(sigma, 0.3)
    return float((DAYS_IN_MONTH * _phi(z)).sum())


def nights_at_or_above(mu, sigma, thresh):
    z = (thresh - mu) / np.maximum(sigma, 0.3)
    return float((DAYS_IN_MONTH * _phi(z)).sum())


def run():
    c.log("stage: climate (calibrate + derive)")
    munis = c.read_stage("places")
    wc = c.read_stage("worldclim")
    by_ine = {m["id"]: m for m in munis}

    # --- assemble the WorldClim matrices --------------------------------------
    ines = [m["id"] for m in munis]
    tmax_wc = np.array([wc[i]["tmax"] for i in ines], dtype=np.float64)
    tmin_wc = np.array([wc[i]["tmin"] for i in ines], dtype=np.float64)
    prec_wc = np.array([wc[i]["prec"] for i in ines], dtype=np.float64)
    vapr_wc = np.array([wc[i]["vapr"] for i in ines], dtype=np.float64)
    # Solar radiation stands in for sunshine: WorldClim's base set has no
    # sunshine-hours product, and kJ/m2/day is the more physical quantity anyway.
    srad_wc = (
        np.array([wc[i]["srad"] for i in ines], dtype=np.float64)
        if "srad" in wc[ines[0]]
        else np.full((len(ines), 12), np.nan)
    )
    grid_elev = np.array([wc[i]["gridElev"] or 0.0 for i in ines], dtype=np.float64)
    # Where GeoNames had no elevation, use the raster's own cell elevation, which
    # makes the correction below a no-op rather than a wild guess.
    real_elev = np.array(
        [
            grid_elev[k] if by_ine[i]["elev"] is None else by_ine[i]["elev"]
            for k, i in enumerate(ines)
        ],
        dtype=np.float64,
    )

    # Sub-grid elevation correction: WorldClim's cell sits at grid_elev, the town
    # at real_elev. In the Cantabrian and Pyrenean valleys that gap is worth a
    # degree or more.
    dz = real_elev - grid_elev
    shift = (-dz * LAPSE)[:, None]
    tmax_wc = tmax_wc + shift
    tmin_wc = tmin_wc + shift

    continentality = np.nanmax(tmax_wc, axis=1) - np.nanmin(tmin_wc, axis=1)

    # --- anchors ---------------------------------------------------------------
    # Spain is selected from the INE-sorted subset, which reproduces the original
    # Spain-only ordering exactly and therefore reuses its cached fetches.
    # Each region draws its anchors from its own stable subset. Selecting from the
    # combined list instead would reshuffle every choice whenever a new region is
    # added, invalidating the cached fetches for regions that had not changed.
    es = sorted([m for m in munis if m["country"] == "ES"], key=lambda r: r["ine"])
    # The EU/EFTA draw is deliberately taken from the frozen membership list
    # rather than from "everything in Europe". Adding the UK and the Balkans
    # would otherwise put London into the seed set and reshuffle all 60 choices,
    # discarding cached fetches for countries that had not changed. They get
    # their own draw below and still share Europe's bias fit, which is the part
    # that actually matters.
    eu = [m for m in munis if m["country"] in co.EU_EFTA and m["country"] != "ES"]
    asia = [m for m in munis if m.get("continent") == "Asia"]

    subsets = {"Spain": (es, N_ANCHORS_ES), "EU/EFTA": (eu, N_ANCHORS_EU),
               "Asia": (asia, N_ANCHORS_ASIA)}
    for label, (want_cont, want_hemi, n) in EXTRA_REGIONS.items():
        subsets[label] = (
            [m for m in munis
             if m.get("continent") == want_cont
             and m["country"] not in co.EU_EFTA
             and (want_hemi is None or (m["lat"] >= 0) == want_hemi)],
            n,
        )

    anchors, counts = [], []
    for label, (subset, n) in subsets.items():
        if not subset:
            continue
        k = min(n, len(subset))
        anchors += [subset[i] for i in pick_anchors(subset, k)]
        counts.append(f"{k} {label}")

    c.log(f"{len(anchors)} anchors (" + ", ".join(counts) + "), elevation "
          f"{min((a['elev'] or 0) for a in anchors)}-{max((a['elev'] or 0) for a in anchors)} m, "
          f"latitude {min(a['lat'] for a in anchors):.1f}-{max(a['lat'] for a in anchors):.1f}, "
          f"longitude {min(a['lon'] for a in anchors):.1f}-{max(a['lon'] for a in anchors):.1f}", 1)
    daily = fetch_anchor_daily(anchors)
    # Second, cheaper pass on the coarser ERA5 grid purely for apparent
    # temperature, which ERA5-Land does not carry.
    app_daily = fetch_anchor_daily(
        anchors, daily=DAILY_APP, model="era5", prefix="anchorapp", batch_n=BATCH_APP
    )

    stats = {ine: monthly_stats(d, app_daily.get(ine)) for ine, d in daily.items()}
    pos = {ine: k for k, ine in enumerate(ines)}
    ai = np.array([pos[a["id"]] for a in anchors if a["id"] in stats])
    akeys = [a["id"] for a in anchors if a["id"] in stats]

    real_tmax = np.array([stats[k]["tmax_mean"] for k in akeys])
    real_tmin = np.array([stats[k]["tmin_mean"] for k in akeys])
    sd_tmax = np.array([stats[k]["tmax_sd"] for k in akeys])
    sd_tmin = np.array([stats[k]["tmin_sd"] for k in akeys])

    # --- calibration 1: baseline bias, per month, latitude and region ----------
    # Warming since 1970-2000 is not uniform, so the offset carries a latitude
    # term. It is also fitted separately per continent: stretching one linear
    # relationship from -10 to +71 degrees is too rigid, and when it was fitted
    # globally the tropical anchors visibly dragged the Cantabrian coast's
    # estimates down. Each region now answers only for itself.
    lat_all = np.array([m["lat"] for m in munis], dtype=np.float64)
    region_all = np.array([climate_region(m) for m in munis])
    region_a = region_all[ai]
    lat_a = lat_all[ai]

    def fit_bias(real, model):
        """Per-month, per-region offset as a + b*latitude, returned per place."""
        out = np.zeros((len(munis), 12))
        for region in np.unique(region_all):
            rows_r = region_all == region
            anch_r = region_a == region
            if anch_r.sum() < 10:
                # Too few anchors to fit a slope. Borrow the rest of the same
                # continent first -- a hemisphere's own landmass is a far better
                # proxy than the global average -- and only then everything.
                cont = region.removesuffix(" S")
                wider = np.array([r.removesuffix(" S") == cont for r in region_a])
                anch_r = wider if wider.sum() >= 10 else np.ones_like(region_a, dtype=bool)
            for m in range(12):
                resid = real[:, m] - model[ai, m]
                ok = anch_r & np.isfinite(resid) & np.isfinite(lat_a)
                if ok.sum() < 6:
                    out[rows_r, m] = float(np.nanmean(resid)) if np.isfinite(resid).any() else 0.0
                    continue
                A = np.stack([np.ones(int(ok.sum())), lat_a[ok]], axis=1)
                b0, b1 = np.linalg.lstsq(A, resid[ok], rcond=None)[0]
                out[rows_r, m] = b0 + b1 * lat_all[rows_r]
        return out, [float(np.mean(out[region_all == "Europe", m])) for m in range(12)]

    bias_tmax, rep_tmax = fit_bias(real_tmax, tmax_wc)
    bias_tmin, rep_tmin = fit_bias(real_tmin, tmin_wc)
    c.log("baseline correction (2020-2024 minus WorldClim 1970-2000), deg C, mean over places:", 1)
    c.log("  tmax by month: " + " ".join(f"{b:+.1f}" for b in rep_tmax), 1)
    c.log("  tmin by month: " + " ".join(f"{b:+.1f}" for b in rep_tmin), 1)

    # --- calibration 2: within-month sd vs continentality ----------------------
    cont_a = continentality[ai]
    coef_max, coef_min = [], []
    for m in range(12):
        A = np.stack([np.ones_like(cont_a), cont_a], axis=1)
        for target, store in ((sd_tmax[:, m], coef_max), (sd_tmin[:, m], coef_min)):
            ok = np.isfinite(target) & np.isfinite(cont_a)
            store.append(np.linalg.lstsq(A[ok], target[ok], rcond=None)[0])
    coef_max = np.array(coef_max)
    coef_min = np.array(coef_min)

    def sigma_for(cont, coef):
        return np.clip(coef[:, 0][None, :] + coef[:, 1][None, :] * cont[:, None], 1.0, 9.0)

    sig_max = sigma_for(continentality, coef_max)
    sig_min = sigma_for(continentality, coef_min)

    mu_max = tmax_wc + bias_tmax
    mu_min = tmin_wc + bias_tmin

    # --- humid heat: apparent temperature from vapour pressure -----------------
    # Bureau of Meteorology apparent temperature, wind term dropped:
    #   AT = T + 0.33 * e_hPa - 4.00
    e_hpa = vapr_wc * 10.0
    at_raw = mu_max + 0.33 * e_hpa - 4.00
    # Reconcile with ERA5's apparent temperature (which also carries wind and
    # radiation) via a linear fit on the anchors. If that pass is unavailable,
    # fall back to the raw BOM formula rather than silently emitting zeros.
    real_app = np.array([stats[k]["app_mean"] for k in akeys])
    ra = real_app.ravel()
    ar = at_raw[ai].ravel()
    ok = np.isfinite(ra) & np.isfinite(ar)
    a0, a1 = 0.0, 1.0
    if ok.sum() >= 24:
        A = np.stack([np.ones(int(ok.sum())), ar[ok]], axis=1)
        cand0, cand1 = np.linalg.lstsq(A, ra[ok], rcond=None)[0]
        if 0.3 < cand1 < 3.0:
            a0, a1 = float(cand0), float(cand1)
        else:
            c.warn(f"apparent-temperature fit looks degenerate (slope {cand1:.3f}); "
                   "using the uncalibrated BOM formula")
    else:
        c.warn("no ERA5 apparent-temperature data; using the uncalibrated BOM formula")
    mu_app = a0 + a1 * at_raw
    c.log(f"apparent-temperature fit: AT_era5 = {a0:+.2f} + {a1:.3f} * AT_bom "
          f"(n={int(ok.sum())} anchor-months)", 1)

    # --- derive per-municipality metrics ---------------------------------------
    rows = {}
    for j, ine in enumerate(ines):
        est30 = days_above(mu_max[j], sig_max[j], 30.0)
        est35 = days_above(mu_max[j], sig_max[j], 35.0)
        trop = nights_at_or_above(mu_min[j], sig_min[j], 20.0)
        est_app32 = days_above(mu_app[j], sig_max[j], 32.0)

        measured = ine in stats
        s = stats.get(ine)
        summer_i, peak_i, winter_i, hot_i = seasons(mu_max[j], mu_min[j])
        rows[ine] = {
            # The hottest month, whichever it is. Called augTmax for most of this
            # project's life, which was only ever true north of the equator.
            "hottestTmax": round(float(mu_max[j][hot_i]), 1),
            "hottestTmin": round(float(mu_min[j][hot_i]), 1),
            "hottestMonth": hot_i,
            "summerTmax": round(float(mu_max[j][summer_i].mean()), 1),
            "peakTmax": round(float(mu_max[j][peak_i].mean()), 1),
            "winterTmin": round(float(mu_min[j][winter_i].mean()), 1),
            "summerAppTmax": round(float(mu_app[j][summer_i].mean()), 1),
            "daysOver30": round(s["daysOver30"] if measured else est30, 1),
            "daysOver35": round(s["daysOver35"] if measured else est35, 1),
            "tropicalNights": round(s["tropicalNights"] if measured else trop, 1),
            "appDaysOver32": round(
                s["appDaysOver32"]
                if (measured and math.isfinite(s["appDaysOver32"]))
                else est_app32,
                1,
            ),
            "annualRain": round(float(np.nansum(prec_wc[j]))),
            "summerRain": round(float(np.nansum(prec_wc[j][summer_i]))),
            "humidity": round(float(e_hpa[j][summer_i].mean()), 1),
            "solarAnnual": round(float(np.nanmean(srad_wc[j]))) if np.isfinite(srad_wc[j]).any() else None,
            "solarSummer": round(float(np.nanmean(srad_wc[j][summer_i]))) if np.isfinite(srad_wc[j]).any() else None,
            "monthlyTmax": [round(float(x), 1) for x in mu_max[j]],
            "monthlyTmin": [round(float(x), 1) for x in mu_min[j]],
            "monthlyPrec": [round(float(x)) for x in prec_wc[j]],
            "source": "measured" if measured else "modelled",
        }

    # --- validation ------------------------------------------------------------
    _validate(rows, stats, ines, mu_max, mu_min, mu_app, sig_max, sig_min, pos)
    c.write_stage("climate", rows)
    _sanity(rows)
    return rows


def _validate(rows, stats, ines, mu_max, mu_min, mu_app, sig_max, sig_min, pos):
    """Hold the model to account against the anchors' real measured values."""
    errs = {"daysOver30": [], "daysOver35": [], "tropicalNights": []}
    for ine, s in stats.items():
        j = pos[ine]
        est = {
            "daysOver30": days_above(mu_max[j], sig_max[j], 30.0),
            "daysOver35": days_above(mu_max[j], sig_max[j], 35.0),
            "tropicalNights": nights_at_or_above(mu_min[j], sig_min[j], 20.0),
        }
        for k in errs:
            errs[k].append((est[k], s[k]))

    c.log("validation of the modelled estimates against measured anchors:", 1)
    for k, pairs in errs.items():
        e = np.array([p[0] for p in pairs])
        t = np.array([p[1] for p in pairs])
        mae = float(np.mean(np.abs(e - t)))
        ss_res = float(np.sum((e - t) ** 2))
        ss_tot = float(np.sum((t - t.mean()) ** 2))
        r2 = 1 - ss_res / ss_tot if ss_tot > 0 else float("nan")
        c.log(f"  {k:<16} MAE={mae:6.1f} days   R2={r2:5.3f}   "
              f"(measured range {t.min():.0f}-{t.max():.0f})", 1)


def _sanity(rows):
    probe = {
        "ES-48020": "Bilbao", "ES-39075": "Santander", "ES-20069": "Donostia", "ES-15030": "A Coruna",
        "ES-27028": "Lugo", "ES-33044": "Oviedo", "ES-41091": "Sevilla", "ES-14021": "Cordoba",
        "ES-09059": "Burgos", "ES-46250": "Valencia", "ES-28079": "Madrid",
    }
    c.log("climate sanity:", 1)
    for ine, label in probe.items():
        r = rows.get(ine)
        if not r:
            continue
        c.log(f"  {label:<10} hotTmax={r['hottestTmax']:>5.1f} hotTmin={r['hottestTmin']:>5.1f} "
              f"over30={r['daysOver30']:>5.1f} tropN={r['tropicalNights']:>5.1f} "
              f"winterTmin={r['winterTmin']:>5.1f} rain={r['annualRain']:>4} [{r['source']}]", 1)

    fails = []
    if rows.get("ES-48020", {}).get("daysOver30", 99) > 20:
        fails.append("Bilbao daysOver30 > 20")
    if rows.get("ES-41091", {}).get("daysOver30", 0) < 70:
        fails.append("Sevilla daysOver30 < 70")
    if rows.get("ES-09059", {}).get("winterTmin", 99) >= rows.get("ES-39075", {}).get("winterTmin", -99):
        fails.append("Burgos winter not colder than Santander")
    if rows.get("ES-41091", {}).get("tropicalNights", 0) <= rows.get("ES-48020", {}).get("tropicalNights", 99):
        fails.append("Sevilla not hotter at night than Bilbao")
    # The seasons are derived per place, so the southern hemisphere has to come
    # out inverted without anyone telling it to. If a Chilean or South African
    # town reports a July peak, the derivation has silently reverted to the
    # northern calendar and every summer filter is wrong for half the world.
    south = [(i, r) for i, r in rows.items()
             if i.split("-")[0] in ("CL", "AR", "ZA", "AU", "NZ", "UY")
             and r.get("hottestMonth") is not None]
    if south:
        NAMES = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()
        peaks = [r["hottestMonth"] for _, r in south]
        n_summer = sum(1 for m in peaks if m in (11, 0, 1, 2))
        c.log(f"southern hemisphere: {n_summer}/{len(peaks)} peak in Dec-Mar "
              f"(most common {NAMES[max(set(peaks), key=peaks.count)]})", 1)
        if n_summer < 0.9 * len(peaks):
            fails.append(f"only {n_summer}/{len(peaks)} southern places peak in Dec-Mar")

    if fails:
        c.warn("SANITY FAILURES: " + "; ".join(fails))
    else:
        c.log("  all sanity checks passed", 1)


if __name__ == "__main__":
    run()
