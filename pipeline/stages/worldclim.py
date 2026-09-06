"""Stage 2a -- monthly climate normals per municipality, from WorldClim 2.1.

Why not Open-Meteo for this: measured, one request covering 10 locations x 10
years x 4 variables consumes Open-Meteo's entire 600-unit minute budget (weight
is roughly vars x locations x days / 100). Full national coverage would need
~400k units against a 10k/day cap -- about 40 days. WorldClim is a single bulk
download at 2.5 arcmin (~4.6 km, finer than ERA5-Land's ~9 km), with no API
limits at all, and it generalises to any country for free.

Its one weakness is the 1970-2000 baseline, which is now materially cooler than
the present. Stage 2b (climate.py) corrects that against real recent daily data.

Variables sampled: tmin, tmax, prec, vapr (vapour pressure -> humidity),
srad (solar radiation -> a sunshine proxy), elev.
"""
from __future__ import annotations

import sys
import zipfile
from pathlib import Path

import numpy as np
import tifffile

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import common as c  # noqa: E402

BASE = "https://geodata.ucdavis.edu/climate/worldclim/2_1/base/"
RES = "2.5m"
VARS = ("tmin", "tmax", "prec", "vapr", "srad")

# WorldClim ships float32 rasters with a -3.4e38 fill, but the elevation raster
# is int16 with a -32768 fill. One threshold catches both, and no real value of
# any variable here (deg C, mm, kPa, kJ, m) ever goes near it.
NODATA = -9999.0


def _geotransform(page):
    """Pull (origin_lon, origin_lat, scale_x, scale_y) out of the GeoTIFF tags.

    Reading the tags beats assuming a global -180/90 origin: it means this code
    keeps working if WorldClim ever ships a cropped or reprojected product.
    """
    tags = page.tags
    tie = tags.get("ModelTiepointTag")
    scale = tags.get("ModelPixelScaleTag")
    if tie is None or scale is None:
        # Documented WorldClim layout: global, 1/24 degree at 2.5 arcmin.
        h, w = page.shape
        return -180.0, 90.0, 360.0 / w, 180.0 / h
    tv, sv = tie.value, scale.value
    return float(tv[3]), float(tv[4]), float(sv[0]), float(sv[1])


def _sample(arr, gt, lats, lons):
    ox, oy, sx, sy = gt
    col = np.clip(((lons - ox) / sx).astype(np.int64), 0, arr.shape[1] - 1)
    row = np.clip(((oy - lats) / sy).astype(np.int64), 0, arr.shape[0] - 1)
    v = arr[row, col].astype(np.float64)
    v[v < NODATA] = np.nan
    return v


def _sample_with_fallback(arr, gt, lats, lons, radius=3):
    """Sample, then repair NaNs from the nearest valid neighbour.

    Coastal municipality centroids land in a sea pixel often enough to matter --
    WorldClim only has values over land. Widening the search a few pixels fixes
    it without distorting anything inland.
    """
    v = _sample(arr, gt, lats, lons)
    bad = np.isnan(v)
    if not bad.any():
        return v

    ox, oy, sx, sy = gt
    for i in np.where(bad)[0]:
        col = int(np.clip((lons[i] - ox) / sx, 0, arr.shape[1] - 1))
        row = int(np.clip((oy - lats[i]) / sy, 0, arr.shape[0] - 1))
        best = np.nan
        for r in range(1, radius + 1):
            win = arr[
                max(0, row - r) : row + r + 1,
                max(0, col - r) : col + r + 1,
            ].astype(np.float64)
            win[win < NODATA] = np.nan
            if np.isfinite(win).any():
                best = float(np.nanmean(win))
                break
        v[i] = best
    return v


def run():
    c.log("stage: worldclim (monthly normals)")
    munis = c.read_stage("places")
    lats = np.array([m["lat"] for m in munis])
    lons = np.array([m["lon"] for m in munis])

    out = {m["id"]: {} for m in munis}

    # Elevation first -- needed to correct WorldClim's grid-cell elevation
    # against each town's real elevation.
    zp = c.fetch_file(BASE + f"wc2.1_{RES}_elev.zip", f"wc2.1_{RES}_elev.zip", 1_000_000)
    with zipfile.ZipFile(zp) as z:
        name = [n for n in z.namelist() if n.endswith(".tif")][0]
        with tifffile.TiffFile(z.open(name)) as tf:
            page = tf.pages[0]
            gt = _geotransform(page)
            arr = page.asarray()
            grid_elev = _sample_with_fallback(arr, gt, lats, lons)
            c.log(f"elev raster {arr.shape} gt={tuple(round(x, 4) for x in gt)}", 1)
            del arr

    for var in VARS:
        zp = c.fetch_file(BASE + f"wc2.1_{RES}_{var}.zip", f"wc2.1_{RES}_{var}.zip", 10_000_000)
        with zipfile.ZipFile(zp) as z:
            tifs = sorted(n for n in z.namelist() if n.endswith(".tif"))
            if len(tifs) != 12:
                raise SystemExit(f"{var}: expected 12 monthly rasters, got {len(tifs)}")
            cols = []
            for n in tifs:
                with tifffile.TiffFile(z.open(n)) as tf:
                    page = tf.pages[0]
                    gt = _geotransform(page)
                    arr = page.asarray()
                    cols.append(_sample_with_fallback(arr, gt, lats, lons))
                    del arr
        mat = np.vstack(cols)  # 12 x n_munis
        for j, m in enumerate(munis):
            out[m["id"]][var] = [
                None if not np.isfinite(x) else round(float(x), 2) for x in mat[:, j]
            ]
        c.log(f"{var}: sampled 12 months at {len(munis)} points", 1)

    for j, m in enumerate(munis):
        out[m["id"]]["gridElev"] = (
            None if not np.isfinite(grid_elev[j]) else round(float(grid_elev[j]), 1)
        )

    missing = sum(1 for v in out.values() if v.get("tmax") is None or v["tmax"][7] is None)
    c.log(f"municipalities with no August tmax after repair: {missing}", 1)

    c.write_stage("worldclim", out)

    c.log("worldclim sanity (August tmax / tmin, 1970-2000 baseline):", 1)
    for ine, label in (("ES-48020", "Bilbao"), ("ES-41091", "Sevilla"), ("ES-27028", "Lugo"),
                       ("ES-09059", "Burgos"), ("ES-46250", "Valencia")):
        r = out.get(ine)
        if r and r["tmax"][7] is not None:
            c.log(f"  {label:<9} augTmax={r['tmax'][7]:>5.1f}  augTmin={r['tmin'][7]:>5.1f}  "
                  f"annualPrec={sum(x for x in r['prec'] if x):>5.0f}mm  gridElev={r['gridElev']}m", 1)
    return out


if __name__ == "__main__":
    run()
