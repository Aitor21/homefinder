"""Who is actually building and selling new homes, and where.

A property portal answers "what is for sale today". It does not answer "who is
building here", and for new construction that is the more useful question:
promotions sell off-plan, often before they reach a portal at all, and the way
in is the developer's own waiting list.

The interesting finding this encodes is that the market is not one market. The
national league table is dominated by a handful of listed companies, but in the
Basque Country those companies are barely present: the homes being built there
come from Amenabar and Jaureguizar, names absent from the national top ten. A
search that only knew the big names would miss the whole region, which happens
to be the coolest-summer corner of Spain and therefore where this tool points
most often.

  countries   ISO codes where the company actually builds and sells. A firm is
              only offered in a country on this list.
  scope       `national` covers a whole country, so it is shown across it with a
              caveat rather than a promise. `regional` is shown only in the
              provinces listed, which is the honest thing to do with a company
              that genuinely builds in two of them. `international` builds in
              several countries.
  provinces   INE two-digit province codes. Spain only: it is the one country
              here with municipal-level data worth matching against.
  scale       rough size by homes delivered, for ordering rather than precision.

Everywhere outside Spain the granularity is the country, not the province.
Pretending otherwise would invent a precision the sources do not support.

INDICATIVE, checked September 2026 against company sites and trade press.
Coverage changes constantly as land banks move, so treat a listing as "worth
checking" rather than "confirmed building here right now".
"""
from __future__ import annotations

# INE province codes used below, for readability when editing.
ARABA, ASTURIAS, BALEARES, BARCELONA = "01", "33", "07", "08"
BIZKAIA, CANTABRIA, GIPUZKOA, NAVARRA = "48", "39", "20", "31"
A_CORUNA, LUGO, OURENSE, PONTEVEDRA = "15", "27", "32", "36"
MADRID, VALENCIA, SEVILLA, MALAGA = "28", "46", "41", "29"
ALICANTE, ZARAGOZA, BURGOS, LEON = "03", "50", "09", "24"

NORTH = [BIZKAIA, GIPUZKOA, ARABA, CANTABRIA, ASTURIAS,
         A_CORUNA, LUGO, OURENSE, PONTEVEDRA]

