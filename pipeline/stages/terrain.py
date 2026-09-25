"""Stage 5 -- terrain: coast, relief and mountains.

Coast distance comes free from the WorldClim elevation raster: it is a land-only
product, so its nodata mask *is* the sea. No coastline download needed, and it
works for the whole continent rather than one country. At 2.5 arcmin it is
accurate to about 5 km, which is the right precision for a screener and is
validated against known distances below.

Relief (how much the land rises within 25 km) is what tells you whether real
mountains are on the doorstep, and it is a far better signal than the town's own
elevation -- a valley floor at 300 m under a 2,000 m wall scores as mountainous,
which is exactly right.
"""
from __future__ import annotations

import sys
import zipfile
from pathlib import Path

import numpy as np
import tifffile

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import common as c  # noqa: E402
import boxes  # noqa: E402
from worldclim import BASE, NODATA, RES, _geotransform  # noqa: E402

# Beaches, ski areas and protected land, fetched box by box. A single
# continent-sized query for any of them times out, which is why an earlier
# version kept them to Iberia; split up they complete fine, the same way the
# transit layers do. Coast distance, elevation and relief still come from the
# DEM and need no query at all.

# Window for "what is around me", in km.
RELIEF_RADIUS_KM = 25.0


def _in_boxes(lat, lon, boxlist):
    """Vectorised: is each place inside any of these "s,w,n,e" boxes?"""
    inside = np.zeros(len(lat), dtype=bool)
    for box in boxlist:
        s0, w0, n0, e0 = (float(v) for v in box.split(","))
        inside |= (lat >= s0) & (lat <= n0) & (lon >= w0) & (lon <= e0)
    return inside


# Protected nature: national parks, protected areas of IUCN class 1 to 5, and
# nature reserves.
#
# The first version asked only for protected-area WAYS plus national-park
# relations, and most protected land is mapped as relations. It put Madrid
# 115 km from anything protected, with the Guadarrama national park 50 km up the
# road, and Bilbao 70 km out with Gorbeia on the horizon. The same query also
# took each area as its centre point, which is the wrong question: the middle of
# a 60 km park is not where you walk the dog, its edge is.
PARK_FRAGS = [
    'way[boundary=protected_area]["protect_class"~"^[1-5]$"]',
    'relation[boundary=protected_area]["protect_class"~"^[1-5]$"]',
    "way[boundary=national_park]",
    "relation[boundary=national_park]",
    "way[leisure=nature_reserve]",
    "relation[leisure=nature_reserve]",
]
# Areas wider than this across are marine reserves or administrative giants
# (the Great Barrier Reef Marine Park is 2,000 km long). Kept, they would put
# every town on a long stretch of coast "inside" protected nature.
PARK_MAX_DIAG_KM = 300.0
# Below this inscribed radius an area is treated as a point, which the gridded
# search handles; the few larger ones are brute-forced with their radius.
PARK_POINT_KM = 5.0
KM_PER_DEG = np.pi * c.EARTH_R_KM / 180.0


def _areas(cache_key, bbox):
    q = ("[out:json][timeout:900];("
         + "".join(f"{f}({bbox});" for f in PARK_FRAGS)
         + ");out ids bb qt;")
    data = c.overpass(q, cache_key=cache_key)
    out = [(b["minlat"], b["minlon"], b["maxlat"], b["maxlon"])
           for e in data["elements"] if (b := e.get("bounds"))]
    return np.array(out, dtype=np.float64).reshape(-1, 4)


def nature_km(lats, lons):
    """Distance to the nearest protected area's edge, approximately, and a mask
    of which places were inside a box that actually answered.

    Each area is its bounding box, reduced to the circle inscribed in it. That
    circle is deliberately the conservative choice: a thin diagonal reserve has
    a large box but a small inscribed circle, so it is never credited with land
    it does not cover.
    """
    answered, parts = [], []
    for key, bbox in boxes.worldwide().items():
        try:
            a = _areas(f"osm_nature_{key}_v1", bbox)
        except Exception as exc:  # noqa: BLE001
            c.warn(f"nature/{key} failed ({type(exc).__name__}) -- null inside this box")
            continue
        answered.append(bbox)
        parts.append(a)
        c.log(f"nature/{key}: {len(a)} areas", 1)
    surveyed = _in_boxes(lats, lons, answered)
    if not parts or not sum(len(p) for p in parts):
        return np.full(len(lats), np.inf), surveyed

    A = np.concatenate(parts)
    clat = (A[:, 0] + A[:, 2]) / 2
    clon = (A[:, 1] + A[:, 3]) / 2
    half_h = (A[:, 2] - A[:, 0]) / 2 * KM_PER_DEG
    half_w = (A[:, 3] - A[:, 1]) / 2 * KM_PER_DEG * np.cos(np.radians(clat))
    diag = 2 * np.hypot(half_h, half_w)
    # A negative width is a box that crosses the date line; rare enough to drop.
    keep = (half_w >= 0) & (half_h >= 0) & (diag <= PARK_MAX_DIAG_KM)
    clat, clon = clat[keep], clon[keep]
    rad = np.minimum(half_h, half_w)[keep]
    c.log(f"nature: {int(keep.sum())} areas kept of {len(A)} "
          f"({int((~keep).sum())} marine or continental-scale dropped)", 1)

    small = rad <= PARK_POINT_KM
    d, i = c.nearest_grid(lats, lons, clat[small], clon[small])
    est = np.where(i >= 0, d - rad[small][np.maximum(i, 0)], np.inf)
    blat, blon, brad = clat[~small], clon[~small], rad[~small]
    if len(blat):
        for s in range(0, len(lats), 256):
            e = s + 256
            dd = c.haversine(lats[s:e, None], lons[s:e, None], blat[None, :], blon[None, :])
            est[s:e] = np.minimum(est[s:e], (dd - brad[None, :]).min(axis=1))
    return np.maximum(est, 0.0), surveyed


