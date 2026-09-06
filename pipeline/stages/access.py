"""Stage 3 -- getting places: airports and cities.

Airport access is modelled as a gravity score, not just "km to the nearest strip".
"Links me to the world" means volume of onward connections, and it means having
*several* usable options: the Bilbao area is well served precisely because Bilbao,
Vitoria, Santander and Biarritz are all in range. A nearest-neighbour distance
cannot express that; a gravity sum can.

    score = sum over airports of  pax / (road_km + 25)^1.6

The +25 keeps a town sitting on the runway from scoring infinitely, and the 1.6
exponent makes the score decay faster than linearly with distance without going
so steep that a second airport an hour away stops counting.
"""
from __future__ import annotations

import csv
import io
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import common as c  # noqa: E402

OURAIRPORTS = "https://davidmegginson.github.io/ourairports-data/airports.csv"

# Straight-line km underestimates real travel, badly so in the Cantabrian
# mountains. 1.25 is a conventional detour factor for Spanish road network.
ROAD_FACTOR = 1.25

# Approximate annual passengers (millions), used purely as a *connectivity
# proxy* for ranking -- the ordering is what matters, not the exact figure.
# Sources: AENA 2024 traffic statistics, ACI Europe and national CAAs elsewhere.
#
# This list is not exhaustive and does not need to be: any airport not named here
# falls back to a size-class default (see DEFAULT_PAX), which is accurate enough
# to rank a regional strip below a capital hub. Add entries when a specific
# airport matters to you.
PAX_M = {
    "MAD": 66.0, "BCN": 55.0, "PMI": 33.0, "AGP": 25.0, "ALC": 18.0,
    "LPA": 14.5, "TFS": 13.0, "VLC": 10.5, "SVQ": 8.8, "IBZ": 8.5,
    "ACE": 8.0, "BIO": 6.5, "TFN": 6.5, "FUE": 6.0, "MJV": 1.5,
    "SCQ": 2.9, "GRO": 2.2, "MAH": 3.7, "OVD": 1.7, "LCG": 1.2,
    "VGO": 1.1, "SDR": 1.1, "REU": 1.3, "GRX": 1.4, "XRY": 1.1,
    "LEI": 1.2, "ZAZ": 0.5, "EAS": 0.4, "PNA": 0.3, "VLL": 0.3,
    "VIT": 0.15, "BJZ": 0.1, "LEN": 0.06, "SLM": 0.05, "RGS": 0.03,
    "RJL": 0.03, "MLN": 0.4, "TFU": 0.1,
    # Non-Spanish but genuinely reachable from the north and the east.
    "OPO": 15.0, "LIS": 35.0, "TLS": 8.0, "BOD": 7.0, "BIQ": 1.2,
    "PUF": 0.6, "PGF": 0.4, "MRS": 10.0, "MPL": 2.0, "CDG": 70.0,
    # Rest of Europe -- the hubs that actually change where it is sensible to live.
    "LHR": 83.0, "AMS": 72.0, "IST": 80.0, "FRA": 61.0, "ORY": 33.0,
    "MUC": 41.0, "FCO": 49.0, "DUB": 34.0, "BRU": 23.0, "CPH": 30.0,
    "VIE": 31.0, "ZRH": 31.0, "OSL": 29.0, "ARN": 25.0, "LIN": 5.5,
    "MXP": 26.0, "BGY": 16.0, "VCE": 11.0, "BLQ": 10.0, "NAP": 12.0,
    "PSA": 5.9, "TRN": 4.5, "GVA": 17.0, "BSL": 8.0, "BER": 25.0,
    "DUS": 22.0, "HAM": 14.0, "CGN": 10.0, "STR": 8.0, "NUE": 4.0,
    "HAJ": 6.0, "BRE": 2.5, "LEJ": 2.5, "DRS": 1.5, "FMO": 1.0,
    "NCE": 14.0, "LYS": 11.0, "NTE": 7.0, "SXB": 1.3,
    "RNS": 0.9, "BES": 1.0, "CFE": 0.5, "LIG": 0.2, "AJA": 1.5,
    "FAO": 9.5, "FNC": 3.5, "PDL": 2.0,
    "HEL": 15.0, "TMP": 1.0, "OUL": 1.0, "GOT": 6.0, "MMX": 2.0,
    "BGO": 6.0, "TRD": 4.0, "SVG": 4.0, "TOS": 2.5, "BOO": 1.8,
    "AAL": 1.5, "BLL": 1.5, "KEF": 8.0, "RIX": 7.0, "TLL": 3.5,
    "VNO": 5.0, "KUN": 1.5, "WAW": 21.0, "KRK": 10.0, "GDN": 6.0,
    "WRO": 4.0, "POZ": 3.0, "KTW": 6.0, "PRG": 17.0, "BRQ": 0.6,
    "BTS": 2.5, "KSC": 0.6, "BUD": 17.0, "DEB": 0.6, "OTP": 15.0,
    "CLJ": 3.0, "TSR": 1.5, "IAS": 1.8, "SOF": 8.0, "VAR": 2.5,
    "BOJ": 1.5, "ZAG": 4.0, "SPU": 3.5, "DBV": 3.0, "LJU": 1.5,
    "ATH": 30.0, "SKG": 7.5, "HER": 8.5, "RHO": 6.0, "CFU": 3.5,
    "LCA": 9.0, "PFO": 3.0, "MLA": 8.0, "LUX": 4.5, "EIN": 7.0,
    "RTM": 2.5, "GRQ": 0.3, "MST": 0.5, "ANR": 0.3, "CRL": 10.0,
    "LGG": 0.3, "ORK": 3.0, "SNN": 2.0, "NOC": 0.8, "KIR": 0.3,
    "INN": 1.5, "SZG": 1.8, "GRZ": 1.0, "LNZ": 0.4, "KLU": 0.2,
    # Asia -- the hubs that decide whether a place is reachable at all.
    "HND": 78.0, "NRT": 35.0, "KIX": 25.0, "ITM": 15.0, "CTS": 22.0,
    "FUK": 24.0, "NGO": 12.0, "OKA": 20.0, "SDJ": 3.5, "HIJ": 3.0,
    "KMJ": 3.5, "KOJ": 5.5, "MYJ": 3.0, "TAK": 2.0, "AOJ": 1.3,
    "AXT": 1.3, "HKD": 1.7, "AKJ": 1.2, "KIJ": 1.1, "TOY": 0.6,
    "KMQ": 2.5, "MMJ": 0.2, "FSZ": 0.7, "OIT": 2.0, "NGS": 3.0,
    "ICN": 71.0, "GMP": 24.0, "PUS": 10.0, "CJU": 30.0, "TAE": 3.0,
    "TPE": 46.0, "TSA": 6.5, "KHH": 7.0, "RMQ": 2.5,
    "TBS": 4.5, "BUS": 1.2, "KUT": 1.0, "EVN": 5.0, "GYD": 6.0,
    "SAW": 41.0, "AYT": 38.0, "ESB": 15.0, "ADB": 14.0,
    "TZX": 4.5, "ASR": 2.0, "VAN": 2.5, "ERZ": 1.5, "DIY": 2.0,
    "ALA": 9.0, "NQZ": 6.0, "SCO": 2.0, "FRU": 5.0, "TAS": 5.0,
    "ULN": 2.0, "TLV": 25.0, "DXB": 92.0, "AUH": 29.0, "DOH": 52.0,
    "BKK": 65.0, "DMK": 30.0, "CNX": 11.0, "HKT": 18.0, "SIN": 68.0,
    "KUL": 60.0, "PEN": 8.0, "BKI": 9.0, "MNL": 50.0, "CEB": 13.0,
    "CGK": 55.0, "DPS": 22.0, "SGN": 41.0, "HAN": 29.0, "DAD": 14.0,
    "HKG": 53.0, "PVG": 76.0, "PEK": 67.0, "PKX": 40.0, "CAN": 70.0,
    "CTU": 75.0, "KMG": 48.0, "XIY": 47.0, "DEL": 74.0, "BOM": 53.0,
    "BLR": 41.0, "MAA": 22.0, "CMB": 11.0, "KTM": 7.0, "PNH": 5.0,
    # United Kingdom and Ireland beyond the two already listed. Cool summers
    # and dense air links make this one of the better-served regions here.
    "LGW": 43.0, "MAN": 30.0, "STN": 29.0, "LTN": 17.0, "EDI": 15.0,
    "BHX": 12.0, "BRS": 10.0, "GLA": 8.0, "BFS": 6.0, "NCL": 5.0,
    "LPL": 5.0, "LBA": 4.0, "EMA": 2.0, "ABZ": 2.0, "SOU": 1.0,
    "EXT": 1.0, "INV": 1.0, "CWL": 1.0, "JER": 2.0, "IOM": 1.0,
    # North America. Passenger volumes here dwarf Europe's, which matters: the
    # gravity score is what separates a place with one daily regional flight
    # from one with a genuine long-haul hub inside an hour.
    "ATL": 108.0, "DFW": 87.0, "DEN": 82.0, "ORD": 80.0, "LAX": 76.0,
    "JFK": 63.0, "CLT": 58.0, "LAS": 58.0, "MCO": 57.0, "MIA": 56.0,
    "SEA": 52.0, "PHX": 52.0, "EWR": 49.0, "SFO": 47.0, "IAH": 46.0,
    "BOS": 43.0, "FLL": 35.0, "MSP": 34.0, "LGA": 32.0, "DTW": 32.0,
    "PHL": 31.0, "SLC": 28.0, "IAD": 27.0, "BWI": 26.0, "DCA": 26.0,
    "SAN": 25.0, "TPA": 25.0, "BNA": 23.0, "AUS": 22.0, "MDW": 21.0,
    "HNL": 21.0, "PDX": 20.0, "STL": 16.0, "RDU": 15.0, "SMF": 13.0,
    "SJC": 12.0, "CLE": 10.0, "PIT": 10.0, "CVG": 9.0, "IND": 10.0,
    "MKE": 7.0, "BUF": 5.0, "ALB": 3.0, "BTV": 1.5, "PWM": 2.3,
    "ANC": 5.0, "BLI": 1.0, "GEG": 4.0, "BOI": 4.5, "MSO": 1.0,
    "ASE": 1.0, "EUG": 1.2, "MFR": 1.2, "OLM": 0.05, "PSC": 1.0,
    "YYZ": 45.0, "YVR": 26.0, "YUL": 22.0, "YYC": 18.0, "YEG": 8.0,
    "YOW": 5.0, "YHZ": 4.0, "YWG": 4.0, "YQB": 1.6, "YXE": 1.3,
    "YYJ": 2.0, "YLW": 2.0, "YQR": 1.2, "YXY": 0.4, "YZF": 0.3,
    "MEX": 48.0, "CUN": 32.0, "GDL": 18.0, "MTY": 14.0, "TIJ": 12.0,
    "SJD": 6.0, "PVR": 6.0, "QRO": 2.5, "MID": 3.5, "BJX": 2.5,
    "OAX": 1.2, "TLC": 2.0, "CJS": 3.0, "CUL": 2.0, "SLP": 1.0,
    # Central America and the Caribbean.
    "PTY": 18.0, "SJO": 6.0, "LIR": 1.2, "GUA": 3.0, "SAL": 3.5,
    "TGU": 1.0, "MGA": 1.5, "BZE": 1.2, "PUJ": 8.0, "SDQ": 5.0,
    "STI": 1.5, "MBJ": 5.0, "KIN": 2.0, "NAS": 4.0, "BGI": 2.0,
    "POS": 2.0, "AUA": 3.0, "CUR": 1.7,
    # South America.
    "GRU": 43.0, "CGH": 22.0, "BSB": 17.0, "GIG": 14.0, "SDU": 8.0,
    "CNF": 12.0, "VCP": 12.0, "REC": 9.0, "SSA": 8.0, "POA": 8.0,
    "FOR": 7.0, "CWB": 7.0, "BEL": 4.0, "MAO": 4.0, "FLN": 4.0,
    "NAT": 2.5, "VIX": 3.0, "GYN": 3.5, "CGB": 2.5, "JOI": 0.6,
    "IGU": 2.5, "CXJ": 0.4, "BOG": 40.0, "MDE": 14.0, "CTG": 6.0,
    "CLO": 6.0, "BAQ": 3.0, "BGA": 1.5, "PEI": 1.5, "SMR": 1.5,
    "LIM": 24.0, "CUZ": 4.0, "AQP": 2.0, "TRU": 1.0, "PIU": 1.5,
    "SCL": 26.0, "ANF": 2.0, "CJC": 2.0, "PMC": 2.5, "CCP": 1.2,
    "LSC": 1.0, "PUQ": 1.2, "ZCO": 1.0, "IQQ": 1.5,
    "EZE": 12.0, "AEP": 11.0, "COR": 4.0, "MDZ": 2.0, "BRC": 2.0,
    "ROS": 1.0, "SLA": 1.5, "USH": 1.0, "NQN": 1.2, "TUC": 1.0,
    "MVD": 2.2, "PDP": 0.5, "UIO": 5.0, "GYE": 4.0, "CUE": 0.3,
    "VVI": 3.0, "LPB": 2.0, "CBB": 1.0, "ASU": 1.3, "CCS": 4.0,
    # Oceania.
    "SYD": 43.0, "MEL": 37.0, "BNE": 25.0, "PER": 15.0, "ADL": 8.0,
    "OOL": 6.0, "CNS": 5.0, "CBR": 3.0, "HBA": 3.0, "DRW": 2.0,
    "TSV": 1.6, "LST": 1.3, "MCY": 1.0, "NTL": 1.2, "AVV": 0.5,
    "AKL": 19.0, "CHC": 6.0, "WLG": 5.0, "ZQN": 2.4, "DUD": 0.9,
    "NSN": 1.0, "PMR": 0.5, "NPE": 0.6, "TRG": 0.4,
    # Africa.
    "JNB": 21.0, "CPT": 11.0, "DUR": 5.0, "PLZ": 2.0, "GRJ": 0.7,
    "ELS": 0.6, "BFN": 0.3, "CMN": 12.0, "RAK": 6.0, "AGA": 2.0,
    "TNG": 2.0, "FEZ": 2.0, "RBA": 1.0, "OUD": 0.7, "NDR": 0.7,
    "CAI": 30.0, "HRG": 9.0, "SSH": 6.0, "HBE": 3.0, "LXR": 1.5,
    "TUN": 6.0, "MIR": 2.0, "DJE": 2.0, "SFA": 0.2, "NBE": 1.5,
    "NBO": 8.0, "MBA": 2.0, "DAR": 4.0, "ZNZ": 2.0, "JRO": 1.2,
    "ACC": 2.5, "KGL": 1.2, "ADD": 14.0, "WDH": 1.0, "GBE": 0.4,
    "MRU": 4.0, "SEZ": 0.4, "RAI": 1.0, "SID": 1.2, "VXE": 0.3,
}

