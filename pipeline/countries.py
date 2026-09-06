"""One registry for every country the tool covers.

Three stages needed the same facts and were each keeping their own copy: places
wanted names and population floors, prices wanted a national average, emit
wanted the notes. Splitting that across files guaranteed they would drift, so
they all read from here now.

Each entry answers four questions about a Spanish passport holder:

  continent   which climate calibration region the place belongs to
  residence   `free` where the passport itself grants the right to live and
              work (EU/EFTA), `visa` everywhere else. Buying a home nowhere
              grants residency, and the two questions are genuinely separate:
              you can own a house in Tokyo without being allowed to live in it
              year round, and you can live anywhere in the EU without being
              able to afford one.
  ownership   whether you can actually acquire the thing:
                freehold    buy in your own name, essentially as a local would
                restricted  possible, but under quotas, minimum prices, zone
                            rules or unit-type limits
                leasehold   use-rights or long leases only, no freehold
                prohibited  not realistically available to a non-resident
                            foreigner
  note        the actual rule, in one sentence, because "restricted" alone is
              not enough to act on. Mexico and Australia are both restricted and
              they are not remotely the same problem.

INDICATIVE ONLY. Checked September 2026 against government sources and law-firm
summaries, but property law changes and none of this is legal advice. Verify
with a notary or lawyer in the country before acting on any of it.

The country set is deliberately not "every country on earth". Places are here
when a Spanish passport holder could plausibly buy and live in one, or when the
answer is a clear no worth stating. Somewhere with an active war, no functioning
land registry, or no route to a long stay is left out rather than listed with a
misleading tier.
"""
from __future__ import annotations

# --------------------------------------------------------------------------
# code: (name, continent, residence, ownership, note)
# --------------------------------------------------------------------------

_FREE_EU = "Freedom of movement: a Spanish passport carries the right to live, work and buy here."

