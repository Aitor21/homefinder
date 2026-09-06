"""Final stage -- merge every stage into the single file the web app reads.

The web app makes no network calls of its own at runtime: it loads this one
document and does everything else in the browser. That keeps it fast, keeps it
working offline, and means no upstream outage can ever break the UI.

Encoding: columnar, not row-per-object. With 18k places and ~50 fields, repeating
every key in every row costs more than the data itself -- row objects come to
~22 MB, columns to about a third of that. Low-cardinality strings (country,
province, price tier, airport code) are dictionary-encoded on top, which takes
another large bite. The browser rehydrates into objects on load, so nothing
downstream has to know.
"""
from __future__ import annotations

import gzip
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import common as c  # noqa: E402
import countries as co  # noqa: E402
import developers as dv  # noqa: E402

STAGES = ("climate", "access", "amenities", "terrain", "prices",
          "airquality", "internet", "costs")

PLACE_FIELDS = ("id", "name", "country", "countryName", "continent", "ownership",
                "residence", "province", "ccaa", "lat", "lon", "pop", "elev")

# Few distinct values, repeated 18k times: worth an index table.
DICT_FIELDS = ("country", "countryName", "continent", "ownership", "residence",
               "province", "ccaa", "priceSource",
               "source", "airportName", "hubName", "city100kName", "priceQuarter")


def _self_check(doc, rows):
    """Decode the columnar document back and compare against the rows.

    The browser has its own decoder in web/src/data.ts. Two implementations of
    one format in two languages cannot be shared, so the encoder verifies itself
    here instead: a silent encoding bug would otherwise reach the UI as
    plausible but wrong numbers.
    """
    n, dct, cols = doc["n"], doc["dict"], doc["cols"]
    if n != len(rows):
        raise SystemExit(f"emit: encoded {n} rows but had {len(rows)}")

    step = max(1, n // 200)
    for i in range(0, n, step):
        for k, col in cols.items():
            v = col[i]
            table = dct.get(k)
            decoded = table[v] if (table is not None and isinstance(v, int)) else v
            if decoded != rows[i].get(k):
                raise SystemExit(
                    f"emit: row {i} field {k!r} decoded as {decoded!r}, "
                    f"expected {rows[i].get(k)!r}"
                )
    c.log(f"self-check: {len(range(0, n, step))} sampled rows decode back exactly", 1)


def run():
    c.log("stage: emit")
    places = c.read_stage("places")
    parts = {}
    for s in STAGES:
        try:
            parts[s] = c.read_stage(s)
        except SystemExit:
            c.warn(f"stage '{s}' missing -- its fields will be absent")
            parts[s] = {}

    rows = []
    n_sub = 0
    for m in places:
        # Districts of a larger city duplicate their parent's climate and carry a
        # national-average price that is badly wrong for a capital suburb.
        if m.get("suburb"):
            n_sub += 1
            continue
        pid = m["id"]
        row = {k: m[k] for k in PLACE_FIELDS}
        for s in STAGES:
            row.update(parts[s].get(pid, {}))
        rows.append(row)

    if n_sub:
        c.log(f"dropped {n_sub} city districts (kept upstream so anchors stay stable)", 1)

    # A place with no price cannot be ranked, so drop it rather than ship a hole.
    before = len(rows)
    rows = [r for r in rows if r.get("eurM2") and r.get("hottestTmax") is not None]
    if before != len(rows):
        c.log(f"dropped {before - len(rows)} places with no price or climate", 1)

    keys = []
    for r in rows:
        for k in r:
            if k not in keys:
                keys.append(k)

    dicts, cols = {}, {}
    for k in keys:
        values = [r.get(k) for r in rows]
        if k in DICT_FIELDS:
            uniq = sorted({v for v in values if v is not None}, key=str)
            index = {v: i for i, v in enumerate(uniq)}
            dicts[k] = uniq
            cols[k] = [None if v is None else index[v] for v in values]
        else:
            cols[k] = values

    by_country = {}
    for r in rows:
        by_country[r["countryName"]] = by_country.get(r["countryName"], 0) + 1
    tiers = {}
    for r in rows:
        tiers[r.get("priceSource")] = tiers.get(r.get("priceSource"), 0) + 1

    doc = {
        "format": "columnar-1",
        "meta": {
            "built": time.strftime("%Y-%m-%d %H:%M"),
            "count": len(rows),
            "countries": dict(sorted(by_country.items(), key=lambda kv: -kv[1])),
            "priceTiers": tiers,
            "countryRules": co.notes_table(),
            # Who builds new homes where. Shipped once in meta rather than
            # per row: 21 developers against 31,538 places would be absurd.
            "developers": dv.table(),
            "priceQuarter": next(
                (r.get("priceQuarter") for r in rows if r.get("priceQuarter")), None
            ),
            "priceModel": (
                c.read_stage("prices_meta") if c.stage_exists("prices_meta") else None
            ),
            "sources": {
                "climate": "WorldClim 2.1 (2.5 arcmin) recalibrated to 2020-2024 ERA5",
                "geography": "GeoNames (ADM3 for Spain, cities5000 elsewhere)",
                "amenities": "OpenStreetMap via Overpass -- rail Europe-wide, rest Spain only",
                "airports": "OurAirports + published traffic figures",
                "prices": "MIVAU quarterly series for Spain; national averages elsewhere",
                "ownership": "Government and law-firm sources, checked Sep 2026; indicative, not legal advice",
                "developers": "Company sites and trade press, checked Sep 2026; every URL fetched",
                "airQuality": "CAMS reanalysis via Open-Meteo, four-month seasonal sample",
                "internet": "Ookla open Speedtest tiles, fixed broadband, 2025 Q1",
                "costOfLiving": "World Bank ICP price levels; energy from degree days",
            },
        },
        "n": len(rows),
        "dict": dicts,
        "cols": cols,
    }

    _self_check(doc, rows)

    out = c.WEB_DATA / "towns.json"
    out.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    raw_mb = out.stat().st_size / 1e6
    with gzip.open(str(out) + ".gz", "wt", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, separators=(",", ":"))
    gz_mb = Path(str(out) + ".gz").stat().st_size / 1e6

    c.log(f"{len(rows)} places, {len(keys)} fields", 1)
    c.log("countries: " + ", ".join(f"{k} {v}" for k, v in
                                    list(doc["meta"]["countries"].items())[:8]), 1)
    c.log("price tiers: " + ", ".join(f"{k} {v}" for k, v in sorted(tiers.items())), 1)
    c.log(f"wrote {out.name} ({raw_mb:.1f} MB, {gz_mb:.1f} MB gzipped)", 1)
    return doc


if __name__ == "__main__":
    run()