# code: name, site, promotions page, scope, provinces, scale, note
DEVELOPERS: dict[str, dict] = {
    # ---------------------------------------------------------- national
    "neinor": {
        "name": "Neinor Homes",
        "site": "https://www.neinorhomes.com",
        "promotions": "https://www.neinorhomes.com/promociones",
        "countries": ["ES"],
        "scope": "national",
        "provinces": [],
        "scale": "very large",
        "note": "Acquired AEDAS Homes in 2026, creating the largest developer in "
                "Spain: a land bank of around 38,000 homes and capacity for "
                "6,000 to 7,000 completions a year. Started in Bilbao and still "
                "has unusually deep coverage of the north.",
    },
    "aedas": {
        "name": "AEDAS Homes",
        "site": "https://www.aedashomes.com",
        "promotions": "https://www.aedashomes.com/obra-nueva",
        "countries": ["ES"],
        "scope": "national",
        "provinces": [],
        "scale": "very large",
        "note": "The largest deliverer of new homes in Spain by volume before "
                "being bought by Neinor in 2026. Still sells under its own brand.",
    },
    "metrovacesa": {
        "name": "Metrovacesa",
        "site": "https://www.metrovacesa.com",
        "promotions": "https://www.metrovacesa.com",
        "countries": ["ES"],
        "scope": "national",
        "provinces": [],
        "scale": "very large",
        "note": "Second by volume nationally, with roughly 5,400 homes in the "
                "2026 to 2028 pipeline. Santander in origin, listed since 2018.",
    },
    "culmia": {
        "name": "Culmia",
        "site": "https://www.culmia.com",
        "promotions": "https://www.culmia.com",
        "countries": ["ES"],
        "scope": "national",
        "provinces": [],
        "scale": "very large",
        "note": "Around 4,700 homes in the 2026 to 2028 pipeline. Builds a high "
                "share of protected housing, so check the VPO conditions.",
    },
    "viacelere": {
        "name": "Vía Célere",
        "site": "https://www.viacelere.com",
        "promotions": "https://www.viacelere.com",
        "countries": ["ES"],
        "scope": "national",
        "provinces": [],
        "scale": "large",
        "note": "National, with most of its output in Madrid, Andalusia and the "
                "Mediterranean rather than the north.",
    },
    "habitat": {
        "name": "Habitat Inmobiliaria",
        "site": "https://www.habitatinmobiliaria.com",
        "promotions": "https://www.habitatinmobiliaria.com",
        "countries": ["ES"],
        "scope": "national",
        "provinces": [],
        "scale": "large",
        "note": "National coverage including Galicia and the Basque Country.",
    },
    "kronos": {
        "name": "Kronos Homes",
        "site": "https://kronoshomes.com",
        "promotions": "https://kronoshomes.com",
        "countries": ["ES"],
        "scope": "national",
        "provinces": [],
        "scale": "large",
        "note": "Around 4,100 homes delivered across 2024 to 2026, weighted to "
                "Madrid and the Mediterranean coast.",
    },
    "pryconsa": {
        "name": "Pryconsa",
        "site": "https://www.pryconsa.es",
        "promotions": "https://www.pryconsa.es/viviendas",
        "countries": ["ES"],
        "scope": "national",
        "provinces": [],
        "scale": "large",
        "note": "Long-established, family-held, heavily weighted to Madrid.",
    },
    "aelca": {
        "name": "Aelca",
        "site": "https://www.aelca.es",
        "promotions": "https://www.aelca.es/es/proyectos/",
        "countries": ["ES"],
        "scope": "national",
        "provinces": [],
        "scale": "large",
        "note": "One of the few national developers with real presence on the "
                "Cantabrian coast: active in Bizkaia, Cantabria and Asturias as "
                "well as Madrid and the south.",
    },
    "gestilar": {
        "name": "Gestilar",
        "site": "https://www.gestilar.com",
        "promotions": "https://www.gestilar.com",
        "countries": ["ES"],
        "scope": "national",
        "provinces": [],
        "scale": "medium",
        "note": "Mid-size national, with a Galician presence alongside Madrid.",
    },
    "insur": {
        "name": "Grupo Insur",
        "site": "https://www.grupoinsur.com",
        "promotions": "https://www.grupoinsur.com/promociones",
        "countries": ["ES"],
        "scope": "national",
        "provinces": [],
        "scale": "medium",
        "note": "Listed, Seville in origin, mostly Andalusia and Madrid.",
    },
    "urbas": {
        "name": "Urbas",
        "site": "https://www.grupourbas.com",
        "promotions": "https://www.grupourbas.com",
        "countries": ["ES"],
        "scope": "national",
        "provinces": [],
        "scale": "large",
        "note": "High headline volumes across 2024 to 2026, spread widely.",
    },

    # ------------------------------------------------- Basque Country
    #
    # The point of this section: the national league table does not describe
    # this market. These two build more homes in Euskadi than the listed
    # majors do between them.
    "amenabar": {
        "name": "Amenabar",
        "site": "https://www.amenabarpromociones.com",
        "promotions": "https://www.amenabarpromociones.com/es/promociones/",
        "countries": ["ES"],
        "scope": "regional",
        "provinces": [GIPUZKOA, BIZKAIA, ARABA, NAVARRA, MADRID],
        "scale": "very large",
        "note": "First by homes under construction in the Basque Country, and "
                "around 4,600 in the 2026 to 2028 national pipeline. Builds both "
                "open-market and protected housing. San Sebastian in origin.",
    },
    "jaureguizar": {
        "name": "Jaureguizar",
        "site": "https://jaureguizar.com",
        "promotions": "https://jaureguizar.com",
        "countries": ["ES"],
        "scope": "regional",
        "provinces": [BIZKAIA, ARABA, GIPUZKOA],
        "scale": "large",
        "note": "Second only to Amenabar in the Basque Country and effectively "
                "absent elsewhere, which is why a national search misses it.",
    },
    "sukia": {
        "name": "Construcciones Sukia",
        "site": "https://www.sukia.com",
        "promotions": "https://www.sukia.com/es/promociones",
        "countries": ["ES"],
        "scope": "regional",
        "provinces": [GIPUZKOA, BIZKAIA],
        "scale": "medium",
        "note": "Basque, active across the Bilbao metropolitan belt. Runs "
                "pre-launch waiting lists, so promotions are often committed "
                "before they appear on any portal.",
    },
    "urbania": {
        "name": "Urbania",
        "site": "https://www.urbania.es",
        "promotions": "https://www.urbania.es",
        "countries": ["ES"],
        "scope": "regional",
        "provinces": [BIZKAIA, ARABA, GIPUZKOA, MADRID],
        "scale": "medium",
        "note": "Basque developer and land manager.",
    },
    "etxegin": {
        "name": "Etxegin",
        "site": "https://www.etxegin.com",
        "promotions": "https://www.etxegin.com",
        "countries": ["ES"],
        "scope": "regional",
        "provinces": [GIPUZKOA, BIZKAIA],
        "scale": "small",
        "note": "Gipuzkoa focused, small volumes.",
    },

    # ------------------------------------------------ Cantabria, Asturias
    "arcofisa": {
        "name": "Arcofisa",
        "site": "https://www.arcofisa.com",
        "promotions": "https://www.arcofisa.com",
        "countries": ["ES"],
        "scope": "regional",
        "provinces": [CANTABRIA],
        "scale": "small",
        "note": "Cantabrian, Santander and its bay.",
    },
    "tecniobras": {
        "name": "Grupo Tecniobras",
        "site": "https://www.tecniobras.com",
        "promotions": "https://www.tecniobras.com",
        "countries": ["ES"],
        "scope": "regional",
        "provinces": [CANTABRIA],
        "scale": "small",
        "note": "Cantabrian, coastal promotions around Santander.",
    },
    "sanjose": {
        "name": "Grupo San José",
        "site": "https://www.gruposanjose.biz",
        "promotions": "https://www.gruposanjose.biz",
        "countries": ["ES"],
        "scope": "national",
        "provinces": [],
        "scale": "medium",
        "note": "Galician in origin, builder as much as developer, with "
                "residential promotions in the northwest.",
    },
    "miltonhomes": {
        "name": "Milton Homes",
        "site": "https://www.miltonhomes.es",
        "promotions": "https://www.miltonhomes.es",
        "countries": ["ES"],
        "scope": "regional",
        "provinces": [ASTURIAS, CANTABRIA],
        "scale": "small",
        "note": "Asturias and Cantabria.",
    },

    # ------------------------------------------------------------ Galicia
    # Deliberately thin. Several Galician developers were checked and their
    # sites could not be confirmed, and a plausible-looking entry pointing
    # nowhere is worse than an honest gap.
}


