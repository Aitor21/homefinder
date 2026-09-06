"""Stage 8 -- broadband speed, from Ookla's open Speedtest tiles.

For someone who works from home this is not a lifestyle nicety, it is the thing
that decides whether a place is viable at all. Numbeo does not measure it;
Ookla publishes real aggregated results under an open licence, at zoom-16 tiles
of roughly 600 m.

Each tile carries the mean download speed of every test taken inside it that
quarter, plus a test count. Places are matched to every tile within a radius and
the tiles are combined **weighted by test count**, so a single test from one
mobile hotspot cannot outvote a thousand from a real neighbourhood.

Caveats worth keeping in mind:
  * Speedtest results are self-selected. People test when the connection feels
    wrong, which biases downward, and they test on the best line in the house,
    which biases upward. Treat it as "what is actually achievable here", not as
    an advertised headline figure.
  * A rural tile may rest on very few tests. `netTests` is emitted alongside the
    speed so a thin sample is visible rather than hidden.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pyarrow.parquet as pq

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import common as c  # noqa: E402

# Ookla publishes quarterly. Fixed broadband, not mobile.
OOKLA_URL = (
    "https://ookla-open-data.s3.amazonaws.com/parquet/performance/"
    "type%3Dfixed/year%3D2025/quarter%3D1/2025-01-01_performance_fixed_tiles.parquet"
)
OOKLA_FILE = "ookla_fixed_2025Q1.parquet"

# The window follows the place table rather than being fixed to it. It was
# hardcoded to Europe plus Asia, so when the Americas were added 8,218 places
# silently came back with no broadband figure at all. PAD covers the search
# radius below, since a town near the edge still needs tiles beyond it.
BOUNDS_PAD = 1.0

# Tiles are ~600 m; a town's connectivity is best described by its
# neighbourhood, not its exact centroid pixel.
RADIUS_KM = 6.0
# Coarse bucket for the spatial index. 0.05 deg is ~5.5 km, so a place's tiles
# live in its own bucket or one of the eight around it.
BUCKET = 0.05


def run():
    c.log("stage: internet")
    places = c.read_stage("places")
    path = c.fetch_file(OOKLA_URL, OOKLA_FILE, expect_min_bytes=100_000_000)

    f = pq.ParquetFile(path)
    c.log(f"{f.metadata.num_rows:,} global tiles in {f.metadata.num_row_groups} row groups", 1)

    m_lat = np.array([m["lat"] for m in places])
    m_lon = np.array([m["lon"] for m in places])
    lat_lo = float(np.min(m_lat)) - BOUNDS_PAD
    lat_hi = float(np.max(m_lat)) + BOUNDS_PAD
    lon_lo = float(np.min(m_lon)) - BOUNDS_PAD
    lon_hi = float(np.max(m_lon)) + BOUNDS_PAD

    lats, lons, down, up, tests = [], [], [], [], []
    for g in range(f.metadata.num_row_groups):
        t = f.read_row_group(
            g, columns=["tile_x", "tile_y", "avg_d_kbps", "avg_u_kbps", "tests"]
        )
        x = t.column("tile_x").to_numpy()
        y = t.column("tile_y").to_numpy()
        keep = (y >= lat_lo) & (y <= lat_hi) & (x >= lon_lo) & (x <= lon_hi)
        if not keep.any():
            continue
        lons.append(x[keep])
        lats.append(y[keep])
        down.append(t.column("avg_d_kbps").to_numpy()[keep])
        up.append(t.column("avg_u_kbps").to_numpy()[keep])
        tests.append(t.column("tests").to_numpy()[keep])

    t_lat = np.concatenate(lats)
    t_lon = np.concatenate(lons)
    t_down = np.concatenate(down).astype(np.float64)
    t_up = np.concatenate(up).astype(np.float64)
    t_n = np.concatenate(tests).astype(np.float64)
    c.log(f"{len(t_lat):,} tiles inside the region "
          f"(lat {t_lat.min():.1f}..{t_lat.max():.1f}, lon {t_lon.min():.1f}..{t_lon.max():.1f})", 1)

    # --- bucket index ----------------------------------------------------------
    keys = (np.floor(t_lat / BUCKET).astype(np.int64) << 32) + np.floor(
        t_lon / BUCKET
    ).astype(np.int64)
    order = np.argsort(keys, kind="stable")
    keys = keys[order]
    t_lat, t_lon, t_down, t_up, t_n = (
        t_lat[order], t_lon[order], t_down[order], t_up[order], t_n[order]
    )
    uniq, starts = np.unique(keys, return_index=True)
    ends = np.append(starts[1:], len(keys))
    index = {int(k): (int(s), int(e)) for k, s, e in zip(uniq, starts, ends)}
    c.log(f"{len(index):,} occupied buckets of {BUCKET} deg", 1)

    rows = {}
    hit = 0
    for p in places:
        by = int(np.floor(p["lat"] / BUCKET))
        bx = int(np.floor(p["lon"] / BUCKET))
        sel_lat, sel_lon, sel_d, sel_u, sel_n = [], [], [], [], []
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                span = index.get(((by + dy) << 32) + (bx + dx))
                if span is None:
                    continue
                s, e = span
                sel_lat.append(t_lat[s:e]); sel_lon.append(t_lon[s:e])
                sel_d.append(t_down[s:e]); sel_u.append(t_up[s:e]); sel_n.append(t_n[s:e])
        if not sel_lat:
            rows[p["id"]] = {"netDownMbps": None, "netUpMbps": None, "netTests": 0}
            continue

        la = np.concatenate(sel_lat); lo = np.concatenate(sel_lon)
        d = c.haversine(p["lat"], p["lon"], la, lo)
        near = d <= RADIUS_KM
        if not near.any():
            rows[p["id"]] = {"netDownMbps": None, "netUpMbps": None, "netTests": 0}
            continue

        w = np.concatenate(sel_n)[near]
        dn = np.concatenate(sel_d)[near]
        upl = np.concatenate(sel_u)[near]
        wsum = w.sum()
        rows[p["id"]] = {
            # kbps -> Mbps, weighted by how many tests each tile represents.
            "netDownMbps": round(float((dn * w).sum() / wsum) / 1000.0, 1),
            "netUpMbps": round(float((upl * w).sum() / wsum) / 1000.0, 1),
            "netTests": int(wsum),
        }
        hit += 1

    c.write_stage("internet", rows)
    c.log(f"broadband resolved for {hit}/{len(places)} places", 1)

    c.log("internet sanity (Mbps down / up, test count):", 1)
    for pid, label in (("ES-48020", "Bilbao"), ("ES-27028", "Lugo"), ("ES-28079", "Madrid"),
                       ("RO-683844", "Brasov"), ("JP-2128295", "Sapporo")):
        r = rows.get(pid)
        if r and r["netDownMbps"] is not None:
            c.log(f"  {label:<9} {r['netDownMbps']:>7.1f} down /{r['netUpMbps']:>7.1f} up  "
                  f"({r['netTests']:,} tests)", 1)
    vals = [r["netDownMbps"] for r in rows.values() if r["netDownMbps"]]
    if vals:
        c.log(f"  across {len(vals):,} places: median {np.median(vals):.0f} Mbps, "
              f"p10 {np.percentile(vals, 10):.0f}, p90 {np.percentile(vals, 90):.0f}", 1)
    return rows


if __name__ == "__main__":
    run()