# Airports outside the list above still fly somewhere. Size class is a crude but
# unbiased stand-in: a large_airport is a hub even if unnamed here.
DEFAULT_PAX = {"large_airport": 6.0, "medium_airport": 0.6}

# A "hub" is somewhere you can reach a real spread of destinations without a
# domestic connection first. 2M passengers is roughly where an airport stops
# being regional-only: it admits Santiago, Girona and Menorca, and correctly
# excludes thin ones like Asturias (1.7M) and Santander (1.1M).
HUB_PAX_M = 2.0

# Every airport with scheduled service, worldwide. There used to be a country
# allowlist here covering Europe and Asia, which silently deleted every airport
# in the Americas, Africa and Oceania: Bogota, sitting 13 km from a 40-million
# passenger hub, was reported as 7,653 km from the nearest one, and every place
# on three continents failed an airport filter it should have sailed through.
#
# A place's nearest airport is its nearest airport. There is no reason for
# politics to enter into it, and the cost of carrying them all is a slightly
# wider distance matrix that was already chunked.


def load_airports():
    txt = c.fetch(OURAIRPORTS)
    rows = list(csv.DictReader(io.StringIO(txt)))
    out = []
    for r in rows:
        if r["scheduled_service"] != "yes":
            continue
        if r["type"] not in ("large_airport", "medium_airport"):
            continue
        iata = (r["iata_code"] or "").strip().upper()
        try:
            lat, lon = float(r["latitude_deg"]), float(r["longitude_deg"])
        except ValueError:
            continue
        # Unlisted airports still exist and still fly somewhere; give them a
        # small nominal volume rather than dropping them.
        pax = PAX_M.get(iata) or DEFAULT_PAX.get(r["type"], 0.5)
        out.append(
            {
                "iata": iata or r["ident"],
                "name": r["name"],
                "lat": lat,
                "lon": lon,
                "pax": pax,
                "country": r["iso_country"],
            }
        )
    return out


