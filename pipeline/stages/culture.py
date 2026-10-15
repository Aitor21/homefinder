"""Stage -- museums, theatres, cinemas and live music, from OpenStreetMap.

What there is to do of an evening. Climate decides whether you can bear a
place; this decides whether you would enjoy it. Same method as the amenities
stage: one Overpass query per layer and box, every response cached, distances
to the nearest feature and counts within 15 km.

Layers, chosen for what they say about daily life rather than for tourism:

  * museum   tourism=museum
  * theatre  amenity=theatre (which OSM uses for opera houses and most concert
             halls too) and amenity=concert_hall where it is used
  * cinema   amenity=cinema
  * music    amenity=music_venue and amenity=nightclub: live music and clubs
  * arts     amenity=arts_centre and tourism=gallery

Counts are within 15 km because that is an evening out and back without
planning it. The web app scores them on a log scale (see web/src/culture.ts):
the difference between no theatre and one is a different life, the difference
between forty and forty-one is nothing.

Until this stage has run, the web app ESTIMATES culture from city size and
says so on screen. Once it has, the measured counts replace the estimate
everywhere they exist. A place outside every surveyed box, or in a country
whose own big towns show under a third of the typical venue density, keeps the
estimate, for the same reason the amenities stage drops thin layers: there a
long distance means "unmapped" more often than "absent".

    python pipeline/build.py --stage culture
    python pipeline/emit.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import common as c  # noqa: E402
import boxes  # noqa: E402
from amenities import ROAD_FACTOR, _in_boxes, _layer  # noqa: E402

RADIUS_KM = 15.0

LAYERS = {
    "museum": ['node[tourism=museum]', 'way[tourism=museum]'],
    "theatre": ['node[amenity=theatre]', 'way[amenity=theatre]',
                'node[amenity=concert_hall]', 'way[amenity=concert_hall]'],
    "cinema": ['node[amenity=cinema]', 'way[amenity=cinema]'],
    "music": ['node[amenity=music_venue]', 'way[amenity=music_venue]',
              'node[amenity=nightclub]', 'way[amenity=nightclub]'],
    "arts": ['node[amenity=arts_centre]', 'way[amenity=arts_centre]',
             'node[tourism=gallery]', 'way[tourism=gallery]'],
}


def _boxes(name):
    # Europe quartered, like the dense amenity layers: a continent of museums
    # and galleries is well past what the public servers answer in one go.
    return {key: (bbox, f"osm_culture_{name}_{key}_v1")
            for key, bbox in boxes.dense_worldwide().items()}


def run():
    c.log("stage: culture")
    places = c.read_stage("places")
    m_lat = np.array([m["lat"] for m in places])
    m_lon = np.array([m["lon"] for m in places])
    rows = {m["id"]: {} for m in places}

    surveyed_all = np.ones(len(places), dtype=bool)
    for name, frags in LAYERS.items():
        lat, lon, answered = _layer(name, frags, _boxes(name))
        surveyed = _in_boxes(m_lat, m_lon, answered)
        surveyed_all &= surveyed
        d, _ = c.nearest_grid(m_lat, m_lon, lat, lon)
        cnt = c.count_within_grid(m_lat, m_lon, lat, lon, RADIUS_KM)
        for j, m in enumerate(places):
            r = rows[m["id"]]
            ok = bool(surveyed[j])
            r[f"{name}Km"] = round(float(d[j] * ROAD_FACTOR), 1) if ok and np.isfinite(d[j]) else None
            r[f"{name}{int(RADIUS_KM)}km"] = int(cnt[j]) if ok else None

    # How densely each country maps culture, measured where it certainly
    # exists: around its own towns of 50,000 and more. Against the median
    # country, so it is scale free. Museums and theatres together, because
    # either alone is too sparse in mid-sized towns to be a stable signal.
    density = {}
    for m in places:
        r = rows[m["id"]]
        if m["pop"] >= 50_000 and r.get("museum15km") is not None:
            density.setdefault(m["country"], []).append(r["museum15km"] + (r.get("theatre15km") or 0))
    med = {cc: float(np.median(v)) for cc, v in density.items() if len(v) >= 3}
    typical = float(np.median(list(med.values()))) if med else 0.0
    mapped = {cc: round(v / typical, 2) if typical else None for cc, v in med.items()}

    for j, m in enumerate(places):
        r = rows[m["id"]]
        r["cultureSurveyed"] = bool(surveyed_all[j])
        r["cultureMapped"] = mapped.get(m["country"])

    c.write_stage("culture", rows)

    c.log("culture sanity:", 1)
    for pid, label in (("ES-48020", "Bilbao"), ("ES-27028", "Lugo"), ("ES-39075", "Santander")):
        r = rows.get(pid, {})
        c.log(f"  {label:<10} museums={r.get('museum15km')} theatres={r.get('theatre15km')} "
              f"cinema={r.get('cinemaKm')}km music={r.get('music15km')} arts={r.get('arts15km')}", 1)
    n = sum(1 for r in rows.values() if r.get("cultureSurveyed"))
    c.log(f"culture surveyed for {n}/{len(rows)} places", 1)
    thin = sorted((v, cc) for cc, v in mapped.items() if v is not None and v < 0.35)
    if thin:
        c.log("thinly mapped culture (kept on the estimate): "
              + ", ".join(f"{cc} {v:.2f}" for v, cc in thin), 1)
    return rows


if __name__ == "__main__":
    run()
