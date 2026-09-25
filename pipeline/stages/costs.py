"""Stage 9 -- cost of living, in the spirit of Numbeo but from measured sources.

Numbeo's indices are crowd-sourced: people type in what they paid for milk. That
gives per-city granularity nothing else can match, and it also means the sample
is self-selected, thin in small towns, and not licensable. So this takes the
opposite trade: fewer, coarser numbers, but every one of them auditable.

  costIndex        World Bank ICP price level -- the PPP conversion factor for
                   household consumption divided by the market exchange rate.
                   That ratio *is* a cost-of-living index; it is what economists
                   use, and it is published for nearly every country on earth.
                   Rebased here so Spain = 100.
  electricity      EUR per kWh for a household, all taxes in.
  incomeTaxTop     Top marginal personal income tax rate.
  vat              Standard VAT rate.

Then the one thing a climate model can do that a price survey cannot: turn the
weather into an energy bill. Heating and cooling degree days come straight from
the monthly normals already computed, and multiplied by a local electricity
price they give a defensible estimate of what keeping a home comfortable costs
*here* versus *there*.

The absolute euro figure carries an assumed building efficiency and should be
read as a bracket. The ratio between two places is far more trustworthy than
either number alone, because the assumption cancels.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import common as c  # noqa: E402

# per_page must exceed the total row count or the API silently returns page 1
# only -- which quietly yielded five countries instead of two hundred.
WB = ("https://api.worldbank.org/v2/country/all/indicator/{}"
      "?format=json&per_page=20000&date=2015:2024")
PPP_PRIVATE = "PA.NUS.PRVT.PP"   # PPP conversion factor, private consumption
FX_RATE = "PA.NUS.FCRF"          # official market exchange rate
# Intentional homicides per 100,000 people, UNODC figures as republished by the
# World Bank. The one crime statistic that is comparable between countries:
# a body is counted the same way everywhere, where theft and assault depend on
# what people bother to report. National, so it says nothing about which side
# of a city is safer, and the UI says so.
HOMICIDE = "VC.IHR.PSRC.P5"

BASE_COUNTRY = "ES"              # index rebased so Spain = 100

DAYS_IN_MONTH = np.array([31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31])

# Degree-day bases. 15.5 C is the long-standing UK/EU convention for heating --
# below it a building starts needing heat; 21 C is a common cooling base.
HDD_BASE = 15.5
CDD_BASE = 21.0

# Indicative energy model for an 80 m2 dwelling of average efficiency.
# kWh per m2 per degree-day. Heating covers a mix of fuels expressed as
# electricity-equivalent; cooling assumes a heat pump at COP ~3.
DWELLING_M2 = 80
KWH_PER_M2_HDD = 0.035
KWH_PER_M2_CDD = 0.018

# Household electricity, EUR/kWh including taxes, 2024-25. Indicative national
# averages -- tariffs vary enormously by supplier and consumption band. Edit
# freely; the relative energy index barely moves for small changes here.
ELECTRICITY = {
    "DE": 0.40, "IE": 0.36, "IT": 0.36, "BE": 0.34, "DK": 0.35, "CZ": 0.34,
    "AT": 0.30, "NL": 0.30, "CY": 0.28, "CH": 0.28, "FR": 0.28, "ES": 0.25,
    "PT": 0.25, "SE": 0.25, "LU": 0.22, "PL": 0.22, "EE": 0.20, "FI": 0.20,
    "GR": 0.20, "SI": 0.20, "SK": 0.20, "LT": 0.19, "LV": 0.19, "RO": 0.17,
    "HR": 0.16, "NO": 0.15, "BG": 0.13, "MT": 0.13, "HU": 0.11, "IS": 0.11,
    "JP": 0.19, "SG": 0.22, "KH": 0.19, "PH": 0.17, "IL": 0.15, "TH": 0.12,
    "KR": 0.11, "ID": 0.10, "TW": 0.09, "AM": 0.09, "TR": 0.08, "VN": 0.08,
    "AE": 0.08, "CN": 0.08, "GE": 0.07, "IN": 0.07, "LK": 0.06, "NP": 0.06,
    "AZ": 0.05, "MY": 0.05, "MN": 0.05, "LA": 0.05, "KZ": 0.04, "MM": 0.04,
    "UZ": 0.03, "BT": 0.03, "KG": 0.02,
    # Europe outside the EU/EFTA.
    "GB": 0.29, "LI": 0.22, "AD": 0.15, "RS": 0.09, "ME": 0.10,
    "AL": 0.10, "BA": 0.10, "MK": 0.09, "MD": 0.10,
    # The Americas. Several of these are heavily subsidised, which is a real
    # saving to a resident and a political risk to a buyer.
    "US": 0.16, "CA": 0.13, "MX": 0.10, "BR": 0.13, "AR": 0.06,
    "CL": 0.16, "UY": 0.20, "CO": 0.14, "PE": 0.16, "EC": 0.09,
    "BO": 0.07, "PY": 0.05, "CR": 0.16, "PA": 0.19, "GT": 0.19,
    "BZ": 0.20, "DO": 0.16, "JM": 0.28, "TT": 0.05, "BB": 0.28,
    "BS": 0.30,
    # Oceania and Africa.
    "AU": 0.21, "NZ": 0.19, "ZA": 0.14, "MA": 0.11, "NA": 0.11,
    "CV": 0.24, "BW": 0.09, "EG": 0.03, "TN": 0.07, "MU": 0.14,
    "SC": 0.19, "KE": 0.17, "TZ": 0.10, "GH": 0.09, "RW": 0.19,
    "ET": 0.01,
}

# Top marginal personal income tax rate and standard VAT, percent. Indicative,
# 2025, national rates before regional surcharges or special regimes. Relevant
# only if you actually become tax resident -- see the README.
TAX = {
    "ES": (47, 21), "PT": (48, 23), "FR": (45, 20), "DE": (45, 19), "IT": (43, 22),
    "IE": (40, 23), "NL": (49.5, 21), "BE": (50, 21), "AT": (55, 20), "GR": (44, 24),
    "PL": (32, 23), "CZ": (23, 21), "SK": (25, 23), "HU": (15, 27), "RO": (10, 19),
    "BG": (10, 20), "HR": (30, 25), "SI": (50, 22), "EE": (20, 22), "LV": (31, 21),
    "LT": (32, 21), "FI": (57, 25.5), "SE": (52, 25), "DK": (56, 25), "NO": (47.4, 25),
    "IS": (46, 24), "CH": (40, 8.1), "LU": (42, 17), "MT": (35, 18), "CY": (35, 19),
    "JP": (55.9, 10), "KR": (49.5, 10), "TW": (40, 5), "GE": (20, 18), "AM": (20, 20),
    "TR": (40, 20), "IL": (50, 17), "KZ": (10, 12), "AZ": (25, 18), "MY": (30, 8),
    "TH": (35, 7), "VN": (35, 10), "PH": (35, 12), "SG": (24, 9), "AE": (0, 5),
    "KH": (20, 10), "LK": (36, 18), "MN": (10, 10), "KG": (10, 12), "UZ": (12, 12),
    "ID": (35, 11), "CN": (45, 13), "IN": (30, 18), "NP": (36, 13), "BT": (30, 0),
    "MM": (25, 5), "LA": (25, 10),
    # Europe outside the EU/EFTA.
    "GB": (45, 20), "LI": (24, 8.1), "AD": (10, 4.5), "RS": (20, 20),
    "ME": (15, 21), "AL": (23, 20), "BA": (10, 17), "MK": (10, 18),
    "MD": (12, 20),
    # The Americas. The United States and Canada have no VAT; the figure is the
    # average combined sales tax and the average provincial HST respectively,
    # which is the nearest comparable thing rather than the same thing.
    "US": (37, 7.5), "CA": (53, 12), "MX": (35, 16), "BR": (27.5, 17),
    "AR": (35, 21), "CL": (40, 19), "UY": (36, 22), "CO": (39, 19),
    "PE": (30, 18), "EC": (37, 15), "BO": (13, 13), "PY": (10, 10),
    "CR": (25, 13), "PA": (25, 7), "GT": (7, 12), "BZ": (25, 12.5),
    "DO": (25, 18), "JM": (25, 15), "TT": (30, 12.5), "BB": (28.5, 17.5),
    "BS": (0, 10),
    # Oceania and Africa.
    "AU": (45, 10), "NZ": (39, 15), "ZA": (45, 15), "MA": (38, 20),
    "NA": (37, 15), "CV": (25, 15), "BW": (25, 14), "EG": (25, 14),
    "TN": (35, 19), "MU": (20, 15), "SC": (30, 15), "KE": (35, 16),
    "TZ": (30, 18), "GH": (35, 15), "RW": (30, 18), "ET": (35, 15),
}


def _wb_latest(indicator):
    """Most recent non-null value per ISO-2 country, 2015 to 2024."""
    raw = c.fetch(WB.format(indicator), cache_key=f"wb_{indicator}_v2")
    doc = json.loads(raw)
    if len(doc) < 2 or not doc[1]:
        raise SystemExit(f"World Bank returned no data for {indicator}: {doc[0]}")
    page = doc[0]
    if page.get("pages", 1) > 1:
        c.warn(f"{indicator}: {page['pages']} pages, only the first was read")
    out = {}
    for row in doc[1]:
        v, iso = row.get("value"), row["country"]["id"]
        if v is None:
            continue
        year = int(row["date"])
        if iso not in out or year > out[iso][0]:
            out[iso] = (year, float(v))
    return out


def world_bank_price_levels():
    """PPP conversion factor / market exchange rate, per ISO-2 country code."""
    def latest(indicator):
        raw = c.fetch(WB.format(indicator), cache_key=f"wb_{indicator}_v2")
        doc = json.loads(raw)
        if len(doc) < 2 or not doc[1]:
            raise SystemExit(f"World Bank returned no data for {indicator}: {doc[0]}")
        page = doc[0]
        if page.get("pages", 1) > 1:
            c.warn(f"{indicator}: {page['pages']} pages, only the first was read")
        out = {}
        for row in doc[1]:
            v, iso = row.get("value"), row["country"]["id"]
            if v is None:
                continue
            year = int(row["date"])
            if iso not in out or year > out[iso][0]:
                out[iso] = (year, float(v))
        return {k: v for k, (_, v) in out.items()}

    ppp = latest(PPP_PRIVATE)
    fx = latest(FX_RATE)
    level = {}
    for iso, p in ppp.items():
        f = fx.get(iso)
        if f and f > 0:
            level[iso] = p / f
    c.log(f"World Bank price levels for {len(level)} countries", 1)
    return level


def degree_days(monthly_tmax, monthly_tmin):
    """Heating and cooling degree days from monthly normals."""
    mean = (np.array(monthly_tmax) + np.array(monthly_tmin)) / 2.0
    hdd = float((np.maximum(0.0, HDD_BASE - mean) * DAYS_IN_MONTH).sum())
    cdd = float((np.maximum(0.0, mean - CDD_BASE) * DAYS_IN_MONTH).sum())
    return hdd, cdd


def run():
    c.log("stage: costs")
    places = c.read_stage("places")
    climate = c.read_stage("climate")

    level = world_bank_price_levels()
    homicide = _wb_latest(HOMICIDE)
    c.log(f"homicide rates for {len(homicide)} countries", 1)
    base = level.get(BASE_COUNTRY)
    if not base:
        raise SystemExit("no price level for the base country; cannot rebase")
    c.log(f"rebased so {BASE_COUNTRY} = 100 (raw level {base:.3f})", 1)

    missing_level, missing_elec = set(), set()
    rows = {}
    for p in places:
        cc = p["country"]
        cl = climate.get(p["id"])
        if cl is None:
            continue

        lv = level.get(cc)
        if lv is None:
            missing_level.add(cc)
        elec = ELECTRICITY.get(cc)
        if elec is None:
            missing_elec.add(cc)

        hdd, cdd = degree_days(cl["monthlyTmax"], cl["monthlyTmin"])
        kwh = DWELLING_M2 * (KWH_PER_M2_HDD * hdd + KWH_PER_M2_CDD * cdd)
        tax = TAX.get(cc)

        rows[p["id"]] = {
            "costIndex": round(100.0 * lv / base) if lv else None,
            "hdd": round(hdd),
            "cdd": round(cdd),
            "energyKwh": round(kwh),
            "energyEurYear": round(kwh * elec) if elec else None,
            "electricityEurKwh": elec,
            "incomeTaxTop": tax[0] if tax else None,
            "vat": tax[1] if tax else None,
            "homicideRate": round(homicide[cc][1], 1) if cc in homicide else None,
            "homicideYear": homicide[cc][0] if cc in homicide else None,
        }

    if missing_level:
        c.warn(f"no World Bank price level for: {', '.join(sorted(missing_level))}")
    if missing_elec:
        c.warn(f"no electricity price for: {', '.join(sorted(missing_elec))}")

    c.write_stage("costs", rows)

    c.log("cost sanity (index rebased Spain = 100):", 1)
    probe = {
        "ES-28079": "Madrid", "ES-48020": "Bilbao", "ES-27028": "Lugo",
        "DE-2950159": "Berlin", "RO-683844": "Brasov", "JP-2128295": "Sapporo",
        "PT-2735943": "Porto", "CH-2657896": "Zurich",
    }
    for pid, label in probe.items():
        r = rows.get(pid)
        if r:
            c.log(f"  {label:<9} cost={str(r['costIndex']):>4}  HDD={r['hdd']:>5}  CDD={r['cdd']:>4}  "
                  f"energy={str(r['energyEurYear']):>5} EUR/yr  tax={r['incomeTaxTop']}% VAT={r['vat']}%  "
                  f"homicide={r['homicideRate']}/100k ({r['homicideYear']})", 1)
    missing_h = sorted({p["country"] for p in places} - set(homicide))
    if missing_h:
        c.warn(f"no homicide rate for: {', '.join(missing_h)}")
    vals = [r["costIndex"] for r in rows.values() if r["costIndex"]]
    if vals:
        c.log(f"  cost index across {len(vals):,} places: "
              f"p10 {np.percentile(vals, 10):.0f}, median {np.median(vals):.0f}, "
              f"p90 {np.percentile(vals, 90):.0f}", 1)
    return rows


if __name__ == "__main__":
    run()