COUNTRIES: dict[str, tuple[str, str, str, str, str]] = {
    # ---------------------------------------------------------------- Europe
    # EU27 plus EFTA. The passport does the work; ownership is unrestricted for
    # EU nationals everywhere here, with Denmark the one real caveat.
    "AT": ("Austria", "Europe", "free", "freehold", _FREE_EU),
    "BE": ("Belgium", "Europe", "free", "freehold", _FREE_EU),
    "BG": ("Bulgaria", "Europe", "free", "freehold", _FREE_EU),
    "HR": ("Croatia", "Europe", "free", "freehold", _FREE_EU),
    "CY": ("Cyprus", "Europe", "free", "freehold", _FREE_EU),
    "CZ": ("Czechia", "Europe", "free", "freehold", _FREE_EU),
    "DK": ("Denmark", "Europe", "free", "restricted",
           "EU nationals may buy freely once resident; buying a home before "
           "establishing residence needs Ministry of Justice permission, and "
           "second homes are restricted regardless of nationality."),
    "EE": ("Estonia", "Europe", "free", "freehold", _FREE_EU),
    "FI": ("Finland", "Europe", "free", "freehold", _FREE_EU),
    "FR": ("France", "Europe", "free", "freehold", _FREE_EU),
    "DE": ("Germany", "Europe", "free", "freehold", _FREE_EU),
    "GR": ("Greece", "Europe", "free", "freehold", _FREE_EU),
    "HU": ("Hungary", "Europe", "free", "freehold", _FREE_EU),
    "IE": ("Ireland", "Europe", "free", "freehold", _FREE_EU),
    "IT": ("Italy", "Europe", "free", "freehold", _FREE_EU),
    "LV": ("Latvia", "Europe", "free", "freehold", _FREE_EU),
    "LT": ("Lithuania", "Europe", "free", "freehold", _FREE_EU),
    "LU": ("Luxembourg", "Europe", "free", "freehold", _FREE_EU),
    "MT": ("Malta", "Europe", "free", "restricted",
           "EU nationals may buy one home freely; a second property, and any "
           "purchase outside a Special Designated Area, needs an AIP permit "
           "unless you have lived in Malta five years."),
    "NL": ("Netherlands", "Europe", "free", "freehold", _FREE_EU),
    "PL": ("Poland", "Europe", "free", "freehold", _FREE_EU),
    "PT": ("Portugal", "Europe", "free", "freehold", _FREE_EU),
    "RO": ("Romania", "Europe", "free", "freehold", _FREE_EU),
    "SK": ("Slovakia", "Europe", "free", "freehold", _FREE_EU),
    "SI": ("Slovenia", "Europe", "free", "freehold", _FREE_EU),
    "ES": ("Spain", "Europe", "free", "freehold", "Home."),
    "SE": ("Sweden", "Europe", "free", "freehold", _FREE_EU),
    "IS": ("Iceland", "Europe", "free", "freehold", _FREE_EU),
    "LI": ("Liechtenstein", "Europe", "free", "restricted",
           "EEA membership grants the right to buy, but residence permits are "
           "quota-limited and most communes require you to live in the property."),
    "NO": ("Norway", "Europe", "free", "freehold", _FREE_EU),
    "CH": ("Switzerland", "Europe", "free", "restricted",
           "Resident EU nationals buy as locals do; non-residents fall under "
           "Lex Koller, which caps holiday-home purchases by canton quota."),

    # Europe outside the EU/EFTA. Buying is mostly straightforward, living
    # there is not: each needs a residence permit or long-stay visa.
    "GB": ("United Kingdom", "Europe", "visa", "freehold",
           "No restriction on foreign buyers, but a 2% non-resident stamp duty "
           "surcharge applies. Since Brexit an EU passport gives no right to "
           "live here; you would need a visa."),
    "RS": ("Serbia", "Europe", "visa", "freehold",
           "Reciprocity based, and Spain qualifies, so buying a home is "
           "straightforward. Agricultural land is restricted."),
    "ME": ("Montenegro", "Europe", "visa", "freehold",
           "Foreigners may own apartments and houses outright; land is bought "
           "through a local company, which is routine."),
    "AL": ("Albania", "Europe", "visa", "restricted",
           "Buildings and apartments may be owned outright; land only where "
           "the built value exceeds three times the land value."),
    "BA": ("Bosnia and Herzegovina", "Europe", "visa", "restricted",
           "Reciprocity based and applied inconsistently between the entities; "
           "buying through a local company is the usual route."),
    "MK": ("North Macedonia", "Europe", "visa", "restricted",
           "EU nationals may own buildings on a reciprocity basis; "
           "agricultural land is closed to foreigners."),
    "MD": ("Moldova", "Europe", "visa", "restricted",
           "Apartments and houses may be owned outright; foreigners may not "
           "acquire agricultural or forest land."),
    "AD": ("Andorra", "Europe", "visa", "restricted",
           "Non-residents need government authorisation for each purchase, and "
           "residence itself is quota-limited with a substantial deposit."),

    # ------------------------------------------------------------------ Asia
    #
    # An EU passport buys visa-free tourist entry across much of Asia, which is
    # not the same as a right to live. Every entry here is `visa`, and the
    # ownership tier is what actually decides whether a place is worth showing.
    "JP": ("Japan", "Asia", "visa", "freehold",
           "One of the most open markets anywhere: no residency requirement, "
           "no minimum price, no approval, and land as well as buildings."),
    "KR": ("South Korea", "Asia", "visa", "freehold",
           "Foreigners buy on the same terms as citizens, subject only to a "
           "reporting requirement after purchase."),
    "TW": ("Taiwan", "Asia", "visa", "freehold",
           "Reciprocity based and Spain qualifies, so purchase is open."),
    "GE": ("Georgia", "Asia", "visa", "freehold",
           "Open to foreigners for non-agricultural property; agricultural "
           "land is reserved for citizens."),
    "AM": ("Armenia", "Asia", "visa", "freehold",
           "Foreigners may own buildings and apartments outright; land is "
           "held through a company or long lease."),
    "TR": ("Turkey", "Asia", "visa", "freehold",
           "Open to Spanish nationals, capped at 30 hectares per person and "
           "excluded from designated military zones."),
    "IL": ("Israel", "Asia", "visa", "freehold",
           "Foreigners may buy, though most land is state owned and sold as a "
           "renewable 49 or 98 year lease rather than freehold."),
    "KZ": ("Kazakhstan", "Asia", "visa", "freehold",
           "Apartments may be owned outright; agricultural land may not be "
           "owned or leased by foreigners."),
    "AZ": ("Azerbaijan", "Asia", "visa", "freehold",
           "Apartments and buildings may be owned; land is leased."),
    "MY": ("Malaysia", "Asia", "visa", "restricted",
           "Each state sets a minimum purchase price for foreigners, "
           "typically RM1m in Kuala Lumpur and RM500k to RM2m elsewhere."),
    "TH": ("Thailand", "Asia", "visa", "restricted",
           "Condominium units only, and no more than 49% of a building's floor "
           "area may be foreign owned. Land is closed to foreigners."),
    "VN": ("Vietnam", "Asia", "visa", "restricted",
           "Apartments only, capped at 30% of a building, on a renewable "
           "50 year term rather than outright ownership."),
    "PH": ("Philippines", "Asia", "visa", "restricted",
           "Condominium units only, capped at 40% of a project. Land may not "
           "be owned by foreigners."),
    "SG": ("Singapore", "Asia", "visa", "restricted",
           "Condominiums only, and a 60% additional buyer's stamp duty on "
           "foreign purchases makes it prohibitive in practice."),
    "AE": ("United Arab Emirates", "Asia", "visa", "restricted",
           "Freehold in designated zones in Dubai and Abu Dhabi; leasehold or "
           "closed elsewhere."),
    "KH": ("Cambodia", "Asia", "visa", "restricted",
           "Co-owned units above the ground floor only; land and ground floors "
           "are closed to foreigners."),
    "LK": ("Sri Lanka", "Asia", "visa", "restricted",
           "Apartments may be owned outright; land may only be leased, for up "
           "to 99 years."),
    "MN": ("Mongolia", "Asia", "visa", "restricted",
           "Apartments may be owned; land is not privately owned by anyone, "
           "citizens included, and is held on a use right."),
    "KG": ("Kyrgyzstan", "Asia", "visa", "restricted",
           "Apartments and buildings may be owned; land is leased."),
    "UZ": ("Uzbekistan", "Asia", "visa", "restricted",
           "Apartments may be owned, usually tied to a residence permit; land "
           "is state owned."),
    "ID": ("Indonesia", "Asia", "visa", "leasehold",
           "No freehold for foreigners. Hak Pakai gives a renewable 30 year "
           "right of use and requires a residence permit."),
    "CN": ("China", "Asia", "visa", "prohibited",
           "Purchase requires a year of local residence or work, is limited to "
           "one property for self use, and all land is leased from the state."),
    "IN": ("India", "Asia", "visa", "prohibited",
           "Non-resident foreigners who are not of Indian origin may not "
           "acquire property at all without RBI approval."),
    "NP": ("Nepal", "Asia", "visa", "prohibited",
           "Foreigners may not own land or houses."),
    "BT": ("Bhutan", "Asia", "visa", "prohibited",
           "Land ownership is reserved for citizens."),
    "MM": ("Myanmar", "Asia", "visa", "prohibited",
           "Foreigners may not own land, and the condominium regime is not "
           "functioning in practice."),
    "LA": ("Laos", "Asia", "visa", "prohibited",
           "Foreigners may not own land; only apartments in limited cases."),

    # -------------------------------------------------------------- Americas
    "US": ("United States", "Americas", "visa", "freehold",
           "No federal restriction on foreign buyers of residential property, "
           "and no state restriction that touches Spanish nationals. Owning a "
           "home grants no visa, and US immigration is the hard part."),
    "CA": ("Canada", "Americas", "visa", "restricted",
           "Non-Canadians may not buy residential property inside a Census "
           "Metropolitan Area or Census Agglomeration until 1 January 2027; "
           "smaller and rural communities are exempt. Ontario adds a 25% "
           "non-resident speculation tax and British Columbia 20%."),
    "MX": ("Mexico", "Americas", "visa", "restricted",
           "Freehold inland. Within 50 km of the coast or 100 km of a land "
           "border, foreigners hold through a bank trust (fideicomiso): a "
           "renewable 50 year instrument that carries full owner's rights."),
    "BR": ("Brazil", "Americas", "visa", "freehold",
           "Urban residential property is open to foreigners on the same terms "
           "as citizens. Rural land is capped per municipality and needs "
           "authorisation within 150 km of a border."),
    "AR": ("Argentina", "Americas", "visa", "freehold",
           "Urban property is unrestricted. Rural land is capped at 15% "
           "foreign ownership per district, and border security zones need "
           "prior authorisation."),
    "CL": ("Chile", "Americas", "visa", "freehold",
           "Homes and apartments are open to foreigners; the border-zone rule "
           "bars only nationals of neighbouring countries, so a Spanish "
           "passport is unaffected. Buying bare land near the coast or a "
           "border can still need authorisation."),
    "UY": ("Uruguay", "Americas", "visa", "freehold",
           "No geographic restriction at all on residential property: coast, "
           "border and city alike are open to foreign buyers."),
    "CO": ("Colombia", "Americas", "visa", "freehold",
           "Foreigners buy on the same terms as citizens; the purchase can "
           "support a migrant visa above a threshold value."),
    "PE": ("Peru", "Americas", "visa", "freehold",
           "Open to foreigners except within 50 km of a border, where it is "
           "constitutionally prohibited."),
    "EC": ("Ecuador", "Americas", "visa", "freehold",
           "Foreigners buy on the same terms as citizens, with no restricted "
           "zone."),
    "PY": ("Paraguay", "Americas", "visa", "freehold",
           "Open to foreigners; rural land within 50 km of a border is "
           "restricted."),
    "BO": ("Bolivia", "Americas", "visa", "restricted",
           "Foreigners may not own property within 50 km of any border, which "
           "covers a large share of the country."),
    "CR": ("Costa Rica", "Americas", "visa", "freehold",
           "Foreigners hold the same property rights as citizens, except in "
           "the 200 m maritime zone, where only concessions are available."),
    "PA": ("Panama", "Americas", "visa", "freehold",
           "Open to foreigners except within 10 km of a border and on some "
           "islands."),
    "GT": ("Guatemala", "Americas", "visa", "freehold",
           "Open to foreigners, with border-strip restrictions."),
    "BZ": ("Belize", "Americas", "visa", "freehold",
           "Open to foreigners on the same terms as citizens."),
    "DO": ("Dominican Republic", "Americas", "visa", "freehold",
           "No restriction on foreign buyers of residential property."),
    "TT": ("Trinidad and Tobago", "Americas", "visa", "restricted",
           "A licence is required above one acre of residential land under the "
           "Foreign Investment Act."),
    "JM": ("Jamaica", "Americas", "visa", "freehold",
           "Open to foreigners, subject to exchange-control registration."),
    "BB": ("Barbados", "Americas", "visa", "freehold",
           "Open to foreigners; funds must be registered with the central bank."),
    "BS": ("Bahamas", "Americas", "visa", "freehold",
           "Open to foreigners; a permit is required above five acres or for "
           "rental use."),

    # --------------------------------------------------------------- Oceania
    "AU": ("Australia", "Oceania", "visa", "restricted",
           "Foreign persons are banned from buying established dwellings from "
           "1 April 2025 to 30 June 2029. New builds are possible with FIRB "
           "approval, an application fee and a state stamp-duty surcharge."),
    "NZ": ("New Zealand", "Oceania", "visa", "prohibited",
           "Non-residents have been barred from buying existing homes since "
           "2018. A December 2025 amendment reopened purchases above NZ$5m, "
           "but only for holders of investor residency visas."),

    # ---------------------------------------------------------------- Africa
    "ZA": ("South Africa", "Africa", "visa", "freehold",
           "Full freehold for foreigners, land included, on the same terms as "
           "citizens. Agricultural land above 12 ha may face future approval "
           "requirements under legislation still not enacted."),
    "MA": ("Morocco", "Africa", "visa", "freehold",
           "Apartments, houses and riads may be owned outright; agricultural "
           "land is reserved for Moroccan citizens."),
    "NA": ("Namibia", "Africa", "visa", "freehold",
           "Urban freehold is open to foreigners; agricultural land is "
           "restricted."),
    "CV": ("Cape Verde", "Africa", "visa", "freehold",
           "Open to foreigners on the same terms as citizens."),
    "BW": ("Botswana", "Africa", "visa", "restricted",
           "Freehold exists but is rare; most land is tribal or state land, "
           "where foreigners hold long leases with ministerial consent."),
    "EG": ("Egypt", "Africa", "visa", "restricted",
           "Two properties maximum, each capped at 4,000 m2, excluding Sinai "
           "and designated strategic areas."),
    "TN": ("Tunisia", "Africa", "visa", "restricted",
           "Urban property needs the regional governor's authorisation; "
           "agricultural land is closed to foreigners."),
    "MU": ("Mauritius", "Africa", "visa", "restricted",
           "Foreigners may buy only within approved schemes, generally above "
           "USD 375,000, which also carries residence."),
    "SC": ("Seychelles", "Africa", "visa", "restricted",
           "Every purchase needs government sanction and carries an "
           "immovable property tax on non-residents."),
    "KE": ("Kenya", "Africa", "visa", "leasehold",
           "Foreigners may hold land only on leasehold, capped at 99 years. "
           "Freehold is reserved for citizens."),
    "TZ": ("Tanzania", "Africa", "visa", "leasehold",
           "All land is public. Foreigners hold derivative rights through the "
           "investment centre, in practice for investment purposes only."),
    "GH": ("Ghana", "Africa", "visa", "leasehold",
           "Foreigners may hold leases of up to 50 years; freehold is "
           "reserved for citizens."),
    "RW": ("Rwanda", "Africa", "visa", "leasehold",
           "Foreigners hold land on leases of up to 99 years."),
    "ET": ("Ethiopia", "Africa", "visa", "prohibited",
           "All land is state owned and non-resident foreigners who are not of "
           "Ethiopian origin may not acquire residential property."),
}

