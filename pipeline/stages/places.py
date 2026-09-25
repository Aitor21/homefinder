"""Stage 1 -- the place table, Spain in depth and the rest of the world coarser.

Two sources, because they answer different questions:

  * Spain uses GeoNames ADM3 rows, which *are* the municipalities and carry the
    5-digit INE code. That code is what lets the official price series join on,
    so it is worth keeping even though it only works for one country.
  * Everywhere else uses the global `cities5000` dump. Administrative levels are
    not comparable across countries -- a French commune is ADM4, an Italian
    comune ADM3, a German Gemeinde ADM4 -- so trying to match "municipality"
    country by country is a losing game. Populated places with a known
    population are the better unit anyway: they are where people actually live.

Which countries, and at what resolution, is decided by `pipeline/countries.py`.
Every fact about a country lives there: whether a Spanish passport grants the
right to live in it, whether a foreigner can actually acquire a home in it, and
the population floor that follows from both.

The one thing worth restating here is that ownership is a first-class field
rather than a footnote. Surfacing New Zealand towns someone legally cannot buy
in, or Thai villages where only a condominium is possible, would be worse than
useless. So the tier is carried on every row and the UI can filter on it.
"""
from __future__ import annotations

import io
import sys
import zipfile
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import common as c  # noqa: E402
import countries as co  # noqa: E402
from spain import PROVINCES  # noqa: E402

GEONAMES = "https://download.geonames.org/export/dump/"

# A neighbourhood is not a town. GeoNames tags most city districts as plain PPL
# -- Artane and Ballymun are "populated places" exactly like Kilkenny is -- so a
# feature-code filter does not catch them. Proximity to a far larger neighbour
# does: anything within DEDUPE_KM of a same-country place at least DEDUPE_RATIO
# times its size is a district of that place, not an alternative to it.
#
# The thresholds are set so genuine satellite towns survive: Alonsotegi is 123x
# smaller than Bilbao but 10 km away, so it stays. Artane is 5 km from Dublin
# centre, so it goes. Spain is exempt entirely -- it uses administrative
# municipalities, which are authoritative by construction.
DEDUPE_KM = 8.0
DEDUPE_RATIO = 8.0
PARENT_MIN_POP = 40_000

# Explicit "section of a populated place" -- always a district.
DROP_FEATURE_CODES = {"PPLX"}

# Overseas territories carry their own climate and are not what anyone means by
# "somewhere in Europe". French Guiana, Reunion, Martinique, Guadeloupe, Mayotte.
FR_OVERSEAS = {"GF", "RE", "MQ", "GP", "YT", "PM", "NC", "PF", "WF", "BL", "MF"}


# GeoNames writes -9999 in the `dem` column where it has no elevation, and that
# sentinel is poison downstream: fed to the lapse-rate correction it becomes a
# +65 C shift, and a single such place selected as a climate anchor corrupts the
# calibration for the whole continent. Anything outside physical bounds becomes
# None, and climate.py then falls back to the raster's own grid elevation.
ELEV_MIN, ELEV_MAX = -450, 5000


def _elev(primary, dem):
    for raw in (primary, dem):
        raw = (raw or "").strip()
        if raw.lstrip("-").isdigit():
            v = int(raw)
            if ELEV_MIN <= v <= ELEV_MAX:
                return v
    return None


def _admin1_names():
    """GeoNames admin1 code -> readable region name."""
    out = {}
    for line in c.fetch(GEONAMES + "admin1CodesASCII.txt").splitlines():
        p = line.split("\t")
        if len(p) >= 2:
            out[p[0]] = p[1]
    return out


def _open_zip(url, name, min_bytes):
    """Some GeoNames dumps arrive as raw deflate rather than a real zip."""
    path = c.fetch_file(url, name, min_bytes)
    data = path.read_bytes()
    try:
        return zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise SystemExit(f"{name} is not a zip; got {len(data)} bytes starting {data[:8]!r}")


def spanish_rows(admin1):
    """Spain, from the ADM3 dump, keeping the INE code for the price join."""
    z = _open_zip(GEONAMES + "ES.zip", "ES.zip", 1_000_000)
    txt = z.read("ES.txt").decode("utf-8")
    rows = []
    for line in txt.splitlines():
        p = line.split("\t")
        if len(p) < 19 or p[7] != "ADM3":
            continue
        ine = p[12]
        if not (len(ine) == 5 and ine.isdigit()):
            continue
        pop = int(p[14]) if p[14].isdigit() else 0
        if pop < co.ES_POP_FLOOR:
            continue
        province, ccaa = PROVINCES.get(ine[:2], ("?", "?"))
        rows.append(
            {
                "id": f"ES-{ine}",
                "ine": ine,
                "name": p[1],
                "alt": [a for a in p[3].split(",") if a and len(a) < 40][:12],
                "country": "ES",
                "countryName": "Spain",
                "continent": "Europe",
                "residence": "free",
                "ownership": "freehold",
                "provCode": ine[:2],
                "province": province,
                "ccaa": ccaa,
                "lat": round(float(p[4]), 5),
                "lon": round(float(p[5]), 5),
                "pop": pop,
                "elev": _elev(p[15], p[16]),
                # IANA zone, e.g. "Europe/Madrid". The browser turns it into an
                # offset from the user's own clock, which is the number a remote
                # worker actually cares about and one no stored offset could be,
                # since daylight saving moves on different dates in different zones.
                "tz": p[17] or None,
            }
        )
    return rows


