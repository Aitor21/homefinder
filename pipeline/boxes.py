"""The bounding boxes OpenStreetMap layers are fetched in, in one place.

Overpass will not return a planet-wide query for anything but the smallest
layers, so every OSM layer here is fetched box by box and the results
concatenated. Two stages need the same boxes and were each about to grow their
own copy, which is how the two would have drifted apart.

The split points are chosen so no single box is both large in area and dense in
features. That is why the Americas are cut into five rather than one: a single
box from Alaska to Patagonia times out on beaches even though it returns fine
for railway stations.

A place outside every box gets `null` for these layers, never a distance to the
nearest surveyed feature somewhere else. That distinction is the whole reason
the boxes are written down rather than left implicit: an earlier version
computed rail against a Europe-only set and told a town in Chile its nearest
station was in Portugal.
"""
from __future__ import annotations

# Iberia, including the Canaries (lon -18.2) and the Balearics (lon 4.4).
ES = "35.0,-19.0,44.5,5.0"

# North Cape to the Canaries, Iceland to Cyprus.
EU = "34.0,-26.0,72.0,35.0"

# The Asian countries where a foreigner can realistically buy. Split because
# Overpass does not finish the combined query, and skipping India and southeast
# Asia keeps it to what is actionable.
ASIA = {
    "asia_caucasus": "35.0,25.0,46.0,52.0",   # Turkey, Georgia, Armenia, Azerbaijan
    "asia_east": "24.0,100.0,46.0,146.5",     # Japan, Korea, Taiwan, east China
    "asia_central": "40.0,52.0,56.0,88.0",    # Kazakhstan, Kyrgyzstan, Uzbekistan
}

# Everywhere else the place table reaches.
WORLD = {
    "na_west": "14.0,-170.0,72.0,-100.0",    # Alaska, western Canada and US, west Mexico
    "na_east": "7.0,-100.0,60.0,-52.0",      # eastern North America, Central America
    "sa_north": "-20.0,-82.0,13.0,-34.0",    # Colombia to central Brazil
    "sa_south": "-56.0,-77.0,-20.0,-34.0",   # Chile, Argentina, Uruguay, south Brazil
    "caribbean": "10.0,-85.0,27.0,-59.0",    # the islands
    "africa_n": "8.0,-18.0,38.0,52.0",       # Morocco across to the Horn
    "africa_s": "-35.0,10.0,8.0,52.0",       # southern and eastern Africa
    "oceania": "-48.0,112.0,-9.0,179.0",     # Australia and New Zealand
}


def worldwide() -> dict[str, str]:
    """Every box, keyed by a stable name used in the fetch cache key.

    Stable because the key is what makes a rerun free. Renaming a box throws
    away its cached response, and some of these take minutes to fetch.
    """
    return {"eu": EU, **ASIA, **WORLD}


def all_boxes() -> list[str]:
    """Just the extents, for testing whether a place was surveyed at all."""
    return list(worldwide().values())