# Resolution follows two things: how actionable a place is, and how central it
# is to the search that was actually asked for.
#
# Spain is the primary search and the only country with real municipal price
# data, so it goes down to 500. The EU/EFTA carries the right of residence, so
# small towns are worth resolving at 5,000. Asia was the third ring and keeps
# 5,000 where you can buy freehold, because a cool-summer town in Tohoku is a
# genuine option and there are only ~1,200 of them. The rest of the world is the
# outermost ring: the floor rises there, which is enough to find the right
# region without pretending to a village-level precision that the price and
# amenity data could not support anyway. Without it the United States and Brazil
# alone would add 12,000 rows and nearly double the payload.
ES_POP_FLOOR = 500
EU_POP_FLOOR = 5_000
ASIA_POP_FLOOR = {
    "freehold": 5_000,
    "restricted": 25_000,
    "leasehold": 25_000,
    "prohibited": 50_000,
}
WORLD_POP_FLOOR = {
    "freehold": 15_000,
    "restricted": 25_000,
    "leasehold": 25_000,
    "prohibited": 50_000,
}

# The EU/EFTA set, frozen. New European countries join `continent == "Europe"`
# for the climate calibration but must NOT join this set: climate.py picks its
# anchors from it, and a changed membership reshuffles every choice, throwing
# away cached fetches for countries that had not changed.
EU_EFTA = frozenset(
    cc for cc, v in COUNTRIES.items()
    if v[1] == "Europe" and v[2] == "free"
)

ASIA = frozenset(cc for cc, v in COUNTRIES.items() if v[1] == "Asia")


def name(cc: str) -> str:
    return COUNTRIES[cc][0]


def continent(cc: str) -> str:
    return COUNTRIES[cc][1]


def residence(cc: str) -> str:
    return COUNTRIES[cc][2]


def ownership(cc: str) -> str:
    return COUNTRIES[cc][3]


def note(cc: str) -> str:
    return COUNTRIES[cc][4]


def pop_floor(cc: str) -> int:
    """The smallest place worth carrying for this country."""
    if cc == "ES":
        return ES_POP_FLOOR
    if cc in EU_EFTA:
        return EU_POP_FLOOR
    if cc in ASIA:
        return ASIA_POP_FLOOR[ownership(cc)]
    return WORLD_POP_FLOOR[ownership(cc)]


def notes_table() -> dict[str, dict]:
    """Country facts for the UI, emitted once rather than per row."""
    return {
        cc: {
            "name": v[0],
            "continent": v[1],
            "residence": v[2],
            "ownership": v[3],
            "note": v[4],
        }
        for cc, v in COUNTRIES.items()
    }
