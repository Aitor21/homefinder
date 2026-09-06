"""Stage 6 -- price per square metre, tiered and provenance-tagged.

This is the weakest data in the project and the code says so out loud.

Spain's official municipal valuation series (MIVAU, quarterly) only covers
municipalities above 25,000 inhabitants -- about 480 of 8,131. That is missing
precisely where the interesting small towns are. So:

  observed    straight from the MIVAU municipal table
  modelled    predicted as a *ratio to the provincial average*, not as an
              absolute price -- far more stable when extrapolating from cities
              down to villages, and it keeps every prediction anchored to a real
              measured number for that province
  provincial  the provincial average itself, when the model has nothing to work with

Modelling the ratio matters. Fitting absolute prices on 480 towns of 25k+ and
applying that to a village of 800 would extrapolate the population coefficient
far outside its fitted range. Anchoring to the provincial mean -- which does
include every small town in the province -- keeps predictions honest, and the
result is clamped so no town can be predicted at an absurd multiple of it.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import xlrd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import common as c  # noqa: E402
from spain import PROVINCES  # noqa: E402

MUNICIPAL_XLS = "https://apps.fomento.gob.es/BoletinOnline2/sedal/35103500.XLS"
PROVINCIAL_XLS = "https://apps.fomento.gob.es/BoletinOnline2/sedal/35101000.XLS"

# Predicted price is never allowed further than this from the provincial mean.
RATIO_CLAMP = (0.45, 2.60)

# Approximate national average price per built m2 for apartments, EUR, 2024-25.
# These are ORDER-OF-MAGNITUDE anchors, not measurements: no pan-European
# equivalent of Spain's MIVAU series exists as open data, so outside Spain every
# price is tagged `country` and should be read as a band rather than a number.
# Taken from published national averages and trivially editable as better
# figures appear.
COUNTRY_EUR_M2 = {
    "AT": 4500, "BE": 2700, "BG": 1300, "HR": 2200, "CY": 2000,
    "CZ": 3200, "DK": 3500, "EE": 2300, "FI": 2600, "FR": 3400,
    "DE": 4000, "GR": 1800, "HU": 2000, "IE": 3300, "IT": 2100,
    "LV": 1500, "LT": 1800, "LU": 8500, "MT": 3000, "NL": 4200,
    "PL": 2300, "PT": 2000, "RO": 1600, "SK": 2300, "SI": 2800,
    "SE": 3300, "IS": 4000, "LI": 7000, "NO": 4500, "CH": 8000,
    # Asia, converted to EUR at 2025 rates. Even rougher than the European
    # figures: national averages across countries this large mean less, and the
    # spread between a capital and a provincial town is far wider.
    "JP": 2600, "KR": 4200, "TW": 5500, "GE": 1100, "AM": 1300,
    "TR": 1200, "IL": 6500, "KZ": 1200, "AZ": 1100, "MY": 1500,
    "TH": 2600, "VN": 2200, "PH": 2300, "SG": 14000, "AE": 4200,
    "KH": 1800, "LK": 1200, "MN": 1300, "KG": 900, "UZ": 800,
    "ID": 1500, "CN": 3500, "IN": 1400, "NP": 900, "BT": 800,
    "MM": 900, "LA": 1000,
    # Europe outside the EU/EFTA.
    "GB": 3900, "AD": 4500, "RS": 1800, "ME": 1700, "AL": 1200,
    "BA": 1300, "MK": 1200, "MD": 900,
    # The Americas. Wider still: Bogota and a Colombian provincial capital are
    # not within a factor of two of each other, and no national average can
    # carry that.
    "US": 2900, "CA": 3400, "MX": 1300, "BR": 1500, "AR": 1600,
    "CL": 1900, "UY": 2200, "CO": 1200, "PE": 1300, "EC": 1100,
    "PY": 1100, "BO": 900, "CR": 1700, "PA": 1600, "GT": 1200,
    "BZ": 1300, "DO": 1500, "TT": 1400, "JM": 1600, "BB": 2800,
    "BS": 3200,
    # Oceania.
    "AU": 4600, "NZ": 4000,
    # Africa.
    "ZA": 900, "MA": 1100, "NA": 900, "CV": 1100, "BW": 800,
    "EG": 700, "TN": 800, "MU": 2600, "SC": 2800, "KE": 1200,
    "TZ": 900, "GH": 1100, "RW": 1000, "ET": 900,
}

# How wrong a price of each tier can reasonably be, as a fraction either side.
# Shipped so the UI can render a band instead of a number that looks measured
# when it is not. `observed` is a published figure for that municipality and
# gets no band.
#
# The `country` entry is only a floor: the real per-country figure is measured
# at run time (see country_bands), because one number cannot be right for both
# Luxembourg and Brazil.
PRICE_BAND = {"observed": 0.0, "modelled": 0.22, "provincial": 0.30, "country": 0.45}

# Outside Spain the model extrapolates much further, so clamp harder.
COUNTRY_RATIO_CLAMP = (0.55, 2.20)

# A band narrower than this would overstate what a national average can do, and
# one wider than this stops being a useful number at all.
BAND_FLOOR, BAND_CEIL = 0.30, 0.80

# Uncertainty grows with a country's size, but far slower than linearly: Brazil
# is nine times Spain's span and nowhere near nine times as unknowable.
BAND_EXPONENT = 0.35


def country_bands(munis, X_all, beta, observed, prov_base, national):
    """Per-country price uncertainty, calibrated on Spain.

    Spain is the only country with enough measured municipal prices to check a
    national-average model against reality, so it sets the scale: apply the
    model Spain would get if it had no municipal series, and see how far off it
    lands on the 302 towns where the truth is known.

    Every other country is then placed relative to Spain by geographic extent,
    which is the one uncontaminated signal available. See the module note.
    """
    import numpy as np

    by_country = {}
    for j, m in enumerate(munis):
        by_country.setdefault(m["country"], []).append(j)

    # --- what a national average actually costs you, measured on Spain --------
    es_idx = [j for j in by_country.get("ES", []) if munis[j]["id"] in observed]
    if len(es_idx) < 30:
        return {}, None, None
    truth = np.array([observed[munis[j]["id"]] for j in es_idx])
    pred = national * np.clip(np.exp(X_all[es_idx] @ beta), *COUNTRY_RATIO_CLAMP)
    rel = np.abs(pred - truth) / truth
    es_band = float(np.percentile(rel, 68))   # one-sigma-ish, robust to outliers

    # --- geographic extent, in km, per country --------------------------------
    def extent(idx):
        lat = np.array([munis[j]["lat"] for j in idx])
        lon = np.array([munis[j]["lon"] for j in idx])
        # Degrees to km, with longitude shrunk by latitude so the two axes are
        # comparable. Robust centre and spread, so an overseas territory or one
        # far-flung island does not set the width for the whole country.
        y = (lat - np.median(lat)) * 111.0
        x = (lon - np.median(lon)) * 111.0 * np.cos(np.radians(np.median(lat)))
        return float(np.sqrt(np.median(y ** 2) + np.median(x ** 2)))

    spans = {cc: extent(idx) for cc, idx in by_country.items() if len(idx) >= 5}
    es_span = spans.get("ES")
    if not es_span:
        return {}, es_band, None

    bands = {}
    for cc, span in spans.items():
        scaled = es_band * (max(span, 1.0) / es_span) ** BAND_EXPONENT
        bands[cc] = round(float(np.clip(scaled, BAND_FLOOR, BAND_CEIL)), 3)
    return bands, es_band, es_span


# Provinces are written half a dozen different ways across Spanish sources
# (Castilian, co-official language, article moved). Map them all to INE codes.
ALIASES = {
    "alava": "01", "araba": "01", "alava araba": "01", "araba alava": "01",
    "alacant alicante": "03", "alicante": "03", "alacant": "03",
    "almeria": "04", "asturias": "33", "avila": "05", "badajoz": "06",
    "balears": "07", "balears illes": "07", "baleares": "07", "illes": "07",
    "baleares islas": "07", "barcelona": "08", "burgos": "09", "caceres": "10",
    "cadiz": "11", "cantabria": "39", "castello castellon": "12",
    "castellon": "12", "castello": "12", "ciudad real": "13", "cordoba": "14",
    "coruna": "15", "cuenca": "16", "girona": "17", "gerona": "17",
    "granada": "18", "guadalajara": "19", "gipuzkoa": "20", "guipuzcoa": "20",
    "huelva": "21", "huesca": "22", "jaen": "23", "leon": "24",
    "lleida": "25", "lerida": "25", "rioja": "26", "lugo": "27",
    "madrid": "28", "malaga": "29", "murcia": "30", "navarra": "31",
    "nafarroa": "31", "ourense": "32", "orense": "32", "palencia": "34",
    "palmas": "35", "pontevedra": "36", "salamanca": "37",
    "cruz de santa tenerife": "38", "tenerife": "38", "segovia": "40",
    "sevilla": "41", "soria": "42", "tarragona": "43", "teruel": "44",
    "toledo": "45", "valencia": "46", "valencia valencia": "46",
    "valladolid": "47", "bizkaia": "48", "vizcaya": "48", "zamora": "49",
    "zaragoza": "50", "ceuta": "51", "melilla": "52",
}


# Single-province regions are written in full autonomous-community form in the
# provincial table -- "Madrid (Comunidad de)", "Asturias (Principado de )",
# "Navarra (Comunidad Foral de)". Stripping the administrative filler is more
# robust than enumerating every spelling, and it correctly declines to match
# multi-province communities ("Castilla y Leon", "Comunidad Valenciana"), whose
# provinces are listed separately anyway.
_FILLER = {"comunidad", "principado", "region", "foral", "autonoma", "ciudad", "de", "del", "y"}


def prov_code(name):
    key = c.norm_name(name)
    if key in ALIASES:
        return ALIASES[key]
    trimmed = " ".join(t for t in key.split() if t not in _FILLER)
    return ALIASES.get(trimmed)


_CONNECTORS = {"de", "del", "da", "do", "dels"}


def _variants(name, alt):
    """Every spelling a Spanish municipality might be written under.

    Splits bilingual compounds on "/" and "-", folds in GeoNames alternate
    names, and adds a form with the de/del connectors dropped -- which is what
    lets "San Cristobal de La Laguna" meet MIVAU's "San Cristobal La Laguna".
    """
    out = set()
    seeds = [name] + [a for a in alt if a and not a.isdigit()]
    for s in seeds:
        parts = [s]
        for sep in ("/", "-"):
            parts = [q for part in parts for q in part.split(sep)]
        for part in parts:
            k = c.norm_name(part)
            if not k:
                continue
            out.add(k)
            trimmed = " ".join(t for t in k.split() if t not in _CONNECTORS)
            if trimmed:
                out.add(trimmed)
    # Sorted, not a bare set. The caller takes the FIRST variant that matches,
    # and Python randomises string hashing per process, so returning a set made
    # the chosen match vary between runs: the same input produced 301 or 302
    # observed prices depending on the day. A pipeline has to be reproducible.
    return sorted(out)


def _num(v):
    try:
        f = float(v)
        return f if f > 0 else None
    except (TypeError, ValueError):
        return None


def parse_municipal():
    """Latest quarter of the >25k municipal valuation table -> {(prov, name): eur/m2}."""
    raw = c.fetch(MUNICIPAL_XLS, binary=True, cache_key="mivau_35103500")
    wb = xlrd.open_workbook(file_contents=raw)
    sheet_name = wb.sheet_names()[-1]
    sh = wb.sheet_by_name(sheet_name)

    # Layout (verified against T1A2026): col0 blank, col1 Provincia, col2
    # Municipio, col3/4/5 valuation for new / older / all housing, col9 number
    # of valuations.
    #
    # The province cell is NOT reliably on the first row of its group -- e.g.
    # Almunecar appears a row *above* the "Granada" label -- so forward-filling
    # it silently misassigns towns to the wrong province. The province label is
    # kept only as a disambiguation hint; the real join is done on the name in
    # run(), against the INE municipality list.
    rows, tasaciones = [], {}
    hint = None
    for r in range(sh.nrows):
        pname = str(sh.cell_value(r, 1)).strip()
        mname = str(sh.cell_value(r, 2)).strip()
        if pname and prov_code(pname):
            hint = prov_code(pname)
        if not mname:
            continue
        price = _num(sh.cell_value(r, 5))   # col 5 = "Total"
        if price is None or price < 200:    # guards against stray non-price cells
            continue
        # Keep the raw name: MIVAU writes bilingual compounds like "Alcoi/Alcoy"
        # and the "/" has to survive as far as _variants() to be useful.
        rows.append((mname, hint, price))
        n = _num(sh.cell_value(r, 9)) if sh.ncols > 9 else None
        if n:
            tasaciones[c.norm_name(mname)] = n
    c.log(f"municipal table {sheet_name}: {len(rows)} municipalities with a price", 1)
    return rows, tasaciones, sheet_name


def parse_provincial():
    """Latest quarter of the provincial series -> {prov_code: eur/m2}."""
    raw = c.fetch(PROVINCIAL_XLS, binary=True, cache_key="mivau_35101000")
    wb = xlrd.open_workbook(file_contents=raw)
    sh = wb.sheet_by_name(wb.sheet_names()[-1])
    # col0 blank, col1 the province (or region, which we skip), then one column
    # per quarter -- BUT the last two columns are "Variacion trimestral/anual",
    # percentages rather than prices. Walking right from the end without
    # excluding them silently returns 13.9 instead of 2315.7.
    last_price_col = sh.ncols
    for r in range(min(20, sh.nrows)):
        for col in range(sh.ncols):
            if "variaci" in c.strip_accents(str(sh.cell_value(r, col))).lower():
                last_price_col = min(last_price_col, col)
    c.log(f"provincial: price columns are 2..{last_price_col - 1} "
          f"(cols {last_price_col}+ are percentage changes)", 1)

    out = {}
    for r in range(sh.nrows):
        code = prov_code(str(sh.cell_value(r, 1)).strip())
        if not code:
            continue
        # Walk right to the most recent quarter that actually has a price.
        for col in range(last_price_col - 1, 1, -1):
            v = _num(sh.cell_value(r, col))
            if v and v > 200:
                out[code] = v
                break
    c.log(f"provincial table: {len(out)}/52 provinces", 1)
    return out


def run():
    c.log("stage: prices")
    munis = c.read_stage("places")
    climate = c.read_stage("climate")
    access = c.read_stage("access")
    terrain = c.read_stage("terrain")

    muni_rows, tasa, quarter = parse_municipal()
    prov_px = parse_provincial()
    national = float(np.median(list(prov_px.values()))) if prov_px else 1800.0

    # --- match observed prices onto INE codes ----------------------------------
    # Joined on the normalised name, using the (unreliable) province label only
    # to break ties. Because this table lists nothing under 25,000 inhabitants,
    # falling back to the most populous candidate is almost always right.
    #
    # The two sources disagree on names constantly: GeoNames writes "Seville"
    # and "Gijon/Xixon", MIVAU writes "Sevilla" and "Gijon" (and misspells
    # Gramenet). So each municipality is indexed under every spelling we can
    # derive -- both halves of a bilingual compound, the GeoNames alternate
    # names, and a form with the "de/del" connectors dropped.
    primary, secondary = {}, {}

    def add(idx, key, m):
        if key:
            idx.setdefault(key, []).append(m)

    for m in munis:
        add(primary, c.norm_name(m["name"]), m)
        for variant in _variants(m["name"], m.get("alt", [])):
            add(secondary, variant, m)

    observed, n_tasa, unmatched = {}, {}, []
    for raw, hint, price in muni_rows:
        key = c.norm_name(raw)
        cands = primary.get(key) or secondary.get(key) or []
        if not cands:
            # Try the price table's own name variants against both indexes.
            for v in _variants(raw, []):
                cands = primary.get(v) or secondary.get(v) or []
                if cands:
                    break
        if not cands:
            unmatched.append(key)
            continue
        if len(cands) == 1:
            best = cands[0]
        else:
            same_prov = [m for m in cands if m["provCode"] == hint]
            best = same_prov[0] if same_prov else max(cands, key=lambda m: m["pop"])
        observed[best["id"]] = price
        if key in tasa:
            n_tasa[best["id"]] = tasa[key]

    c.log(f"matched {len(observed)} of {len(muni_rows)} priced municipalities to INE codes", 1)
    if unmatched:
        c.log(f"unmatched names ({len(unmatched)}): {', '.join(unmatched[:8])}"
              + (" ..." if len(unmatched) > 8 else ""), 1)

    # --- features ---------------------------------------------------------------
    def feats(m):
        ine = m["id"]
        cl, ac, te = climate[ine], access[ine], terrain[ine]
        coast = min(te["coastKm"] or 300.0, 300.0)
        return [
            1.0,
            np.log(max(m["pop"], 100)),
            np.log(coast + 1.0),
            np.log((ac["city100kKm"] or 200.0) + 1.0),
            ac["airportScore"],
            cl["daysOver30"] / 50.0,
            (te["maxElev25km"] or 0.0) / 1000.0,
        ]

    X_all = np.array([feats(m) for m in munis])
    prov_base = np.array(
        [prov_px.get(m["provCode"] or "", national) for m in munis], dtype=np.float64
    )

    idx = [j for j, m in enumerate(munis) if m["id"] in observed]
    y = np.log(np.array([observed[munis[j]["id"]] for j in idx]) / prov_base[idx])
    X = X_all[idx]

    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    pred = X @ beta
    ss_res = float(np.sum((pred - y) ** 2))
    ss_tot = float(np.sum((y - y.mean()) ** 2))
    r2 = 1 - ss_res / ss_tot if ss_tot else float("nan")
    resid_sd = float(np.std(pred - y))
    c.log(f"ratio model fitted on {len(idx)} towns: R2={r2:.3f}, "
          f"residual sd={np.exp(resid_sd) - 1:.1%}", 1)

    ratio_all = np.clip(np.exp(X_all @ beta), *RATIO_CLAMP)
    modelled = ratio_all * prov_base

    bands, es_band, es_span = country_bands(
        munis, X_all, beta, observed, prov_base, national
    )
    if es_band is not None:
        c.log(f"country-tier band measured on Spain: +/-{es_band:.0%} over {es_span:.0f} km "
              f"of spread (what a national average costs you where the truth is known)", 1)
        wide = sorted(bands.items(), key=lambda kv: -kv[1])[:5]
        tight = sorted(bands.items(), key=lambda kv: kv[1])[:5]
        c.log("widest: " + ", ".join(f"{k} +/-{v:.0%}" for k, v in wide), 1)
        c.log("tightest: " + ", ".join(f"{k} +/-{v:.0%}" for k, v in tight), 1)

    rows = {}
    for j, m in enumerate(munis):
        ine = m["id"]
        if m["country"] != "ES":
            # No municipal series exists for the rest of Europe. Anchor on the
            # national average and let the Spain-fitted ratio model supply the
            # within-country gradient -- "bigger, coastal, near an airport costs
            # more" holds everywhere, even where the magnitude does not transfer
            # exactly. Tagged `country` so the UI can say what this really is.
            base = COUNTRY_EUR_M2.get(m["country"])
            if base is None:
                continue
            ratio = float(np.clip(np.exp(X_all[j] @ beta), *COUNTRY_RATIO_CLAMP))
            rows[ine] = {
                "eurM2": round(base * ratio),
                "priceSource": "country",
                "priceBand": bands.get(m["country"], PRICE_BAND["country"]),
                "priceQuarter": quarter,
                "valuations": None,
                "provincialEurM2": base,
            }
            continue
        if ine in observed:
            rows[ine] = {
                "eurM2": round(observed[ine]),
                "priceSource": "observed",
                "priceBand": PRICE_BAND["observed"],
                "priceQuarter": quarter,
                "valuations": int(n_tasa.get(ine, 0)) or None,
                "provincialEurM2": round(prov_base[j]),
            }
        elif m["provCode"] in prov_px:
            rows[ine] = {
                "eurM2": round(float(modelled[j])),
                "priceSource": "modelled",
                "priceBand": PRICE_BAND["modelled"],
                "priceQuarter": quarter,
                "valuations": None,
                "provincialEurM2": round(prov_base[j]),
            }
        else:
            rows[ine] = {
                "eurM2": round(prov_base[j]),
                "priceSource": "provincial",
                "priceBand": PRICE_BAND["provincial"],
                "priceQuarter": quarter,
                "valuations": None,
                "provincialEurM2": round(prov_base[j]),
            }

    tiers = {}
    for r in rows.values():
        tiers[r["priceSource"]] = tiers.get(r["priceSource"], 0) + 1
    n_obs, n_mod = tiers.get("observed", 0), tiers.get("modelled", 0)
    c.log("provenance: " + ", ".join(f"{v} {k}" for k, v in sorted(tiers.items())), 1)

    # The typical error on a modelled price is the single most important caveat
    # in this dataset, so it travels with the data rather than living in a log.
    c.write_stage("prices_meta", {
        "quarter": quarter,
        "observed": n_obs,
        "modelled": n_mod,
        "provincialFallback": len(rows) - n_obs - n_mod,
        "modelR2": round(float(r2), 3),
        "modelErrorPct": round(float(np.exp(resid_sd) - 1) * 100, 1),
        "fittedOn": len(idx),
    })
    c.write_stage("prices", rows)

    c.log("price sanity (eur/m2, latest quarter " + quarter + "):", 1)
    for ine, label in (("48020", "Bilbao"), ("20069", "Donostia"), ("27028", "Lugo"),
                       ("32054", "Ourense"), ("24089", "Leon"), ("39075", "Santander"),
                       ("28079", "Madrid")):
        r = rows.get(ine)
        if r:
            c.log(f"  {label:<10} {r['eurM2']:>6} EUR/m2  [{r['priceSource']}]  "
                  f"province avg {r['provincialEurM2']}", 1)
    return rows


if __name__ == "__main__":
    run()
