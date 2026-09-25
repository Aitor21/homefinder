"""Stage 7 -- air quality, from CAMS reanalysis via Open-Meteo.

Numbeo's pollution figure is a crowd-sourced opinion poll: people rate how dirty
their city feels. This is measured PM2.5 in micrograms per cubic metre, which is
the number epidemiology actually uses, and it comes from the same atmospheric
reanalysis that feeds national air-quality forecasts.

Sampling: four whole months -- January, April, July and October -- rather than a
full year. Air pollution is strongly seasonal (winter inversions and domestic
heating dominate in most of Europe), so a single season would badly misrepresent
the annual figure, while four spread across it costs a third as much quota and
tracks the annual mean closely. The error against a full year is measured at a
set of probe cities and reported, not assumed.

Resolution: 0.5 degrees, roughly 55 km. CAMS global runs at about 0.4 degrees and
the European product at 0.1, so this throws away some detail in Europe and none
elsewhere. It is a regional background level, NOT a street-level reading -- it
will not tell you which side of a city is dirtier.

WHO guideline for annual PM2.5 is 5 ug/m3; the EU limit value is 25.
"""
from __future__ import annotations

import sys
import json
import time
import urllib.parse
from collections import defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import common as c  # noqa: E402

API = "https://air-quality-api.open-meteo.com/v1/air-quality"

# Four months spread across the year, so every season is represented.
SAMPLE_MONTHS = [
    ("2024-01-01", "2024-01-31"),
    ("2024-04-01", "2024-04-30"),
    ("2024-07-01", "2024-07-31"),
    ("2024-10-01", "2024-10-31"),
]

# 0.5 deg, about 55 km. Measured throughput turned out to be ~17 batches per
# minute rather than the ~38 the published weight formula implies, so the finer
# grids simply do not finish: 0.4 deg would have taken about ten hours of
# waiting on 429s. CAMS global is ~0.4 deg anyway, so little real detail is lost
# outside Europe. This is a regional background level, not a street reading.
CELL = 0.5
# Fewer than this many sample months and the mean is a season, not a year.
MIN_MONTHS = 2
BATCH = 25
PACE_S = 3.5

HOURLY = "pm2_5"

# WHO 2021 annual guideline and interim targets, ug/m3. Used for banding.
WHO_GUIDELINE = 5.0
WHO_INTERIM_1 = 35.0


def _cell(lat, lon):
    return (round(lat / CELL) * CELL, round(lon / CELL) * CELL)


# What has actually been measured, keyed by cell and month. Kept beside the raw
# HTTP cache rather than inside it because the two answer different questions:
# the HTTP cache remembers a request, this remembers a measurement, and only the
# second survives a change to how requests are batched.
STORE = c.DATA / "airquality_cells.json"