def run():
    c.log("stage: access (airports + cities)")
    munis = c.read_stage("places")
    airports = load_airports()
    c.log(f"{len(airports)} scheduled airports worldwide", 1)

    m_lat = np.array([m["lat"] for m in munis])
    m_lon = np.array([m["lon"] for m in munis])
    a_lat = np.array([a["lat"] for a in airports])
    a_lon = np.array([a["lon"] for a in airports])
    a_pax = np.array([a["pax"] for a in airports])

    # Full place x airport matrix would be 18k x ~600 doubles several times over,
    # so walk it in chunks and keep only the reductions.
    n = len(munis)
    hub_mask = a_pax >= HUB_PAX_M
    hub_names = [airports[j]["iata"] for j, keep in enumerate(hub_mask) if keep]

    nearest_i = np.empty(n, dtype=np.int64)
    nearest_km = np.empty(n)
    hub_i = np.empty(n, dtype=np.int64)
    hub_km = np.empty(n)
    gravity = np.empty(n)

    CHUNK = 1024
    for s0 in range(0, n, CHUNK):
        e0 = min(s0 + CHUNK, n)
        d = (
            c.haversine(m_lat[s0:e0, None], m_lon[s0:e0, None], a_lat[None, :], a_lon[None, :])
            * ROAD_FACTOR
        )
        rows_ix = np.arange(e0 - s0)
        nearest_i[s0:e0] = np.argmin(d, axis=1)
        nearest_km[s0:e0] = d[rows_ix, nearest_i[s0:e0]]

        d_hub = d[:, hub_mask]
        hub_i[s0:e0] = np.argmin(d_hub, axis=1)
        hub_km[s0:e0] = d_hub[rows_ix, hub_i[s0:e0]]

        gravity[s0:e0] = (a_pax[None, :] / (d + 25.0) ** 1.6).sum(axis=1)

    # --- city access, straight from the municipality table ----------------------
    pops = np.array([m["pop"] for m in munis])
    out = {}
    for label, floor in (("City50k", 50_000), ("City100k", 100_000), ("City250k", 250_000)):
        idx = np.where(pops >= floor)[0]
        dist, which = c.nearest(m_lat, m_lon, m_lat[idx], m_lon[idx])
        out[label] = (dist * ROAD_FACTOR, idx[which])

    rows = {}
    for i, m in enumerate(munis):
        rows[m["id"]] = {
            "airportKm": round(float(nearest_km[i]), 1),
            "airportName": airports[nearest_i[i]]["iata"],
            "hubKm": round(float(hub_km[i]), 1),
            "hubName": hub_names[int(hub_i[i])],
            "airportScore": round(float(gravity[i]), 4),
            "city50kKm": round(float(out["City50k"][0][i]), 1),
            "city100kKm": round(float(out["City100k"][0][i]), 1),
            "city100kName": munis[int(out["City100k"][1][i])]["name"],
            "city250kKm": round(float(out["City250k"][0][i]), 1),
        }

    c.write_stage("access", rows)

    c.log("access sanity:", 1)
    for ine, label in (("ES-48020", "Bilbao"), ("ES-27028", "Lugo"), ("ES-42173", "Soria"), ("ES-33024", "Gijon")):
        if ine in rows:
            r = rows[ine]
            c.log(
                f"  {label:<8} airport={r['airportName']} {r['airportKm']:>5.0f}km  "
                f"hub={r['hubName']} {r['hubKm']:>5.0f}km  gravity={r['airportScore']:>7.3f}  "
                f"city100k={r['city100kKm']:>5.0f}km",
                1,
            )
    return rows


if __name__ == "__main__":
    run()
