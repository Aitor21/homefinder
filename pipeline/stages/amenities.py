"""Stage 4 -- distances to the things that make a town liveable, from OpenStreetMap.

One bounding-box Overpass query per category rather than one per place: a handful
of queries instead of tens of thousands. Each is cached independently, so a
timeout on the heaviest category never costs us the cheap ones.

Scope is deliberately uneven, and the data says so rather than hiding it:

  * Railway stations are queried across the whole continent. Rail access matters
    more in Europe than almost anywhere, and the layer is small enough to fetch.
  * Supermarkets, pharmacies, hospitals, schools, malls and cycleways are queried
    for Spain only. Spain alone returns ~24k supermarkets and ~97k cycleway
    segments; the same queries over Europe do not complete.

Places outside the surveyed area get `null` for those fields and
`amenitiesSurveyed: false`. That distinction matters: a null must mean "not
looked at", never "nothing there". The scoring model drops unsurveyed dimensions
and renormalises rather than penalising a town for missing data.

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

ES_BBOX = boxes.ES
EU_BBOX = boxes.EU
ASIA_BBOXES = boxes.ASIA

RAIL_BBOXES = boxes.WORLD

ROAD_FACTOR = 1.25


def _in_boxes(lat, lon, boxes):
    """Vectorised: is each place inside any of these "s,w,n,e" boxes?"""
    inside = np.zeros(len(lat), dtype=bool)
    for box in boxes:
        s0, w0, n0, e0 = (float(v) for v in box.split(","))
        inside |= (lat >= s0) & (lat <= n0) & (lon >= w0) & (lon <= e0)
    return inside

# Small enough to fetch for the whole continent.
# Surveyed everywhere the place table reaches. These are small enough to be
# global, unlike shops or schools: a planet has far fewer metro stations than
# supermarkets.
EU_GROUPS = {
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

# Too heavy for a Europe-wide query; Iberia only.
ES_GROUPS = {
    "supermarket": ['node[shop=supermarket]', 'way[shop=supermarket]'],
    "pharmacy": ['node[amenity=pharmacy]'],
    "hospital": ['node[amenity=hospital]', 'way[amenity=hospital]',
                 'node[amenity=clinic]', 'way[amenity=clinic]'],
    "school": ['node[amenity=school]', 'way[amenity=school]'],
    "mall": ['node[shop=mall]', 'way[shop=mall]',
             'node[shop=department_store]', 'way[shop=department_store]'],
}

CYCLE = ['way[highway=cycleway]', 'way[bicycle=designated][highway!=cycleway]']

DENSITY = (("supermarket", 5.0), ("pharmacy", 5.0), ("school", 5.0))


def _query(fragments, bbox, timeout=900):
    parts = "".join(f"{f}({bbox});\n " for f in fragments)
    return f"[out:json][timeout:{timeout}];\n({parts});\nout center;"


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
    try:
        data = c.overpass(_query(frags, bbox), cache_key=key)
        lat, lon = _points(data["elements"])
        c.log(f"{name}: {len(lat)} features", 1)
        return lat, lon
    except Exception as exc:  # noqa: BLE001
        c.warn(f"{name}: Overpass failed ({type(exc).__name__}) -- field will be null")
        return np.array([]), np.array([])


def run():
    c.log("stage: amenities")
    places = c.read_stage("places")
    m_lat = np.array([m["lat"] for m in places])
    m_lon = np.array([m["lon"] for m in places])
    is_es = np.array([m["country"] == "ES" for m in places])
    c.log(f"{int(is_es.sum())} Spanish places fully surveyed, "
          f"{int((~is_es).sum())} elsewhere get stations only", 1)

    rows = {m["id"]: {} for m in places}

    # Outside these boxes the "nearest" station is simply the nearest one that
    # happened to be surveyed, which for the Americas means Europe.
    transit_surveyed = _in_boxes(
        m_lat, m_lon, [EU_BBOX, *ASIA_BBOXES.values(), *RAIL_BBOXES.values()]
    )
    c.log(f"{int(transit_surveyed.sum())} places inside a surveyed rail box, "
          f"{int((~transit_surveyed).sum())} outside it get null", 1)

    # --- rail, across Europe and the buyable parts of Asia ----------------------
    for name, frags in EU_GROUPS.items():
        lat, lon = _fetch(name, frags, EU_BBOX, f"osm_eu_{name}_v1")
        lats, lons = [lat], [lon]
        boxes = {**ASIA_BBOXES, **RAIL_BBOXES}
        for key, bbox in boxes.items():
            a_lat, a_lon = _fetch(f"{name}/{key}", frags, bbox, f"osm_{key}_{name}_v1")
            if len(a_lat):
                lats.append(a_lat)
                lons.append(a_lon)
        lat = np.concatenate([x for x in lats if len(x)]) if any(len(x) for x in lats) else np.array([])
        lon = np.concatenate([x for x in lons if len(x)]) if any(len(x) for x in lons) else np.array([])
        c.log(f"{name}: {len(lat)} features across all boxes", 1)
        d, _ = c.nearest(m_lat, m_lon, lat, lon)
        d = d * ROAD_FACTOR
        for j, m in enumerate(places):
            ok = transit_surveyed[j] and np.isfinite(d[j])
            rows[m["id"]][name + "Km"] = round(float(d[j]), 1) if ok else None

    # --- Iberia-only layers -----------------------------------------------------
    #
    # Computed for Spanish places only. Running them over every place on earth
    # and then discarding 29,769 of the answers cost eight times the work for
    # nothing, and got worse with each country added. Everyone else keeps the
    # null these fields already had: outside the surveyed box the nearest
    # Spanish pharmacy is a meaningless number, not an absent one.
    es_ix = np.where(is_es)[0]
    es_lat, es_lon = m_lat[es_ix], m_lon[es_ix]
    for m in places:
        for name in ES_GROUPS:
            rows[m["id"]][name + "Km"] = None
        for name, _ in DENSITY:
            rows[m["id"]][name + "5km"] = None

    got = {}
    for name, frags in ES_GROUPS.items():
        got[name] = _fetch(name, frags, ES_BBOX, f"osm_{name}_v2")

    for name, (lat, lon) in got.items():
        d, _ = c.nearest(es_lat, es_lon, lat, lon)
        d = d * ROAD_FACTOR
        for k, j in enumerate(es_ix):
            if np.isfinite(d[k]):
                rows[places[j]["id"]][name + "Km"] = round(float(d[k]), 1)

    for name, radius in DENSITY:
        lat, lon = got[name]
        cnt = c.count_within(es_lat, es_lon, lat, lon, radius)
        for k, j in enumerate(es_ix):
            rows[places[j]["id"]][name + "5km"] = int(cnt[k])

    # --- cycleways, best effort -------------------------------------------------
    lat, lon = _fetch("cycleway", CYCLE, ES_BBOX, "osm_cycle_v2")
    if len(lat):
        cnt = c.count_within(m_lat, m_lon, lat, lon, 5.0)
        d, _ = c.nearest(m_lat, m_lon, lat, lon)
        for j, m in enumerate(places):
            rows[m["id"]]["cycleSegments5km"] = int(cnt[j]) if is_es[j] else None
            ok = is_es[j] and np.isfinite(d[j])
            rows[m["id"]]["cyclewayKm"] = round(float(d[j] * ROAD_FACTOR), 1) if ok else None
    else:
        for m in places:
            rows[m["id"]]["cycleSegments5km"] = None
            rows[m["id"]]["cyclewayKm"] = None

    for j, m in enumerate(places):
        rows[m["id"]]["amenitiesSurveyed"] = bool(is_es[j])
        rows[m["id"]]["transitSurveyed"] = bool(transit_surveyed[j])

    c.write_stage("amenities", rows)

    c.log("amenities sanity:", 1)
    for pid, label in (("ES-48020", "Bilbao"), ("ES-27028", "Lugo"), ("ES-39075", "Santander")):
        r = rows.get(pid, {})
        c.log(f"  {label:<10} train={r.get('trainKm')}km metro={r.get('metroKm')}km "
              f"bus={r.get('busKm')}km super={r.get('supermarketKm')}km "
              f"hosp={r.get('hospitalKm')}km bike={r.get('cycleSegments5km')}", 1)
    for field in ("trainKm", "metroKm", "busKm"):
        n = sum(1 for r in rows.values() if r.get(field) is not None)
        c.log(f"{field} resolved for {n}/{len(rows)} places", 1)
    # Within a short walk of rapid transit is the interesting population.
    near_metro = sum(1 for r in rows.values()
                     if (r.get("metroKm") or 99) <= 2.0)
    c.log(f"{near_metro} places within 2 km of metro, light rail or tram", 1)
    return rows


if __name__ == "__main__":
    run()
