"""End-to-end check on the emitted dataset, plus the actual search it exists for.

Run after `build.py`. Fails loudly on structural problems, then prints the answer
to the question that started the project: where in Spain can you buy 80 m2 for
under 400k with summers like Bilbao's?
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import common as c  # noqa: E402

REQUIRED = [
    "id", "name", "country", "countryName", "province", "lat", "lon", "pop",
    "hottestTmax", "hottestTmin", "daysOver30", "tropicalNights", "winterTmin", "annualRain",
    "airportKm", "hubKm", "airportScore", "city100kKm",
    "eurM2", "priceSource",
]


def hydrate(doc):
    """The emitted file is columnar; turn it back into rows for checking."""
    if doc.get("format", "").startswith("columnar"):
        n, dct, cols = doc["n"], doc["dict"], doc["cols"]
        rows = []
        for i in range(n):
            r = {}
            for k, col in cols.items():
                v = col[i]
                table = dct.get(k)
                r[k] = table[v] if (table is not None and isinstance(v, int)) else v
            rows.append(r)
        return rows
    return doc["towns"]


def main():
    doc = json.loads((c.WEB_DATA / "towns.json").read_text(encoding="utf-8"))
    towns = hydrate(doc)
    meta = doc["meta"]
    print(f"places: {len(towns)}   built: {meta['built']}   spanish prices: {meta['priceQuarter']}")
    print("countries:", ", ".join(f"{k} {v}" for k, v in list(meta.get("countries", {}).items())[:10]))

    problems = []

    # --- completeness ----------------------------------------------------------
    for f in REQUIRED:
        missing = sum(1 for t in towns if t.get(f) is None)
        if missing:
            problems.append(f"{f}: {missing} nulls")
    nulls = {
        f: sum(1 for t in towns if t.get(f) is None)
        for f in ("trainKm", "supermarketKm", "hospitalKm", "coastKm", "cycleSegments5km", "skiKm")
    }
    print("optional-field nulls:", nulls)

    # --- provenance ------------------------------------------------------------
    for key in ("priceSource", "source"):
        counts = {}
        for t in towns:
            counts[t.get(key)] = counts.get(t.get(key), 0) + 1
        print(f"{key}: {counts}")

    # --- known values ----------------------------------------------------------
    by = {t["id"]: t for t in towns}
    checks = [
        ("ES-48020", "Bilbao", lambda t: t["daysOver30"] < 20, "few hot days"),
        ("ES-41091", "Sevilla", lambda t: t["daysOver30"] > 80, "many hot days"),
        ("ES-46250", "Valencia", lambda t: t["tropicalNights"] > 50, "many tropical nights"),
        ("ES-48020", "Bilbao", lambda t: t["coastKm"] is not None and t["coastKm"] < 25, "near coast"),
        ("ES-28079", "Madrid", lambda t: t["coastKm"] is not None and t["coastKm"] > 200, "far inland"),
        ("ES-09059", "Burgos", lambda t: t["winterTmin"] < 4, "cold winters"),
        ("ES-48020", "Bilbao", lambda t: t["hubKm"] < 30, "hub airport close"),
    ]
    # The protected-nature layer once missed every park mapped as a relation,
    # which is most of them, and put Madrid 115 km from anything protected.
    checks += [
        ("ES-28079", "Madrid", lambda t: t.get("parkKm") is not None and t["parkKm"] < 70,
         "protected nature within ~70 km (Guadarrama)"),
        ("ES-48020", "Bilbao", lambda t: t.get("parkKm") is not None and t["parkKm"] < 40,
         "protected nature within ~40 km (Gorbeia, Urkiola)"),
        ("ES-48020", "Bilbao", lambda t: t.get("vetKm") is not None and t["vetKm"] < 5,
         "a vet in the city"),
        ("ES-48020", "Bilbao", lambda t: t.get("tz") == "Europe/Madrid", "time zone carried"),
    ]
    for ine, label, fn, desc in checks:
        t = by.get(ine)
        if not t:
            problems.append(f"{label} ({ine}) missing from dataset")
        elif not fn(t):
            problems.append(f"{label} failed check: {desc}")

    # --- worldwide layers --------------------------------------------------------
    # Services used to be Spain only; anything under 80% now means boxes failed.
    for field in ("supermarketKm", "pharmacyKm", "hospitalKm", "vetKm"):
        have = sum(1 for t in towns if t.get(field) is not None)
        print(f"{field}: {have}/{len(towns)} places ({100 * have / len(towns):.0f}%)")
        if have < 0.8 * len(towns):
            problems.append(f"{field} resolved for only {have}/{len(towns)} places")
    # A fill value read as data: 65,535 kJ/m2 of sun is three Saharas.
    solar_bad = [t["name"] for t in towns if (t.get("solarAnnual") or 0) > 30000]
    if solar_bad:
        problems.append(f"solar fill values leaked through for {solar_bad[:6]}")
    no_tz = sum(1 for t in towns if not t.get("tz"))
    if no_tz:
        problems.append(f"{no_tz} places have no time zone")

    # --- the actual search -----------------------------------------------------
    madrid = by["ES-28079"]
    barcelona = by.get("ES-08019") or madrid

    # Cooler than both Madrid and Barcelona on whichever axis each one fails,
    # which is the whole point: Madrid is the day problem, Barcelona the night one.
    cap_days = min(madrid["daysOver30"], barcelona["daysOver30"]) * 0.6
    cap_nights = min(madrid["tropicalNights"], barcelona["tropicalNights"]) * 0.6
    base = [
        t for t in towns
        if t["eurM2"] * 80 <= 400_000
        and t["daysOver30"] <= cap_days
        and t["tropicalNights"] <= cap_nights
        and t["hubKm"] <= 170
        and t["city100kKm"] <= 120
        and t["pop"] >= 5000
    ]

    def shortlist(rows, title, limit=18):
        print()
        print("=" * 104)
        print(title)
        print("=" * 104)
        rows.sort(key=lambda t: (t["daysOver30"] + t["tropicalNights"], t["eurM2"]))
        print(f"{len(rows)} qualify")
        print()
        hdr = (f"{'place':<24}{'country':<14}{'region':<20}{'EUR/m2':>8}{'80m2':>10}"
               f"{'>30C':>6}{'>20C':>6}{'hub':>6}{'city':>6}  src")
        print(hdr)
        print("-" * len(hdr))
        for t in rows[:limit]:
            print(
                f"{t['name'][:23]:<24}{t['countryName'][:13]:<14}{str(t['province'])[:19]:<20}"
                f"{t['eurM2']:>8,.0f}{t['eurM2'] * 80:>10,.0f}{t['daysOver30']:>6.0f}"
                f"{t['tropicalNights']:>6.0f}{t['hubKm']:>6.0f}{t['city100kKm']:>6.0f}"
                f"  {t['priceSource'][:4]}"
            )

    shortlist(
        [t for t in base if t["country"] == "ES"],
        f"SPAIN -- 80 m2 under EUR 400k, <={cap_days:.0f} days >30C, <={cap_nights:.0f} nights >20C",
    )
    shortlist(
        [t for t in base if t["country"] != "ES" and t.get("continent") == "Europe"],
        "REST OF EUROPE -- identical filters (prices here are national bands, not measurements)",
    )
    shortlist(
        [t for t in base if t.get("continent") == "Asia" and t.get("ownership") == "freehold"],
        "ASIA, FREEHOLD ONLY -- identical filters, restricted to where you can actually buy",
    )

    shortlist(
        [t for t in base if t["country"] == "JP"],
        "JAPAN -- the only Asian country selling freehold to foreigners with no strings",
    )
    shortlist(
        [t for t in base if t.get("continent") == "Americas"
         and t.get("ownership") == "freehold"],
        "THE AMERICAS, FREEHOLD ONLY -- identical filters. The interesting entries here "
        "are highland tropics: never hot because of altitude, not latitude.",
    )
    shortlist(
        [t for t in base if t.get("continent") in ("Africa", "Oceania")
         and t.get("ownership") in ("freehold", "restricted")],
        "AFRICA AND OCEANIA -- identical filters, freehold or conditional purchase",
    )
    shortlist(
        [t for t in base if t.get("residence") == "free"],
        "ANYWHERE A SPANISH PASSPORT ALREADY LETS YOU LIVE -- identical filters",
    )

    print()
    for label, subset in (("whole dataset", towns), ("clearing the filters", base)):
        own = {}
        for t in subset:
            own[t.get("ownership")] = own.get(t.get("ownership"), 0) + 1
        print(f"{label}, by ownership: "
              + ", ".join(f"{v} {k}" for k, v in sorted(own.items(), key=lambda kv: -kv[1])))

    by_c = {}
    for t in base:
        by_c[t["countryName"]] = by_c.get(t["countryName"], 0) + 1
    print()
    print("places clearing the climate/budget filters, by country:",
          ", ".join(f"{k} {v}" for k, v in sorted(by_c.items(), key=lambda kv: -kv[1])[:14]))

    # The seasons are derived per place, so the southern hemisphere must invert
    # without being told to. A July peak in Chile means it silently did not.
    NAMES = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()
    # Only south of the Tropic of Capricorn, where a "hottest month" means
    # something. Between the tropics the annual swing is a degree or two and the
    # warmest month is close to arbitrary, so counting those in would fail a
    # check on places that have no season to get wrong.
    south = [t for t in towns if t["lat"] < -23.5 and t.get("hottestMonth") is not None]
    tropics = [t for t in towns
               if -23.5 <= t["lat"] < 0 and t.get("hottestMonth") is not None]
    if south:
        n_ok = sum(1 for t in south if t["hottestMonth"] in (11, 0, 1, 2))
        print()
        print(f"southern hemisphere below the tropics: {n_ok}/{len(south)} peak in Dec-Mar")
        print(f"southern tropics (no real season, peak month is near-arbitrary): "
              f"{len(tropics)} places")
        for name in ("Santiago", "Cape Town", "Hobart", "Montevideo"):
            hit = next((t for t in south if t["name"] == name), None)
            if hit:
                print(f"  {name:<12} peaks in {NAMES[hit['hottestMonth']]} "
                      f"at {hit['hottestTmax']:.1f} C, coldest nights {hit['winterTmin']:.1f} C")
        if n_ok < 0.9 * len(south):
            problems.append(f"only {n_ok}/{len(south)} southern places peak in Dec-Mar")

    print()
    if problems:
        print("PROBLEMS:")
        for p in problems:
            print("  -", p)
        raise SystemExit(1)
    print("all structural and known-value checks passed")


if __name__ == "__main__":
    main()
