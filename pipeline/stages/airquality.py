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


def run():
    c.log("stage: airquality")
    places = c.read_stage("places")

    cells = defaultdict(list)
    for p in places:
        cells[_cell(p["lat"], p["lon"])].append(p["id"])
    keys = sorted(cells)
    c.log(f"{len(places)} places -> {len(keys)} cells at {CELL} deg (~{CELL * 111:.0f} km)", 1)
    c.log(f"{len(SAMPLE_MONTHS)} sample months x {len(keys)} cells", 1)

    # cell -> list of monthly means, so each month weighs the same regardless of
    # how many hours the API happened to return.
    pm25 = defaultdict(list)

    store = _load_store()
    n_start = len(store)

    # The todo list is per MONTH, not per cell. A cell that already has January
    # but not April needs only April fetched, and batching it whole would spend
    # a seventh of a day's quota re-buying readings already on disk. Quota is
    # the binding constraint on this stage, so that matters.
    plan = []
    for start, end in SAMPLE_MONTHS:
        missing = [k for k in keys if _skey(k, start) not in store]
        for i in range(0, len(missing), BATCH):
            plan.append((start, end, missing[i : i + BATCH]))
        c.log(f"{start[:7]}: {len(keys) - len(missing)} cells cached, "
              f"{len(missing)} to fetch", 1)

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
    for cell in keys:
        vals = [store[_skey(cell, st)] for st, _ in SAMPLE_MONTHS
                if _skey(cell, st) in store]
        if len(vals) >= MIN_MONTHS:
            pm25[cell] = vals

    rows = {}
    missing = 0
    for cell, ids in cells.items():
        v25 = pm25.get(cell)
        if not v25:
            missing += 1
            for pid in ids:
                rows[pid] = {"pm25": None, "pm25VsWho": None, "pm25Months": 0}
            continue
        mean25 = float(np.mean(v25))
        for pid in ids:
            rows[pid] = {
                "pm25": round(mean25, 1),
                "pm25Months": len(v25),
                # How many times the WHO annual guideline this is.
                "pm25VsWho": round(mean25 / WHO_GUIDELINE, 1),
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