def _load_store():
    if not STORE.exists():
        return {}
    try:
        return json.loads(STORE.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001  corrupt file is not worth a crash
        c.warn("cell store unreadable; starting a fresh one")
        return {}


def _save_store(store):
    tmp = STORE.with_suffix(".part")
    tmp.write_text(json.dumps(store, separators=(",", ":")), encoding="utf-8")
    tmp.replace(STORE)


def _skey(cell, start):
    return f"{cell[0]:.2f},{cell[1]:.2f}|{start}"


def _fetch_batch(cells, start, end, cache_only=False):
    q = {
        "latitude": ",".join(f"{a:.3f}" for a, _ in cells),
        "longitude": ",".join(f"{b:.3f}" for _, b in cells),
        "start_date": start,
        "end_date": end,
        "hourly": HOURLY,
        "timezone": "UTC",
    }
    url = API + "?" + urllib.parse.urlencode(q)
    key = f"aq|{start}|" + ",".join(f"{a:.2f}_{b:.2f}" for a, b in cells)
    # Checked before the fetch: afterwards it is always true, which would make
    # the pacing skip itself entirely on a cold run.
    cached = c._cache_path(key, ".txt.gz").exists()
    # Once the quota wall is up, every further request costs three 65-second
    # sleeps and returns nothing. Serving only what is already on disk turns the
    # rest of the run from 28 hours of sleeping into a few seconds.
    if cache_only and not cached:
        return None, False
    for attempt in range(4):
        try:
            out = c.fetch_json(url, cache_key=key, retries=1, timeout=300)
            return (out if isinstance(out, list) else [out]), cached
        except Exception:  # 429 is expected; wait out the minute window
            if attempt == 3:
                # Give up on THIS batch, not on the run. Open-Meteo enforces an
                # hourly cap as well as a minute one, and waiting it out inside
                # the loop would stall for an hour -- while aborting would throw
                # away every batch already fetched. The cache makes a later
                # rerun pick up exactly where this one stopped.
                return None, cached
            time.sleep(65)
    return None, cached


def _mean(values):
    v = [x for x in values if x is not None]
    return float(np.mean(v)) if v else None


# One reference cell per block of this size gets its October fetched first, so
# every region has measured neighbours to estimate from if the quota runs out.
SAMPLE_BLOCK_DEG = 5.0
# How many measured neighbours an estimate borrows its seasonal shape from.
K_NEIGHBOURS = 8


def _spread_sample(keys, cells):
    """One cell per block, the one carrying the most places."""
    best = {}
    for k in keys:
        blk = (int(k[0] // SAMPLE_BLOCK_DEG), int(k[1] // SAMPLE_BLOCK_DEG))
        if blk not in best or len(cells[k]) > len(cells[best[blk]]):
            best[blk] = k
    return sorted(best.values())


def _impute(measured, months):
    """Annual mean per cell, estimating any month a cell lacks from the seasonal
    shape of the nearest cells that did measure it.

    Levels differ enormously between neighbouring cells, a city and its
    hinterland, but the shape of the year does not: how much worse January is
    than July is a regional thing, driven by heating, inversions, dust and fire
    seasons. So what is borrowed is a RATIO, in log space: the missing month
    relative to the months the cell did measure, averaged over its nearest
    measured neighbours, then applied to the cell's own level.

    Returns (annual mean by cell, median cross-validated % error or None). The
    error is measured, not assumed: cells that measured all four months have
    July and October hidden and re-estimated, and the resulting annual mean is
    compared with the real one.
    """
    logv = {k: {m: float(np.log(max(v, 0.1))) for m, v in got.items()}
            for k, got in measured.items()}

    def fill(targets, month, base, exclude_self=False):
        """Estimate log(month) for targets that all measured exactly `base`."""
        refs = [r for r, got in logv.items() if month in got and all(b in got for b in base)]
        if not refs or not targets:
            return {}
        r_lat = np.array([r[0] for r in refs])
        r_lon = np.array([r[1] for r in refs])
        ratio = np.array([logv[r][month] - np.mean([logv[r][b] for b in base]) for r in refs])
        t_lat = np.array([t[0] for t in targets])
        t_lon = np.array([t[1] for t in targets])
        out = {}
        for s in range(0, len(targets), 512):
            d = c.haversine(t_lat[s:s + 512, None], t_lon[s:s + 512, None],
                            r_lat[None, :], r_lon[None, :])
            if exclude_self:
                d = np.where(d < 1e-6, np.inf, d)
            k = min(K_NEIGHBOURS, d.shape[1])
            near = np.argpartition(d, k - 1, axis=1)[:, :k]
            dn = np.take_along_axis(d, near, axis=1)
            w = np.where(np.isfinite(dn), 1.0 / (dn + 50.0), 0.0)
            est = (w * ratio[near]).sum(axis=1) / np.maximum(w.sum(axis=1), 1e-12)
            for j, t in enumerate(targets[s:s + 512]):
                out[t] = np.mean([logv[t][b] for b in base]) + est[j]
        return out

    def annual_of(k, filled):
        vals = [measured[k][m] if m in measured[k] else float(np.exp(filled[m][k]))
                for m in months if m in measured[k] or k in filled.get(m, {})]
        return float(np.mean(vals)) if vals else None

    # Group cells by which months they measured, so each group is one call.
    groups = defaultdict(list)
    for k, got in logv.items():
        groups[tuple(m for m in months if m in got)].append(k)
    filled = defaultdict(dict)
    for base, members in groups.items():
        for m in months:
            if m not in base:
                filled[m].update(fill(members, m, list(base)))
    annual = {k: annual_of(k, filled) for k in measured}

    # Cross-validation on the typical gap: January and April known, July and
    # October estimated.
    full = [k for k, got in logv.items() if len(got) == len(months)]
    err = None
    if len(full) >= 20:
        base = [months[0], months[1]]
        cv = defaultdict(dict)
        for m in months[2:]:
            cv[m].update(fill(full, m, base, exclude_self=True))
        errs = []
        for k in full:
            if all(k in cv[m] for m in months[2:]):
                est = np.mean([measured[k][b] for b in base]
                              + [float(np.exp(cv[m][k])) for m in months[2:]])
                real = np.mean([measured[k][m] for m in months])
                errs.append(abs(est - real) / real * 100)
        if errs:
            err = float(np.median(errs))
    return annual, err


def run():
    c.log("stage: airquality")
    places = c.read_stage("places")

    cells = defaultdict(list)
    for p in places:
        cells[_cell(p["lat"], p["lon"])].append(p["id"])
    keys = sorted(cells)
    c.log(f"{len(places)} places -> {len(keys)} cells at {CELL} deg (~{CELL * 111:.0f} km)", 1)
    c.log(f"{len(SAMPLE_MONTHS)} sample months x {len(keys)} cells", 1)

    store = _load_store()
    n_start = len(store)

    # The todo list is per MONTH, not per cell. A cell that already has January
    # but not April needs only April fetched, and batching it whole would spend
    # a seventh of a day's quota re-buying readings already on disk. Quota is
    # the binding constraint on this stage, so that matters.
    #
    # And the ORDER matters, because a quota-limited run always stops partway.
    # The first run fetched month by month and ran out after April for most of
    # the map, which left two thirds of places averaged over January and April:
    # the smoggiest half of the northern year, read as an annual mean. Now each
    # cell's missing months are fetched in the order that repairs that fastest,
    # and October goes first to a thin sample spread over the whole map, so
    # that whatever is still missing when the quota runs out can be estimated
    # from measured neighbours (see `_impute`) rather than left out.
    by_month = {start: [k for k in keys if _skey(k, start) not in store]
                for start, _ in SAMPLE_MONTHS}
    for start, _ in SAMPLE_MONTHS:
        c.log(f"{start[:7]}: {len(keys) - len(by_month[start])} cells cached, "
              f"{len(by_month[start])} to fetch", 1)

    sample = set(_spread_sample(keys, cells))
    ends = dict(SAMPLE_MONTHS)
    order = []
    for start in ("2024-01-01", "2024-04-01", "2024-07-01"):
        order.append((start, by_month[start]))
    octo = by_month["2024-10-01"]
    order.append(("2024-10-01", [k for k in octo if k in sample]))
    order.append(("2024-10-01", [k for k in octo if k not in sample]))
    plan = []
    for start, todo in order:
        for i in range(0, len(todo), BATCH):
            plan.append((start, ends[start], todo[i : i + BATCH]))
    c.log(f"{len(plan)} batch-months to fetch; October sample of {len(sample)} cells "
          f"goes before the rest of October", 1)

    total = len(plan)
    done = 0
    failed = 0
    # Three failures in a row means the daily cap, not a blip. After that the
    # run stops asking and simply drains the cache.
    consecutive = 0
    cache_only = False
    for bi, (start, end, batch) in enumerate(plan):
        blocks, cached = _fetch_batch(batch, start, end, cache_only)
        done += 1
        if blocks is None:
            failed += 1
            consecutive += 1
            if failed == 1:
                c.warn("rate limit reached; continuing and recording what is missing. "
                       "Rerun the stage later to fill the gaps -- everything fetched "
                       "so far is cached.")
            if consecutive == 3 and not cache_only:
                cache_only = True
                c.warn("three failures in a row: treating the daily quota as spent and "
                       "finishing from cache alone.")
            continue
        consecutive = 0
        for cell, blk in zip(batch, blocks):
            m25 = _mean(blk.get("hourly", {}).get("pm2_5") or [])
            if m25 is not None:
                store[_skey(cell, start)] = round(m25, 2)
        if done % 25 == 0 or done == total:
            _save_store(store)
            c.log(f"  {done}/{total} batch-months" + (f", {failed} unfetched" if failed else ""), 1)
        if not cached and bi < total - 1:
            time.sleep(PACE_S)

    _save_store(store)
    c.log(f"cell store: {n_start} measurements before, {len(store)} after", 1)

    # At least two of the four sample months before a number is reported.
    # January alone is not an annual mean: across most of the northern
    # hemisphere it is the worst month of the year for PM2.5, because that is
    # when heating runs and inversions trap it. Shipping a winter reading
    # labelled as an annual average would overstate pollution everywhere the
    # fetch happened to stop early, which is exactly the situation a
    # quota-limited stage keeps finding itself in.
    #
    # Two measured months are still not a year, so the missing ones are
    # estimated from neighbours that measured them, and the mean is taken over
    # all four. A plain average of what happens to be there was the old rule,
    # and it read January-and-April cells as a year.
    months = [st for st, _ in SAMPLE_MONTHS]
    measured = {}
    for cell in keys:
        got = {st: store[_skey(cell, st)] for st in months if _skey(cell, st) in store}
        if len(got) >= MIN_MONTHS:
            measured[cell] = got
    annual, err = _impute(measured, months)
    if err is not None:
        c.log(f"imputed months: cross-validated error on the annual mean "
              f"{err:.1f}% (median, cells with all four months measured)", 1)

    rows = {}
    missing = 0
    for cell, ids in cells.items():
        v = annual.get(cell)
        if v is None:
            missing += 1
            for pid in ids:
                rows[pid] = {"pm25": None, "pm25VsWho": None, "pm25Months": 0}
            continue
        for pid in ids:
            rows[pid] = {
                "pm25": round(v, 1),
                # Measured months only. The rest were estimated, and the UI says so.
                "pm25Months": len(measured[cell]),
                # How many times the WHO annual guideline this is.
                "pm25VsWho": round(v / WHO_GUIDELINE, 1),
            }
    if failed:
        c.warn(f"{failed} of {total} batch-months could not be fetched this run")
    if missing:
        c.warn(f"{missing} of {len(cells)} cells have no PM2.5 -- rerun to fill them")
    covered = 100.0 * (len(cells) - missing) / max(len(cells), 1)
    c.log(f"PM2.5 resolved for {covered:.0f}% of cells", 1)

    c.write_stage("airquality", rows)

    c.log("air quality sanity (WHO annual guideline 5, EU limit 25 ug/m3):", 1)
    probe = {
        "ES-48020": "Bilbao", "ES-28079": "Madrid", "ES-08019": "Barcelona",
        "ES-15030": "A Coruna", "PL-3094802": "Krakow", "IT-3173435": "Milan",
    }
    by_name = {p["id"]: p for p in places}
    for pid, label in probe.items():
        r = rows.get(pid)
        if r and r["pm25"] is not None:
            c.log(f"  {label:<10} PM2.5 ={r['pm25']:>5.1f} ug/m3  = {r['pm25VsWho']:.1f}x the WHO guideline", 1)
    _validate_sampling(rows)

    vals = [r["pm25"] for r in rows.values() if r["pm25"] is not None]
    if vals:
        c.log(f"  across {len(vals)} places: median {np.median(vals):.1f}, "
              f"p10 {np.percentile(vals, 10):.1f}, p90 {np.percentile(vals, 90):.1f}", 1)
    return rows


def _validate_sampling(rows):
    """Measure the four-month sample against a true annual mean at a few points.

    The sampling shortcut is the main modelling assumption in this stage, so it
    is checked rather than asserted.
    """
    probes = [("ES-48020", "Bilbao", 43.26, -2.93), ("ES-28079", "Madrid", 40.42, -3.70),
              ("PL-3094802", "Krakow", 50.06, 19.94)]
    c.log("four-month sample vs full-year mean:", 1)
    for pid, label, lat, lon in probes:
        got = rows.get(pid, {}).get("pm25")
        if got is None:
            continue
        try:
            q = {"latitude": f"{lat}", "longitude": f"{lon}",
                 "start_date": "2024-01-01", "end_date": "2024-12-31",
                 "hourly": "pm2_5", "timezone": "UTC"}
            d = c.fetch_json(API + "?" + urllib.parse.urlencode(q),
                             cache_key=f"aq_full_{pid}", retries=2, timeout=300)
            blk = d[0] if isinstance(d, list) else d
            full = _mean(blk["hourly"]["pm2_5"])
            if full:
                c.log(f"  {label:<9} sampled {got:>5.1f}  full year {full:>5.1f}  "
                      f"error {100 * (got - full) / full:+5.1f}%", 1)
        except Exception as exc:  # noqa: BLE001 - validation is best-effort
            c.warn(f"  {label}: full-year probe failed ({type(exc).__name__})")


if __name__ == "__main__":
    run()