def world_rows(admin1):
    """Everywhere except Spain, from the global populated-place dump.

    One pass over the file for every country in the registry. The population
    floor is per-country and comes from the registry too, so the resolution
    argument lives in exactly one place instead of being restated per region.
    """
    z = _open_zip(GEONAMES + "cities5000.zip", "cities5000.zip", 1_000_000)
    txt = z.read("cities5000.txt").decode("utf-8")
    rows = []
    for line in txt.splitlines():
        p = line.split("\t")
        if len(p) < 19:
            continue
        cc = p[8]
        if cc == "ES" or cc not in co.COUNTRIES:
            continue
        if p[7] in DROP_FEATURE_CODES:
            continue
        a1 = p[10]
        if cc == "FR" and a1 in FR_OVERSEAS:
            continue
        pop = int(p[14]) if p[14].isdigit() else 0
        if pop < co.pop_floor(cc):
            continue
        region = admin1.get(f"{cc}.{a1}", "")
        cname = co.name(cc)
        rows.append(
            {
                "id": f"{cc}-{p[0]}",
                "ine": None,
                "name": p[1],
                "alt": [a for a in p[3].split(",") if a and len(a) < 40][:6],
                "country": cc,
                "countryName": cname,
                "continent": co.continent(cc),
                "residence": co.residence(cc),
                "ownership": co.ownership(cc),
                "provCode": None,
                "province": region or cname,
                "ccaa": region or cname,
                "lat": round(float(p[4]), 5),
                "lon": round(float(p[5]), 5),
                "pop": pop,
                "elev": _elev(p[15], p[16]),
                "tz": p[17] or None,
            }
        )
    return rows


def mark_suburbs(rows):
    """Flag places that are really districts of a much larger neighbour.

    Flagged rather than deleted: the later stages key on id, so keeping the rows
    means the climate anchor selection -- and its expensive cached fetches --
    stays byte-identical. emit.py drops them at the end.
    """
    idx = [i for i, r in enumerate(rows) if r["country"] != "ES"]
    if not idx:
        return 0
    lat = np.array([r["lat"] for r in rows])
    lon = np.array([r["lon"] for r in rows])
    pop = np.array([r["pop"] for r in rows], dtype=np.float64)
    cc = np.array([r["country"] for r in rows])

    parents = np.where(pop >= PARENT_MIN_POP)[0]
    if not len(parents):
        return 0

    n_marked = 0
    CH = 1024
    for s0 in range(0, len(idx), CH):
        chunk = np.array(idx[s0 : s0 + CH])
        d = c.haversine(lat[chunk][:, None], lon[chunk][:, None],
                        lat[parents][None, :], lon[parents][None, :])
        big = pop[parents][None, :] >= DEDUPE_RATIO * pop[chunk][:, None]
        same = cc[parents][None, :] == cc[chunk][:, None]
        hit = ((d <= DEDUPE_KM) & big & same).any(axis=1)
        for k, is_sub in zip(chunk, hit):
            if is_sub:
                rows[k]["suburb"] = True
                n_marked += 1
    return n_marked


def run():
    c.log("stage: places (worldwide)")
    admin1 = _admin1_names()

    es = spanish_rows(admin1)
    c.log(f"Spain: {len(es)} municipalities (pop >= {co.ES_POP_FLOOR})", 1)

    rest = world_rows(admin1)
    rows = es + rest
    rows.sort(key=lambda r: (r["country"], -r["pop"]))

    by_cont, by_own, by_res = {}, {}, {}
    for r in rows:
        by_cont[r["continent"]] = by_cont.get(r["continent"], 0) + 1
        by_own[r["ownership"]] = by_own.get(r["ownership"], 0) + 1
        by_res[r["residence"]] = by_res.get(r["residence"], 0) + 1

    c.log(f"{len(rows)} places across {len({r['country'] for r in rows})} countries", 1)
    c.log("by continent: " + ", ".join(f"{k} {v}" for k, v in
                                       sorted(by_cont.items(), key=lambda kv: -kv[1])), 1)
    c.log("by ownership: " + ", ".join(f"{k} {v}" for k, v in
                                       sorted(by_own.items(), key=lambda kv: -kv[1])), 1)
    c.log(f"right to live on a Spanish passport: {by_res.get('free', 0)}; "
          f"needs a visa: {by_res.get('visa', 0)}", 1)

    for r in rows:
        r["suburb"] = False
    n_sub = mark_suburbs(rows)
    c.log(f"{n_sub} places flagged as districts of a larger neighbour (dropped at emit)", 1)

    no_elev = sum(1 for r in rows if r["elev"] is None)
    if no_elev:
        c.log(f"{no_elev} places have no usable elevation; the DEM will supply it", 1)

    cells = {(round(r["lat"], 1), round(r["lon"], 1)) for r in rows}
    c.log(f"{len(cells)} distinct 0.1 deg cells", 1)

    c.write_stage("places", rows)
    return rows


if __name__ == "__main__":
    run()
