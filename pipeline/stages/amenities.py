"""Stage 4 -- distances to the things that make a town liveable, from OpenStreetMap.

One Overpass query per category and box rather than one per place: a few dozen
queries instead of hundreds of thousands. Each is cached independently, so a
timeout on the heaviest category never costs us the cheap ones.

Scope, and why it is no longer uneven:

  * Transport (mainline stations, metro and tram, coach terminals) is surveyed
    everywhere the place table reaches.
  * Supermarkets, pharmacies, hospitals and clinics used to be Spain only,
    because a single query for a whole continent of them never completed. Cut
    into the boxes in boxes.py, with Europe quartered, they complete, so these
    are worldwide too now. That took the "local services" score from 14% of
    places to nearly all of them.
  * Vets and dog parks, for anyone moving with an animal. Same footprint.
  * Schools, malls and cycleways remain Spain only. Nothing scores on them, and
    a planet of schools is a million features for a detail panel row.

A place outside every surveyed box gets `null`, never the distance to the
nearest feature somewhere else. The flag is per LAYER, not per place: if one
box of one layer fails to download, only that layer goes null for the places
inside that box, and the rest of their data stands.

OpenStreetMap coverage is not uniform. A supermarket missing from the map in
rural Bolivia is far more likely than one missing in rural Bavaria, so a long
distance in a thinly mapped country can mean "unmapped" rather than "absent".
`servicesMapped` records how dense the map is around the country's own cities,
which is what the UI uses to say so.

Distances are straight-line, scaled by a road detour factor. Honest for
screening, wrong for planning a specific commute -- the README says so.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import common as c  # noqa: E402
import boxes  # noqa: E402

ROAD_FACTOR = 1.25


def _in_boxes(lat, lon, boxlist):
    """Vectorised: is each place inside any of these "s,w,n,e" boxes?"""
    inside = np.zeros(len(lat), dtype=bool)
    for box in boxlist:
        s0, w0, n0, e0 = (float(v) for v in box.split(","))
        inside |= (lat >= s0) & (lat <= n0) & (lon >= w0) & (lon <= e0)
    return inside


# Small layers, fetched with the whole-continent boxes.
TRANSIT = {
    "train": ['node[railway=station][train=yes]', 'way[railway=station][train=yes]'],
    # Urban rapid transit, all four kinds folded together because they answer
    # one question: can you live here without a car? A tram and a light rail
    # stop are not meaningfully different to someone deciding that.
    "metro": ['node[station=subway]', 'way[station=subway]',
              'node[station=light_rail]', 'way[station=light_rail]',
              'node[railway=tram_stop]'],
    # Terminals, not stops. A bus stop exists on every village street and says
    # nothing; a station means intercity coaches actually call here.
    "bus": ['node[amenity=bus_station]', 'way[amenity=bus_station]'],
}

# Dense layers, fetched with Europe quartered.
SERVICES = {
    "supermarket": ['node[shop=supermarket]', 'way[shop=supermarket]'],
    "pharmacy": ['node[amenity=pharmacy]', 'way[amenity=pharmacy]'],
    "hospital": ['node[amenity=hospital]', 'way[amenity=hospital]',
                 'node[amenity=clinic]', 'way[amenity=clinic]'],
    "vet": ['node[amenity=veterinary]', 'way[amenity=veterinary]'],
    "dogPark": ['node[leisure=dog_park]', 'way[leisure=dog_park]'],
}

# How many within this radius, as well as how far to the nearest. One shop 3 km
# away and a dozen within 5 km are different places to live.
DENSITY = (("supermarket", 5.0), ("pharmacy", 5.0), ("vet", 10.0))

# Iberia only, from the original survey, still cached.
ES_ONLY = {
    "school": ['node[amenity=school]', 'way[amenity=school]'],
    "mall": ['node[shop=mall]', 'way[shop=mall]',
             'node[shop=department_store]', 'way[shop=department_store]'],
}
CYCLE = ['way[highway=cycleway]', 'way[bicycle=designated][highway!=cycleway]']


def _query(fragments, bbox, timeout=900):
    """Coordinates only. Tags are most of the payload and nothing reads them,
    so nodes come back as bare points and ways as bare centres."""
    nodes = "".join(f"{f}({bbox});" for f in fragments if f.startswith("node"))
    others = "".join(f"{f}({bbox});" for f in fragments if not f.startswith("node"))
    q = f"[out:json][timeout:{timeout}];"
    if nodes:
        q += f"({nodes});out skel qt;"
    if others:
        q += f"({others});out ids center qt;"
    return q


def _points(elements):
    lat, lon = [], []
    for e in elements:
        if "lat" in e and "lon" in e:
            lat.append(e["lat"])
            lon.append(e["lon"])
        elif "center" in e:
            lat.append(e["center"]["lat"])
            lon.append(e["center"]["lon"])
    return np.array(lat), np.array(lon)


def _fetch(name, frags, bbox, key):
    """(lat, lon, ok). `ok` is False when the box could not be downloaded, which
    is different from a box that downloaded and was genuinely empty."""
    try:
        data = c.overpass(_query(frags, bbox), cache_key=key)
        lat, lon = _points(data["elements"])
        c.log(f"{name}: {len(lat)} features", 1)
        return lat, lon, True
    except Exception as exc:  # noqa: BLE001
        c.warn(f"{name}: Overpass failed ({type(exc).__name__}) -- null inside this box")
        return np.array([]), np.array([]), False


def _layer(name, frags, box_keys):
    """Fetch one layer over several boxes. Returns the points and the boxes that
    actually answered."""
    lats, lons, answered = [], [], []
    for key, (bbox, cache_key) in box_keys.items():
        lat, lon, ok = _fetch(f"{name}/{key}", frags, bbox, cache_key)
        if ok:
            answered.append(bbox)
            if len(lat):
                lats.append(lat)
                lons.append(lon)
    lat = np.concatenate(lats) if lats else np.array([])
    lon = np.concatenate(lons) if lons else np.array([])
    c.log(f"{name}: {len(lat)} features across {len(answered)}/{len(box_keys)} boxes", 1)
    return lat, lon, answered


def _transit_boxes(name):
    # The cache keys are historical and must not change: they are what makes a
    # rerun free. The Americas, Africa and Oceania were first fetched under a
    # "rail_" prefix, and dropping it would silently re-download all of them.
    out = {"eu": (boxes.EU, f"osm_eu_{name}_v1")}
    for key, bbox in boxes.ASIA.items():
        out[key] = (bbox, f"osm_{key}_{name}_v1")
    for key, bbox in boxes.WORLD.items():
        out[key] = (bbox, f"osm_rail_{key}_{name}_v1")
    return out


def _dense_boxes(name):
    return {key: (bbox, f"osm_{name}_{key}_v1") for key, bbox in boxes.dense_worldwide().items()}


def run():
    c.log("stage: amenities")
    c._grid_selftest()
    places = c.read_stage("places")
    m_lat = np.array([m["lat"] for m in places])
    m_lon = np.array([m["lon"] for m in places])
    is_es = np.array([m["country"] == "ES" for m in places])
    rows = {m["id"]: {} for m in places}

    def put(field, values, surveyed, nd=1, scale=ROAD_FACTOR):
        for j, m in enumerate(places):
            v = values[j]
            ok = surveyed[j] and np.isfinite(v)
            rows[m["id"]][field] = round(float(v * scale), nd) if ok else None

    # --- transport, everywhere --------------------------------------------------
    transit_surveyed = np.ones(len(places), dtype=bool)
    for name, frags in TRANSIT.items():
        lat, lon, answered = _layer(name, frags, _transit_boxes(name))
        surveyed = _in_boxes(m_lat, m_lon, answered)
        transit_surveyed &= surveyed
        d, _ = c.nearest_grid(m_lat, m_lon, lat, lon)
        put(name + "Km", d, surveyed)

    # --- everyday services and animals, everywhere -----------------------------
    got = {}
    layer_surveyed = {}
    for name, frags in SERVICES.items():
        lat, lon, answered = _layer(name, frags, _dense_boxes(name))
        got[name] = (lat, lon)
        layer_surveyed[name] = _in_boxes(m_lat, m_lon, answered)
        d, _ = c.nearest_grid(m_lat, m_lon, lat, lon)
        put(name + "Km", d, layer_surveyed[name])

    for name, radius in DENSITY:
        lat, lon = got[name]
        cnt = c.count_within_grid(m_lat, m_lon, lat, lon, radius)
        field = f"{name}{int(radius)}km"
        for j, m in enumerate(places):
            rows[m["id"]][field] = int(cnt[j]) if layer_surveyed[name][j] else None

    # --- Spain-only detail ------------------------------------------------------
    for name, frags in ES_ONLY.items():
        lat, lon, ok = _fetch(name, frags, boxes.ES, f"osm_{name}_v2")
        surveyed = is_es & ok
        d, _ = c.nearest_grid(m_lat, m_lon, lat, lon)
        put(name + "Km", d, surveyed)
        if name == "school":
            cnt = c.count_within_grid(m_lat, m_lon, lat, lon, 5.0)
            for j, m in enumerate(places):
                rows[m["id"]]["school5km"] = int(cnt[j]) if surveyed[j] else None

    lat, lon, ok = _fetch("cycleway", CYCLE, boxes.ES, "osm_cycle_v2")
    cyc = is_es & ok
    cnt = c.count_within_grid(m_lat, m_lon, lat, lon, 5.0)
    d, _ = c.nearest_grid(m_lat, m_lon, lat, lon)
    put("cyclewayKm", d, cyc)
    for j, m in enumerate(places):
        rows[m["id"]]["cycleSegments5km"] = int(cnt[j]) if cyc[j] else None

    # --- how well mapped is each country? ---------------------------------------
    # Measured on the country's own towns of 50,000+, where a supermarket is
    # certain to exist: if the map shows few of them there, the map is thin, not
    # the country. Ratio against the median country, so it is scale free.
    services_ok = layer_surveyed["supermarket"] & layer_surveyed["pharmacy"] & layer_surveyed["hospital"]

    def mapping_ratio(field):
        """Per country: the median count near its own 50,000+ towns, against
        the median country. Vets get their own ratio because they are mapped
        far more unevenly than shops: Brazil maps its supermarkets reasonably
        and its vets barely at all."""
        density = {}
        for m in places:
            v = rows[m["id"]].get(field)
            if m["pop"] >= 50_000 and v is not None:
                density.setdefault(m["country"], []).append(v)
        med = {cc: float(np.median(v)) for cc, v in density.items() if len(v) >= 3}
        typical = float(np.median(list(med.values()))) if med else 0.0
        return {cc: round(v / typical, 2) if typical else None for cc, v in med.items()}

    mapped = mapping_ratio("supermarket5km")
    vets_mapped = mapping_ratio("vet10km")

    for j, m in enumerate(places):
        r = rows[m["id"]]
        r["amenitiesSurveyed"] = bool(services_ok[j])
        r["petsSurveyed"] = bool(layer_surveyed["vet"][j] and layer_surveyed["dogPark"][j])
        r["transitSurveyed"] = bool(transit_surveyed[j])
        r["servicesMapped"] = mapped.get(m["country"])
        r["vetsMapped"] = vets_mapped.get(m["country"])

    c.write_stage("amenities", rows)

    c.log("amenities sanity:", 1)
    for pid, label in (("ES-48020", "Bilbao"), ("ES-27028", "Lugo"), ("ES-39075", "Santander")):
        r = rows.get(pid, {})
        c.log(f"  {label:<10} train={r.get('trainKm')}km metro={r.get('metroKm')}km "
              f"bus={r.get('busKm')}km super={r.get('supermarketKm')}km "
              f"hosp={r.get('hospitalKm')}km vet={r.get('vetKm')}km dogpark={r.get('dogParkKm')}km", 1)
    for field in ("trainKm", "metroKm", "busKm", "supermarketKm", "pharmacyKm",
                  "hospitalKm", "vetKm", "dogParkKm"):
        n = sum(1 for r in rows.values() if r.get(field) is not None)
        c.log(f"{field} resolved for {n}/{len(rows)} places", 1)
    for label, table in (("supermarkets", mapped), ("vets", vets_mapped)):
        thin = sorted((v, cc) for cc, v in table.items() if v is not None and v < 0.35)
        if thin:
            c.log(f"thinly mapped {label} (near big towns, vs the median country): "
                  + ", ".join(f"{cc} {v:.2f}" for v, cc in thin), 1)
    near_metro = sum(1 for r in rows.values() if (r.get("metroKm") or 99) <= 2.0)
    c.log(f"{near_metro} places within 2 km of metro, light rail or tram", 1)
    return rows


if __name__ == "__main__":
    run()