# ---------------------------------------------------------------------------
# The rest of Europe.
#
# Country-level, because that is the granularity the sources actually support.
# Note what is NOT here: Vonovia, LEG, Gecina, Aroundtown and the rest of the
# names that dominate a search for "largest European real estate companies".
# They are landlords and investors. They will not sell you an apartment, so for
# this purpose they are noise.
EUROPE: dict[str, dict] = {
    # ------------------------------------------------------------- Nordics
    "bonava": {
        "name": "Bonava",
        "site": "https://www.bonava.com",
        "promotions": "https://www.bonava.com",
        "countries": ["SE", "DE", "FI", "EE", "LV", "LT"],
        "scope": "international", "provinces": [], "scale": "very large",
        "note": "Residential specialist across northern Europe, spun out of NCC. "
                "Builds for private buyers rather than for institutional landlords.",
    },
    "jm": {
        "name": "JM",
        "site": "https://www.jm.se",
        "promotions": "https://www.jm.se",
        "countries": ["SE", "NO", "FI"],
        "scope": "international", "provinces": [], "scale": "very large",
        "note": "One of the largest Nordic housing developers, concentrated on "
                "Stockholm and the other big Swedish cities.",
    },
    "skanska": {
        "name": "Skanska Residential",
        "site": "https://group.skanska.com",
        "promotions": "https://group.skanska.com",
        "countries": ["SE", "NO", "FI", "PL", "CZ"],
        "scope": "international", "provinces": [], "scale": "very large",
        "note": "The residential arm of the construction group, active across "
                "the Nordics and central Europe.",
    },
    "peab": {
        "name": "Peab Bostad",
        "site": "https://www.peab.se",
        "promotions": "https://www.peab.se",
        "countries": ["SE", "NO", "FI"],
        "scope": "international", "provinces": [], "scale": "large",
        "note": "Nordic contractor with a substantial own-development arm.",
    },
    "yit": {
        "name": "YIT",
        "site": "https://www.yit.fi",
        "promotions": "https://www.yit.fi",
        "countries": ["FI", "EE", "LV", "LT", "SK", "CZ", "PL"],
        "scope": "international", "provinces": [], "scale": "very large",
        "note": "The largest Finnish developer, also building across the Baltics "
                "and central Europe.",
    },
    "obos": {
        "name": "OBOS",
        "site": "https://www.obos.no",
        "promotions": "https://www.obos.no",
        "countries": ["NO", "SE"],
        "scope": "international", "provinces": [], "scale": "very large",
        "note": "A member-owned Norwegian cooperative, and the largest housing "
                "developer in Norway. Membership affects queue priority.",
    },
    "selvaag": {
        "name": "Selvaag Bolig",
        "site": "https://www.selvaagbolig.no",
        "promotions": "https://www.selvaagbolig.no",
        "countries": ["NO"],
        "scope": "national", "provinces": [], "scale": "large",
        "note": "Norwegian residential specialist, mostly around Oslo, Bergen "
                "and Stavanger.",
    },
    "veidekke": {
        "name": "Veidekke",
        "site": "https://www.veidekke.no",
        "promotions": "https://www.veidekke.no",
        "countries": ["NO", "SE", "DK"],
        "scope": "international", "provinces": [], "scale": "large",
        "note": "Scandinavian contractor with its own residential development.",
    },
    "ncc": {
        "name": "NCC",
        "site": "https://www.ncc.se",
        "promotions": "https://www.ncc.se",
        "countries": ["SE", "NO", "DK", "FI"],
        "scope": "international", "provinces": [], "scale": "large",
        "note": "Nordic contractor and developer.",
    },

    # --------------------------------------------------------------- France
    "nexity": {
        "name": "Nexity",
        "site": "https://www.nexity.fr",
        "promotions": "https://www.nexity.fr",
        "countries": ["FR"],
        "scope": "national", "provinces": [], "scale": "very large",
        "note": "The largest French residential developer, present in most "
                "sizeable French cities.",
    },
    "bouygues": {
        "name": "Bouygues Immobilier",
        "site": "https://www.bouygues-immobilier.com",
        "promotions": "https://www.bouygues-immobilier.com",
        "countries": ["FR"],
        "scope": "national", "provinces": [], "scale": "very large",
        "note": "Residential arm of the Bouygues group, national coverage.",
    },
    "kaufmanbroad": {
        "name": "Kaufman & Broad",
        "site": "https://www.kaufmanbroad.fr",
        "promotions": "https://www.kaufmanbroad.fr",
        "countries": ["FR"],
        "scope": "national", "provinces": [], "scale": "large",
        "note": "French homebuilder, strong in the west and southwest.",
    },
    "vinci-immobilier": {
        "name": "Vinci Immobilier",
        "site": "https://www.vinci-immobilier.com",
        "promotions": "https://www.vinci-immobilier.com",
        "countries": ["FR"],
        "scope": "national", "provinces": [], "scale": "large",
        "note": "Residential and mixed-use arm of Vinci.",
    },

    # -------------------------------------------------------------- Germany
    "instone": {
        "name": "Instone Real Estate",
        "site": "https://www.instone.de",
        "promotions": "https://www.instone.de",
        "countries": ["DE"],
        "scope": "national", "provinces": [], "scale": "large",
        "note": "One of the larger German residential developers selling to "
                "private buyers rather than to funds.",
    },
    "pandion": {
        "name": "Pandion",
        "site": "https://www.pandion.de",
        "promotions": "https://www.pandion.de",
        "countries": ["DE"],
        "scope": "national", "provinces": [], "scale": "medium",
        "note": "German developer, mainly the larger western cities.",
    },

    # ------------------------------------------------- Netherlands, Belgium
    "bpd": {
        "name": "BPD",
        "site": "https://www.bpd.nl",
        "promotions": "https://www.bpd.nl",
        "countries": ["NL", "DE"],
        "scope": "international", "provinces": [], "scale": "very large",
        "note": "The largest Dutch area and housing developer, also active in "
                "Germany. Owned by Rabobank.",
    },
    "heijmans": {
        "name": "Heijmans",
        "site": "https://www.heijmans.nl",
        "promotions": "https://www.heijmans.nl",
        "countries": ["NL"],
        "scope": "national", "provinces": [], "scale": "large",
        "note": "Dutch contractor with a large own-build housing arm.",
    },
    "matexi": {
        "name": "Matexi",
        "site": "https://www.matexi.be",
        "promotions": "https://www.matexi.be",
        "countries": ["BE"],
        "scope": "national", "provinces": [], "scale": "large",
        "note": "The largest Belgian neighbourhood developer.",
    },
    "immobel": {
        "name": "Immobel",
        "site": "https://www.immobelgroup.com",
        "promotions": "https://www.immobelgroup.com",
        "countries": ["BE", "LU", "FR", "PL"],
        "scope": "international", "provinces": [], "scale": "large",
        "note": "Listed Belgian developer, residential and mixed use.",
    },

    # -------------------------------------------------------------- Ireland
    "cairn": {
        "name": "Cairn Homes",
        "site": "https://cairnhomes.com",
        "promotions": "https://cairnhomes.com",
        "countries": ["IE"],
        "scope": "national", "provinces": [], "scale": "very large",
        "note": "The largest Irish homebuilder, concentrated on Dublin and "
                "the commuter belt.",
    },
    "glenveagh": {
        "name": "Glenveagh Properties",
        "site": "https://glenveagh.ie",
        "promotions": "https://glenveagh.ie",
        "countries": ["IE"],
        "scope": "national", "provinces": [], "scale": "very large",
        "note": "Listed Irish homebuilder, high volumes including affordable "
                "and social schemes.",
    },

    # ------------------------------------------------------------- Portugal
    "vanguard": {
        "name": "Vanguard Properties",
        "site": "https://vanguardproperties.com",
        "promotions": "https://vanguardproperties.com",
        "countries": ["PT"],
        "scope": "national", "provinces": [], "scale": "large",
        "note": "One of the larger Portuguese developers, Lisbon, Comporta "
                "and the Algarve.",
    },
    "habitatinvest": {
        "name": "Habitat Invest",
        "site": "https://www.habitatinvest.pt",
        "promotions": "https://www.habitatinvest.pt",
        "countries": ["PT"],
        "scope": "national", "provinces": [], "scale": "medium",
        "note": "Portuguese developer, mostly Lisbon and Porto.",
    },

    # --------------------------------------------------------------- Poland
    "domdevelopment": {
        "name": "Dom Development",
        "site": "https://www.domd.pl",
        "promotions": "https://www.domd.pl",
        "countries": ["PL"],
        "scope": "national", "provinces": [], "scale": "very large",
        "note": "The largest Polish residential developer, Warsaw, Tricity, "
                "Wroclaw and Krakow.",
    },
    "atal": {
        "name": "Atal",
        "site": "https://atal.pl",
        "promotions": "https://atal.pl",
        "countries": ["PL"],
        "scope": "national", "provinces": [], "scale": "very large",
        "note": "High-volume Polish developer across the major cities.",
    },
    "murapol": {
        "name": "Murapol",
        "site": "https://www.murapol.pl",
        "promotions": "https://www.murapol.pl",
        "countries": ["PL"],
        "scope": "national", "provinces": [], "scale": "large",
        "note": "Polish developer working in a wide spread of mid-size cities, "
                "not only the capitals.",
    },
    "archicom": {
        "name": "Archicom",
        "site": "https://www.archicom.pl",
        "promotions": "https://www.archicom.pl",
        "countries": ["PL"],
        "scope": "national", "provinces": [], "scale": "large",
        "note": "Wroclaw in origin, now national. Part of Echo Investment.",
    },

    # ------------------------------------------------------ Czechia, Austria
    "centralgroup": {
        "name": "Central Group",
        "site": "https://www.central-group.cz",
        "promotions": "https://www.central-group.cz",
        "countries": ["CZ"],
        "scope": "national", "provinces": [], "scale": "very large",
        "note": "By far the largest Czech residential developer, overwhelmingly "
                "Prague.",
    },
    "trigema": {
        "name": "Trigema",
        "site": "https://www.trigema.cz",
        "promotions": "https://www.trigema.cz",
        "countries": ["CZ"],
        "scope": "national", "provinces": [], "scale": "medium",
        "note": "Czech developer and contractor, mostly Prague.",
    },
    "ubm": {
        "name": "UBM Development",
        "site": "https://www.ubm-development.com",
        "promotions": "https://www.ubm-development.com",
        "countries": ["AT", "DE", "CZ", "PL"],
        "scope": "international", "provinces": [], "scale": "large",
        "note": "Austrian developer working across central Europe, timber "
                "construction specialist.",
    },
    "buwog": {
        "name": "Buwog",
        "site": "https://www.buwog.at",
        "promotions": "https://www.buwog.at",
        "countries": ["AT"],
        "scope": "national", "provinces": [], "scale": "large",
        "note": "Austrian residential developer, mostly Vienna.",
    },

    # ------------------------------------------------- Italy, Greece, Romania
    "redo": {
        "name": "Redo Sgr",
        "site": "https://www.redosgr.it",
        "promotions": "https://www.redosgr.it",
        "countries": ["IT"],
        "scope": "national", "provinces": [], "scale": "medium",
        "note": "Italian developer with a social and affordable housing focus, "
                "mostly Milan.",
    },
    "dimand": {
        "name": "Dimand",
        "site": "https://www.dimand.gr",
        "promotions": "https://www.dimand.gr",
        "countries": ["GR"],
        "scope": "national", "provinces": [], "scale": "medium",
        "note": "Listed Greek developer, Athens and Thessaloniki.",
    },
    "oneunited": {
        "name": "One United Properties",
        "site": "https://one.ro",
        "promotions": "https://one.ro",
        "countries": ["RO"],
        "scope": "national", "provinces": [], "scale": "large",
        "note": "The largest Romanian residential developer, Bucharest.",
    },
    "cordia": {
        "name": "Cordia",
        "site": "https://cordiahomes.com",
        "promotions": "https://cordiahomes.com",
        "countries": ["HU", "PL", "RO", "ES"],
        "scope": "international", "provinces": [], "scale": "large",
        "note": "Hungarian in origin, building across central Europe and Spain.",
    },

    # ------------------------------------------------------- United Kingdom
    "barratt": {
        "name": "Barratt Redrow",
        "site": "https://www.barrattredrow.co.uk",
        "promotions": "https://www.barrattredrow.co.uk",
        "countries": ["GB"],
        "scope": "national", "provinces": [], "scale": "very large",
        "note": "The largest British homebuilder after the 2025 Barratt and "
                "Redrow merger.",
    },
    "taylorwimpey": {
        "name": "Taylor Wimpey",
        "site": "https://www.taylorwimpey.co.uk",
        "promotions": "https://www.taylorwimpey.co.uk",
        "countries": ["GB"],
        "scope": "national", "provinces": [], "scale": "very large",
        "note": "National British homebuilder.",
    },
    "persimmon": {
        "name": "Persimmon",
        "site": "https://www.persimmonhomes.com",
        "promotions": "https://www.persimmonhomes.com",
        "countries": ["GB"],
        "scope": "national", "provinces": [], "scale": "very large",
        "note": "National British homebuilder, high volumes outside London.",
    },
    "berkeley": {
        "name": "Berkeley Group",
        "site": "https://www.berkeleygroup.co.uk",
        "promotions": "https://www.berkeleygroup.co.uk",
        "countries": ["GB"],
        "scope": "national", "provinces": [], "scale": "large",
        "note": "Concentrated on London and the southeast, higher price points.",
    },
    "bellway": {
        "name": "Bellway",
        "site": "https://www.bellway.co.uk",
        "promotions": "https://www.bellway.co.uk",
        "countries": ["GB"],
        "scope": "national", "provinces": [], "scale": "very large",
        "note": "National British homebuilder.",
    },
}