def run():
    c.log("stage: terrain")
    munis = c.read_stage("places")
    lats = np.array([m["lat"] for m in munis])
    lons = np.array([m["lon"] for m in munis])

    zp = c.fetch_file(BASE + f"wc2.1_{RES}_elev.zip", f"wc2.1_{RES}_elev.zip", 1_000_000)
    with zipfile.ZipFile(zp) as z:
        name = [n for n in z.namelist() if n.endswith(".tif")][0]
        with tifffile.TiffFile(z.open(name)) as tf:
            page = tf.pages[0]
            gt = _geotransform(page)
            arr = page.asarray()

    ox, oy, sx, sy = gt
    # The window follows the data. It used to be hardcoded to Europe plus Asia,
    # which silently gave every place outside that box a coast distance measured
    # against the wrong ocean, or none at all. PAD is generous because coast
    # distance has to be able to look well beyond the outermost town.
    PAD = 12.0
    lat_hi = min(90.0, float(lats.max()) + PAD)
    lat_lo = max(-90.0, float(lats.min()) - PAD)
    lon_lo = max(-180.0, float(lons.min()) - PAD)
    lon_hi = min(180.0, float(lons.max()) + PAD)
    r0 = int((oy - lat_hi) / sy)
    r1 = int((oy - lat_lo) / sy)
    c0 = int((lon_lo - ox) / sx)
    c1 = int((lon_hi - ox) / sx)
    sub = arr[r0:r1, c0:c1].astype(np.float64)
    del arr
    sub_oy = oy - r0 * sy
    sub_ox = ox + c0 * sx
    land = sub > NODATA   # -32768 fill over ocean
    c.log(f"cropped DEM {sub.shape} over lat {lat_lo:.0f}..{lat_hi:.0f}, "
          f"lon {lon_lo:.0f}..{lon_hi:.0f}, {land.mean() * 100:.0f}% land", 1)

    # --- distance to sea --------------------------------------------------------
    # Only sea pixels that touch land, i.e. the actual coastline. Using every
    # ocean pixel and thinning it instead leaves gaps of ~9 km, which puts a
    # beachfront town like Gijon 13 km from the sea. This is both more accurate
    # and a far smaller point set.
    sea = ~land
    coastline = sea & (
        np.roll(land, 1, 0) | np.roll(land, -1, 0) | np.roll(land, 1, 1) | np.roll(land, -1, 1)
    )
    sea_r, sea_c = np.where(coastline)
    sea_lat = sub_oy - (sea_r + 0.5) * sy
    sea_lon = sub_ox + (sea_c + 0.5) * sx
    c.log(f"{len(sea_lat)} coastline pixels (of {int(sea.sum())} sea pixels)", 1)
    coast_km, _ = c.nearest(lats, lons, sea_lat, sea_lon, chunk=64)

    # --- relief within a radius -------------------------------------------------
    elev = np.where(land, sub, np.nan)
    dr = int(round(RELIEF_RADIUS_KM / 111.0 / sy))
    max_elev = np.empty(len(munis))
    min_elev = np.empty(len(munis))
    for j in range(len(munis)):
        row = int((sub_oy - lats[j]) / sy)
        col = int((lons[j] - sub_ox) / sx)
        # Longitude degrees shrink with latitude; widen the column window to match.
        dc = max(1, int(round(dr / max(0.2, np.cos(np.radians(lats[j]))))))
        win = elev[max(0, row - dr): row + dr + 1, max(0, col - dc): col + dc + 1]
        if np.isfinite(win).any():
            max_elev[j] = np.nanmax(win)
            min_elev[j] = np.nanmin(win)
        else:
            max_elev[j] = min_elev[j] = np.nan

    # --- beaches and ski areas --------------------------------------------------
    def points(cache_key, frags, bbox=None):
        """(lat, lon, answered). A box that failed is not a box with nothing in it."""
        try:
            parts = "".join(f"{f}({bbox});\n " for f in frags)
            q = f"[out:json][timeout:600];\n({parts});\nout center;"
            data = c.overpass(q, cache_key=cache_key)
            lat, lon = [], []
            for e in data["elements"]:
                if "lat" in e:
                    lat.append(e["lat"]); lon.append(e["lon"])
                elif "center" in e:
                    lat.append(e["center"]["lat"]); lon.append(e["center"]["lon"])
            c.log(f"{cache_key}: {len(lat)} features", 1)
            return np.array(lat), np.array(lon), True
        except Exception as exc:  # noqa: BLE001
            c.warn(f"{cache_key} failed ({type(exc).__name__}) -- null inside this box")
            return np.array([]), np.array([]), False

    def world_points(name, frags):
        """One layer, every box, concatenated, with the places it can speak for.

        Surveyed worldwide, but still not everywhere: a place outside every box
        that answered gets null rather than the distance to the nearest feature
        in some other hemisphere. That is how Brasov was once told its closest
        ski resort was 2,146 km away in the Pyrenees.
        """
        lat_parts, lon_parts, answered = [], [], []
        for key, bbox in boxes.worldwide().items():
            a, b, ok = points(f"osm_{name}_{key}_v1", frags, bbox)
            if ok:
                answered.append(bbox)
            if len(a):
                lat_parts.append(a)
                lon_parts.append(b)
        lat = np.concatenate(lat_parts) if lat_parts else np.array([])
        lon = np.concatenate(lon_parts) if lon_parts else np.array([])
        c.log(f"{name}: {len(lat)} features across {len(answered)} boxes", 1)
        d, _ = c.nearest_grid(lats, lons, lat, lon)
        return d, _in_boxes(lats, lons, answered)

    beach_km, beach_ok = world_points("beach", ["node[natural=beach]", "way[natural=beach]"])
    ski_km, ski_ok = world_points("ski", ['way["landuse"="winter_sports"]',
                                          'node["landuse"="winter_sports"]'])
    park_km, park_ok = nature_km(lats, lons)
    surveyed = beach_ok & ski_ok & park_ok
    c.log(f"{int(surveyed.sum())} places inside every surveyed box, "
          f"{int((~surveyed).sum())} outside at least one", 1)

    def fin(x, nd=1):
        return None if not np.isfinite(x) else round(float(x), nd)

    rows = {}
    for j, m in enumerate(munis):
        rows[m["id"]] = {
            # DEM-derived, so correct across the whole continent.
            "coastKm": fin(coast_km[j]),
            "maxElev25km": fin(max_elev[j], 0),
            "relief25km": fin(max_elev[j] - min_elev[j], 0),
            # OpenStreetMap-derived. A beach here is any mapped beach: sea, lake
            # or river, which is why the coast score does not use it.
            "beachKm": fin(beach_km[j] * 1.25) if beach_ok[j] else None,
            "parkKm": fin(park_km[j] * 1.25) if park_ok[j] else None,
            "skiKm": fin(ski_km[j] * 1.25) if ski_ok[j] else None,
            "terrainPoisSurveyed": bool(surveyed[j]),
        }

    c.write_stage("terrain", rows)

    n_coast = sum(1 for r in rows.values() if r["coastKm"] is not None)
    c.log(f"coast distance resolved for {n_coast}/{len(rows)} municipalities", 1)

    def fmt(v, unit="km"):
        return "n/a" if v is None else f"{v:.0f}{unit}"

    c.log("terrain sanity (expected: Madrid ~300km inland, Bilbao ~5-10km, Gijon ~0-5km;"
          " protected nature within ~50 km of Madrid and ~25 km of Bilbao):", 1)
    for ine, label in (("ES-28079", "Madrid"), ("ES-48020", "Bilbao"), ("ES-33024", "Gijon"),
                       ("ES-27028", "Lugo"), ("ES-42173", "Soria"), ("ES-22190", "Jaca")):
        r = rows.get(ine)
        if r:
            c.log(f"  {label:<8} coast={fmt(r['coastKm']):>7}  maxElev25km={fmt(r['maxElev25km'], 'm'):>7}  "
                  f"relief={fmt(r['relief25km'], 'm'):>7}  ski={fmt(r['skiKm']):>7}  "
                  f"nature={fmt(r['parkKm']):>7}", 1)

    if n_coast == 0:
        c.warn("no coast distances resolved -- the DEM land mask is wrong")
    return rows


if __name__ == "__main__":
    run()