DEVELOPERS.update(EUROPE)


# ---------------------------------------------------------------------------
# Regional promoters along the Cantabrian corridor, and the public housing
# agencies. Curated from a public directory, filtered to actual developers, and
# every site fetched.
REGIONAL: dict[str, dict] = {
    # ------------------------------------------------------ public agencies
    #
    # Not companies you buy from in the ordinary way. They build protected
    # housing and allocate it by public registry and ballot, which means a
    # waiting list you have to be ON before anything is announced. No property
    # portal lists any of this, which is exactly why it is here.
    "visesa": {
        "name": "Visesa",
        "site": "https://www.visesa.euskadi.eus",
        "promotions": "https://www.visesa.euskadi.eus",
        "countries": ["ES"], "scope": "public",
        "provinces": [BIZKAIA, GIPUZKOA, ARABA], "scale": "large",
        "note": "The Basque Government's own housing developer. Builds protected "
                "housing across the three provinces and allocates it through "
                "Etxebide by ballot, so registration comes first and the "
                "promotion is announced second.",
    },
    "etxebide": {
        "name": "Etxebide",
        "site": "https://www.etxebide.euskadi.eus",
        "promotions": "https://www.etxebide.euskadi.eus",
        "countries": ["ES"], "scope": "public",
        "provinces": [BIZKAIA, GIPUZKOA, ARABA], "scale": "large",
        "note": "The Basque housing registry rather than a developer: the single "
                "channel through which protected housing in Euskadi is applied "
                "for and allocated. If you want VPO in the Basque Country you "
                "join this first, and income ceilings and a minimum period of "
                "residence apply.",
    },
    "sogepsa": {
        "name": "Sogepsa",
        "site": "https://www.sogepsa.com",
        "promotions": "https://www.sogepsa.com",
        "countries": ["ES"], "scope": "public",
        "provinces": [ASTURIAS], "scale": "medium",
        "note": "Asturian public land and housing company, jointly owned by the "
                "regional government and the municipalities.",
    },

    # ------------------------------------------------------------- Bizkaia
    "gordoniz": {
        "name": "Gordoniz",
        "site": "https://www.gordoniz.com",
        "promotions": "https://www.gordoniz.com",
        "countries": ["ES"], "scope": "regional",
        "provinces": [BIZKAIA], "scale": "small",
        "note": "Bilbao promoter, small pipeline.",
    },
    "ingiru": {
        "name": "Ingiru",
        "site": "https://www.ingiru.com",
        "promotions": "https://www.ingiru.com",
        "countries": ["ES"], "scope": "regional",
        "provinces": [BIZKAIA], "scale": "small",
        "note": "Bizkaia promoter and builder.",
    },

    # ----------------------------------------------------------- Cantabria
    "valnera": {
        "name": "Valnera Homes",
        "site": "https://www.valnerahomes.com",
        "promotions": "https://www.valnerahomes.com",
        "countries": ["ES"], "scope": "regional",
        "provinces": [CANTABRIA], "scale": "small",
        "note": "Cantabrian promoter, Santander and the bay.",
    },
    "luisdelrio": {
        "name": "Grupo Luis del Río",
        "site": "https://www.grupoluisdelrio.com",
        "promotions": "https://www.grupoluisdelrio.com",
        "countries": ["ES"], "scope": "regional",
        "provinces": [CANTABRIA], "scale": "small",
        "note": "Long-established Cantabrian developer and builder.",
    },

    # ------------------------------------------------------------ Asturias
    "masaveu": {
        "name": "Masaveu Inmobiliaria",
        "site": "https://www.masaveuinmobiliaria.com",
        "promotions": "https://www.masaveuinmobiliaria.com",
        "countries": ["ES"], "scope": "regional",
        "provinces": [ASTURIAS, MADRID], "scale": "medium",
        "note": "The property arm of one of the oldest Asturian family groups. "
                "Oviedo and Gijon, plus Madrid.",
    },
    "sedes": {
        "name": "Sedes",
        "site": "https://www.sedes.es",
        "promotions": "https://www.sedes.es",
        "countries": ["ES"], "scope": "regional",
        "provinces": [ASTURIAS], "scale": "small",
        "note": "Asturian developer, mostly Oviedo.",
    },

    # ------------------------------------------------------------- Galicia
    "galca": {
        "name": "Galca",
        "site": "https://www.galca.es",
        "promotions": "https://www.galca.es",
        "countries": ["ES"], "scope": "regional",
        "provinces": [PONTEVEDRA, A_CORUNA], "scale": "small",
        "note": "Galician promoter, Vigo and the Rias Baixas.",
    },

    # ------------------------------------------------------------- Navarra
    "erroyeugui": {
        "name": "Erro y Eugui",
        "site": "https://www.erroyeugui.com",
        "promotions": "https://www.erroyeugui.com",
        "countries": ["ES"], "scope": "regional",
        "provinces": [NAVARRA], "scale": "small",
        "note": "Navarrese developer and builder, Pamplona.",
    },
}

DEVELOPERS.update(REGIONAL)


def for_place(country: str, prov_code: str | None = None) -> list[dict]:
    """Developers worth checking in a place, most relevant first.

    Country is the gate: a Spanish promoter is no use in Finland. Inside Spain a
    `regional` company is further narrowed to the provinces it builds in, which
    is the only country here where the sources support that.

    Regionals come before nationals deliberately. In the Basque Country the
    regional firms build more than the listed majors do, and a list ordered by
    fame would bury the ones actually pouring concrete there.
    """
    order = {"very large": 0, "large": 1, "medium": 2, "small": 3}
    out = []
    for code, d in DEVELOPERS.items():
        if country not in d["countries"]:
            continue
        # `public` behaves like `regional` for matching: both are tied to
        # specific provinces, and a public agency is frequently the only way
        # into protected housing there.
        local = d["scope"] in ("regional", "public")
        if local and prov_code not in d["provinces"]:
            continue
        out.append({**d, "code": code, "local": local})
    out.sort(key=lambda d: (d["scope"] != "public", not d["local"],
                           order.get(d["scale"], 9), d["name"]))
    return out


def table() -> dict:
    """The whole registry, for the web app to filter client side."""
    return {
        code: {
            "name": d["name"],
            "site": d["site"],
            "promotions": d["promotions"],
            "scope": d["scope"],
            "countries": d["countries"],
            "provinces": d["provinces"],
            "scale": d["scale"],
            "note": d["note"],
        }
        for code, d in DEVELOPERS.items()
    }
