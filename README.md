# HomeFinder

A screener for finding somewhere to live, anywhere in the world, built around one
question that no property portal will answer: **where are the summers actually bearable,
and what does it cost there?**

Portals let you filter by price and square metres. They will not let you filter
by the number of nights per year that never drop below 20 degrees, which is the
thing that decides whether an August is liveable. This ranks **31,538 places in
101 countries** on climate, connectivity, services, price, air quality and cost
of living, plus two questions that decide whether a result is real at all:
whether you may legally buy there, and whether you may legally live there. Then
it hands you a pre-filtered link into a property portal for the ones worth a
look.

## Buying and living are two different questions

Almost every relocation tool collapses them. They come apart constantly:

- **Japan** will sell you a house on the same terms as a local, with no residency
  requirement, no minimum price and no approval. It will not let you stay.
- **Every EU country** will let you stay indefinitely on a Spanish passport,
  whether or not you can afford anything in it.
- **New Zealand** will do neither, and has not since 2018.

So each place carries both fields, and both are filterable.

`residence` is binary: `free` where a Spanish passport is itself the right
to live and work (the EU27 plus Iceland, Liechtenstein, Norway and Switzerland,
15,295 places), and `visa` everywhere else (16,243 places). The filter for it
is off by default. A visa is a solvable problem in most of the world, and
deciding it is not solvable for you is your call, not the app's.

`ownership` has four tiers, and this is where most of the surprises are:

| Tier | Meaning | Where, among others |
|---|---|---|
| `freehold` | Buy in your own name, as a local would | The EU, UK, US, Japan, Brazil, Chile, Uruguay, Colombia, South Africa, Turkey |
| `restricted` | Quotas, minimum prices, zone rules or apartments only | Australia, Canada, Mexico, Denmark, Switzerland, Malta, Thailand, Singapore, Egypt |
| `leasehold` | Long leases or use-rights; no freehold at all | Indonesia, Kenya, Ghana, Tanzania, Rwanda |
| `prohibited` | Closed to non-resident foreigners | New Zealand, China, India, Ethiopia, Nepal, Laos |

The tier alone is not actionable, so every country also ships one sentence of
the actual rule, and the town detail panel shows it. "Conditions apply" tells
you nothing. These do:

> **Mexico.** Freehold inland. Within 50 km of the coast or 100 km of a land
> border, foreigners hold through a bank trust (fideicomiso): a renewable 50
> year instrument that carries full owner's rights.

> **Canada.** Non-Canadians may not buy residential property inside a Census
> Metropolitan Area or Census Agglomeration until 1 January 2027; smaller and
> rural communities are exempt. Ontario adds a 25% non-resident speculation tax
> and British Columbia 20%.

> **Australia.** Foreign persons are banned from buying established dwellings
> from 1 April 2025 to 30 June 2029. New builds are possible with FIRB approval,
> an application fee and a state stamp-duty surcharge.

Three of those are recent enough that a 2023 guide would get them wrong. All of
them were checked in September 2026 against government and law-firm sources, and
all of them are indicative rather than legal advice.

`prohibited` is filtered out by default. Those places stay in the dataset and
you can switch them on, but showing them as results by default would be a lie of
omission.

**Japan is the standout on the freehold axis**, and the data bears it out rather
than just asserting it: no residency requirement, no minimum investment, no
approval process. Under the same filters used for Spain, 80 m2 inside 400k, cooler
than both Madrid and Barcelona on their own worst axis, a hub airport within
170 km, **28 Japanese places qualify and every single one is in Hokkaido.**
Obihiro (167,000 people) comes in at 2,798 EUR/m2 with a station 300 m away; Biei
at 1,944 EUR/m2 with 4 hot days a year.

## Resolution follows what you can act on

Not every country is carried at the same grain, and the reason is deliberate:

| Where | Floor | Why |
|---|---|---|
| Spain | pop 500 | The primary search, and the only country with real municipal price data |
| EU/EFTA | pop 5,000 | Free movement: you could be there next month |
| Asia, freehold | pop 5,000 | A cool-summer town in Tohoku is a genuine option |
| Rest of world, freehold | pop 15,000 | Enough to find the right region |
| Restricted or leasehold | pop 25,000 | |
| Prohibited | pop 50,000 | |

Without those floors the United States and Brazil alone would add 12,000 rows and
nearly double the payload, at a grain the price and amenity data could not
support anyway.

## Cost of living, the Numbeo question answered differently

Numbeo's indices are crowd-sourced, people type in what they paid for milk.
That buys per-city granularity nothing else can match, and it also means the
sample is self-selected, thin in small towns, and not licensable. This takes the
opposite trade: fewer, coarser numbers, every one of them auditable.

| Measure | Source | Granularity |
|---|---|---|
| **Broadband speed** | Ookla open Speedtest tiles | ~600 m tiles, real tests |
| **Air quality (PM2.5)** | CAMS reanalysis via Open-Meteo | ~55 km regional background |
| **Cost of living index** | World Bank ICP price levels | national, Spain = 100 |
| **Heating + cooling bill** | degree days × local electricity price | per place |
| **Income tax / VAT** | published national rates | national |

Two of these are better than what Numbeo offers, not merely different:

**Broadband is measured, not surveyed.** Ookla publishes real aggregated test
results; places are matched to every tile within 6 km and combined *weighted by
test count*, so one hotspot cannot outvote a neighbourhood. Where the sample is
thinner than 20 tests the dimension returns null and drops out of the score
rather than pretending to a fact. Median across the dataset is 219 Mbps; Bilbao
341, Brașov 296, Sapporo 184.

**The energy bill falls out of the climate model.** Heating and cooling degree
days come from the same monthly normals as everything else, and multiplied by a
local electricity price they answer a question a price survey cannot: what does
chasing a cool summer cost you in winter? Bilbao runs about **€450 a year**,
Madrid **€865**, Brașov **€1,310**, Berlin **€2,350**. The absolute figure
assumes an 80 m² home of average efficiency and should be read as a bracket, the *ratio* between two places is what to trust, because the assumption cancels.

Every one of these can be filtered and weighted, and every one returns null
rather than a guess where it was not measured. `score()` drops null dimensions
and renormalises, so no place is ever marked down for data that was not
collected.

## Coverage is deliberately uneven, and the data says so

| | Spain | Rest of EU/EFTA | Rest of the world |
|---|---|---|---|
| Places | 4,290 (pop >= 500) | 11,005 (pop >= 5,000) | 16,243 |
| Climate, terrain, coast, elevation | full | full | full |
| Airports and air connectivity | full | full | full |
| Air quality, internet speed, cost of living | full | full | full |
| Public transport | full | full | full (28,467 of 31,538 places) |
| Shops, health, schools, cycleways | full | **not surveyed** | **not surveyed** |
| Price | official municipal series | **national average band** | **national average band** |
| Gem score | yes | no | no |

The uneven parts are not hidden. A missing amenity is `null` with
`amenitiesSurveyed: false`, which the scoring model treats as *drop this
dimension and renormalise*, never as "this town has no shops".

**Spain's prices are the strongest layer here. Everywhere else is the weakest,
and the world made that gap bigger.** Spain is the only country on earth that
publishes a municipal valuation series as open data (MIVAU, quarterly), so 301
Spanish towns carry a real measured figure and another 3,928 are modelled from
their province. The other 27,248 places get a national average bent by a
gradient fitted on Spanish cities. Adding the world did not make that worse in
absolute terms, it just took Spain from 17% of the dataset to 13%, so the weak
layer became a bigger share of the whole.

So the number is shown as a bracket, never as a valuation:

| Tier | Shown as | Band |
|---|---|---|
| `observed` | 1,842 EUR/m2 | none, it is a published figure |
| `modelled` | 1,400 to 2,200 EUR/m2 | +/- 22% |
| `provincial` | 1,300 to 2,400 EUR/m2 | +/- 30% |
| `country` | 649 to 3,951 EUR/m2 | **measured, and per country** |

**The country band is not a guess, and it is not one number.** Spain is used as
the control: apply the exact model a country-tier place gets, a single national
average bent by the ratio model, to the 301 Spanish towns where the truth is
known, and it lands within **+/-46%**. That is the honest cost of having only a
national average, measured rather than asserted.

Every other country is then scaled from that by how far apart its own places
are, because one national number says far less about a large country than a
small one:

| | Band | Why |
|---|---|---|
| United States, Brazil | +/-72% | Markets 3,000 km apart with nothing in common |
| China, Kazakhstan, India | +/-60 to 63% | Same problem, slightly smaller |
| Spain | +/-46% | Measured directly |
| Belgium, Albania, Armenia | +/-30% | Small enough that one average nearly holds |

The proxy is geographic extent rather than the spread of the fitted prices,
and that is deliberate: the fitted spread is dominated by population, and the
population range inside each country is an artefact of this project's own
resolution choices (Spain down to 500 people, elsewhere 15,000) rather than a
fact about the country. Measured that way Spain came out as the most varied
country on earth, which is nonsense. Extent is not distorted by how the data was
sampled.

A `country`-tier price also carries no gem score at all, because ranking our
own estimate against a model fitted on Spanish data would be circular. If a
number matters to you, follow the portal link and read the real one.

## Who is building here

A property portal answers "what is on sale today". For new construction that is
the wrong question: promotions sell off plan, often from the developer's own
waiting list, before they reach a portal at all. The useful question is who is
building where, and the app carries a registry of **72 developers across 24
countries** to answer it, plus a live link out to what is actually on sale.

**What is deliberately not in it:** Vonovia, LEG, Gecina, Aroundtown and most of
the other names a search for "largest European real estate companies" returns.
They are landlords and investors. They will not sell you an apartment, so for
this purpose they are noise. Every entry here is a company that builds homes and
sells them to private buyers.

**The finding that makes it worth having is that Spain is not one market.** The
national league table is a handful of listed companies, and in the Basque
Country those companies are barely present: the homes going up there come from
Amenabar and Jaureguizar, neither of which appears in the national top ten. Since
this tool's climate thesis points at the Cantabrian coast more than anywhere
else, a directory that only knew the famous names would miss the region it most
often recommends. So regional firms are listed **above** the nationals wherever
they build, not below them.

Matching is by country first, because a Spanish promoter is no use in Finland.
Inside Spain a `regional` company is narrowed further to the provinces it
builds in; everywhere else the granularity is the country, because that is what
the sources support and pretending otherwise would invent precision. A
`national` entry appears across its country with the caveat that it may or may
not have anything in that province right now, which is the honest claim to make.

Coverage is deepest where the tool points most: Spain 22, Poland 9, Sweden and
Norway 7 each, Finland 6, then Germany, Czechia, France and the UK 5 each.

**The tier no commercial directory carries: public housing agencies.** Visesa
and Etxebide in the Basque Country, Sogepsa in Asturias. These are not companies
you buy from in the ordinary way: they build protected housing and allocate it
by public ballot from a registry you have to join *before* anything is
announced. None of it appears on any property portal, which is exactly why
people miss it, and it is why they sort above everything else in the list.
Income ceilings and resale limits apply.

**On the listings gap.** There is still no legal open feed of individual
promotions, and using a browser instead of an HTTP client does not change that:
what matters is bulk automated harvesting, not the tool doing it. Two things are
legitimate and both are used here. Reading a public directory once, as research,
to curate names into our own registry is what a person does, and it is where the
regional promoters above came from. And a deep link per province into a
new-build portal closes the "what is on sale today" gap without storing or
harvesting anything: the portal stays current by itself and nothing here can go
stale. The link is province level rather than municipality because the
municipality paths 404 wherever the portal has nothing, and a link that resolves
beats one that is more specific.

**Every URL was fetched before shipping, twice.** The check earns its keep: on
the Spanish pass, eight promotions paths returned 404 and now fall back to the
site root, Sukia's domain turned out to be .com rather than .eus, and three
companies whose sites could not be confirmed were removed rather than shipped.
On the European pass, Nexity's promotions path 404'd, Vanguard Properties is on
.com not .pt, and Atal redirects to its apex. All 61 links now resolve. A
plausible-looking link that goes nowhere is worse than one extra click, and an
invented company is worse than an honest gap.

Indicative, checked September 2026. Land banks move constantly, so read a
listing as who to ask rather than what is on sale.

## Two map layers

The map draws two independent things and either can be switched off:

- **Places**, the ranked towns, coloured from best to weakest.
- **Developments**, whatever you have imported under *My listings*, coloured by
  **stage** rather than by score: blue for something selling now, amber under
  construction, purple for an open waiting list, grey for announced but not
  launched. The map then reads as a timeline instead of a second ranking.

Turning the hotspots off and the developments on is the view worth having: it
shows which of your finds sit somewhere the search itself would never have
surfaced.

Two honest details. Developments are pinned at their **municipality centroid**,
not a street address, because a municipality is all an imported list gives; the
marker says so rather than leaving it to be assumed. And several developments in
one town would stack exactly on top of each other, so they are fanned out on a
golden-angle spiral of a few hundred metres, which spreads them evenly without
implying any of them is at a real coordinate.

## Getting around without a car

Distance to an airport answers "can I leave the country". It says nothing about
whether daily life needs a car, which for someone working from home is the more
relevant question. Three layers answer it, all surveyed worldwide:

| Field | What it is |
|---|---|
| `trainKm` | Nearest mainline station |
| `metroKm` | Nearest metro, subway, light rail or tram stop |
| `busKm` | Nearest bus **station**, meaning a coach terminal |

Three deliberate choices:

**The four urban rail modes are folded into one field.** Metro, subway, light
rail and tram answer a single question and nobody chooses a town on the
distinction between a tram stop and a light rail stop.

**Bus counts stations, not stops.** Every village street has a stop and it tells
you nothing. A terminal means scheduled intercity coaches actually call there.

**Mainline rail and urban rail are scored on different distance scales.** A
station 40 km away is fine, because mainline rail is about reaching other
cities. A metro 40 km away is worth nothing, because urban rail is about daily
life. So rail scores out to 45 km and metro only to 8.

The filter is a single control, "must have public transport", satisfied by the
nearest of any mode, because "can I leave without a car" is one question and it
does not matter which mode answers it. At its 3 km default it cuts the wide-open
result set roughly in half.

Curitiba is the case that shows the layers are doing real work: it reports metro
400 km away and a coach terminal 2.4 km away, which is exactly right. Its famous
transit system is bus rapid transit, not rail.

## The questionnaire

The first thing the app asks is not "how many days above 30 °C can you tolerate?", nobody knows that. It asks which places you have actually lived in and found
unbearable, then reads their real measurements out of the dataset and derives
your thresholds from them.

The subtlety that makes it work: **two cities can be unbearable for opposite
reasons.**

| | days >30 °C | tropical nights | humidity |
|---|---|---|---|
| Madrid | **66.6** | 23.4 | 12.5 (dry) |
| Barcelona | 18.0 | **68.2** | 18.6 (humid) |

Madrid punishes you by day and cools off at night. Barcelona never gets extreme
and never lets go. Someone who rejects both is stating *two different* limits, so
each metric takes the **minimum across the rejected cities**, the strictest
complaint per axis, rather than an average that would wash both out. Rejecting
Madrid and Barcelona yields "≤10.8 hot days" (from Barcelona) and "≤14 tropical
nights" (from Madrid), and the summary names which city set which limit.

A second guarantee: any place you mark as having *felt right* is guaranteed to
survive your own filters. A profile that excludes the city you said you liked is
a bug, not a result, so the thresholds relax just far enough to keep it in.

The questionnaire also asks how you spend the day, because that changes which
number matters. If you work from home, peak temperature is a poor guide, you are
indoors from June to September, so the burden is the **whole season's cooling
load**, not the worst afternoon. That is the `AC` column: cooling degree days as a
percentage of your reference city. Much of the Cantabrian coast comes out at 0–10%
of Madrid's, which is a more useful sentence than any absolute temperature.

## It holds no opinion until you give it one

An earlier version of this tool assumed you wanted a cool climate. Not as a
default you could change, but structurally, in four places at once: a "Like
Bilbao" weight dial, Bilbao and Madrid preloaded as the reference cities, every
summer filter expressed as a ceiling with no way to ask for warmth, and a
`summerComfort` score that rated cool summers highest while carrying the
heaviest weight in the model. Somebody who wanted heat got the ranking exactly
inverted, and no obvious way to say so.

All four are gone:

- **The dial is removed.** The learned-affinity model below does the same job
  from your actual picks, across every feature rather than climate alone.
- **Both reference lists start empty.** A new user arrives with nobody else's
  taste already applied.
- **Summer bounds work in both directions.** `minAugTmax` and
  `minWinterTmin` now sit alongside the ceilings, so "warm enough" is as
  expressible as "cool enough".
- **`summerComfort` is replaced by `summerFit`**: distance from a
  summer target you state, penalised *symmetrically*. Wanting 32 C is a
  different preference, not a worse one. With no target set it returns null and
  drops out of the score entirely, because silence is not a preference for cool
  weather.

The questionnaire asks which way the places you rejected were wrong rather than
assuming it. Rule out Bilbao and Helsinki as too cold and it answers:

> August highs floored at 28 C. Bilbao reaches 26.5 and was still too cool, so
> that is the bar to clear.

and returns Sicily, Cadiz and the Canaries. Same code, no special casing. The
defaults that ship are deliberately wide open: 200 hot days, no August ceiling,
no target. The app should not have a view about your climate before you do.

## It learns what you like from places, not sliders

The weight sliders assume you can state your own preferences as numbers. Most
people cannot. Everyone can name places they would live in, so the app reads that
list and works out what those places have in common that the rest of the world
does not.

Every feature is converted to a percentile rank within the whole dataset, because
population, price and relief are all heavily skewed and a mean would be dragged
around by outliers. A feature then counts as a preference only if your picks are
both **distinctive** (their median percentile sits far from typical) and
**consistent** (they cluster tightly, so it looks deliberate). Importance is the
product of the two.

That product is what makes it work. Given Bilbao, Santander, Oviedo and A Coruna
it reports:

> close to a city: your picks average 0 km, against 34 km typical.
> near the coast: your picks average 12 km, against 99 km typical.
> mild winters: your picks average 7.9 C, against 2.9 C typical.
> Your picks vary too much on airport access for it to look deliberate, so it is
> weighted down.

Four Atlantic provincial capitals really are coastal, urban and mild, and their
airports really do range from excellent to poor. The model says both, and says
which it is confident about. It refuses to guess from fewer than three picks,
because a single place has no spread to measure.

## Two things it gets right that most tools do not

**Airports are measured in minutes, not kilometres.** Nobody wants to be within
90 km of an airport; they want to be forty minutes away. The old km thresholds
were not filtering anything, a 250 km hub limit admitted 95% of the dataset.
Drive time is estimated from straight-line distance with a terrain-aware detour
factor and a speed that rises with trip length, calibrated against journeys that
could be checked (Bilbao to BIO: 13 km, ~20 min real, 23 min modelled; Vitoria
to BIO: 55 km, ~65 min real, 62 min modelled). The same 50 km is half an hour on
the meseta and over an hour across a Cantabrian pass, and the model says so.

**There is no single reference city.** You give it a list of climates you want
more of and a list you have ruled out. Candidates are matched against the
**closest** favourite, never their average, someone who likes both Bilbao and
Sapporo is not asking for the midpoint between them, which describes nowhere.
The rejected list sets the summer ceilings, taking the strictest limit each one
implies. Both lists are editable from any town detail panel.

## The idea it is built on

The cheapest parts of Spain with cool, Atlantic summers. Lugo, Ourense,
interior Asturias, León, inland Cantabria, are cheap because their **local
labour markets** are weak, not because they are unpleasant places to live. If
your income comes from outside the region, that discount is simply available to
you.

So the scoring model contains no measure of local wages or employment. Economic
decline shows up as *cheapness*, never as a penalty. The **Gems** view makes this
explicit: it regresses what a town costs against what it offers, and ranks by how
far below that line it sits.

## Running it

```bash
python -m venv .venv && .venv/Scripts/pip install numpy tifffile imagecodecs xlrd pyarrow
```

```bash
python pipeline/build.py
```

```bash
cd web && npm install && npm run dev
```

The pipeline caches every network response under `pipeline/cache/`, so a second
run does no network I/O and interrupting it is safe. `python pipeline/build.py --list`
shows which stages have completed; `--stage climate` reruns just one.

**Two stages are quota-bound and expect to be run more than once.** Open-Meteo
allows 10,000 units a day free; a full worldwide climate calibration plus air
quality needs closer to 17,000. Both stages therefore stop asking after three
consecutive refusals, finish from cache, and report exactly what is missing.
Running them again the next day fills the gaps and costs nothing for anything
already fetched. Air quality caches per grid cell rather than per request batch,
so adding new countries never orphans what has already been paid for.

The web app reads a single JSON file and makes no network calls of its own, so it
is fast, works offline, and cannot be broken by an upstream outage.

## It does not assume you are Spanish

The project started as one person's search from Bilbao, and for a while the app
quietly assumed that of everyone: cost of living was indexed to Spain, the
questionnaire opened with Madrid and Barcelona, and the ownership rules talked
about "a Spanish passport". None of the *data* was Spanish. Only its
presentation was, which meant it was all fixable.

One setting drives it. **I am in [country]** sits in the header, is guessed from
the browser on a first visit, and is not a filter: it removes nothing, it
changes what the numbers are measured against.

- **Cost of living is rebased to your country.** The pipeline stores everything
  against Spain = 100 because that is where the price series it calibrates on
  lives. A Dutch user now reads Brasov as *"56, 44% cheaper than home"* rather
  than as 79 on a scale anchored to a country they have never lived in.
- **The questionnaire offers your cities first.** It rests entirely on naming
  places you have actually experienced, and those are overwhelmingly near home.
  Set France and it opens with Paris, Lyon, Marseille and Bordeaux; set Germany
  and it opens with Berlin, Munich and Hamburg.
- **The passport language is now EU-wide**, because that is what the underlying
  rules always were: every EU and EFTA passport gets the same answer from the
  residence and ownership fields, which is why the app generalises across them
  without re-deriving anything. Pick a home outside the EU/EFTA and the header
  says so, rather than quietly showing you rules that do not apply to you.

## Putting it online, free

The build is a static folder: no server, no API keys, no database. Anything that
can serve files can host it.

```bash
cd web && npm install && npm run build
```

### GitHub Pages

`.github/workflows/deploy.yml` is committed and does the whole thing. Create a
repository, push, then in **Settings, Pages** set *Source* to **GitHub Actions**.
Every push to `main` typechecks, runs the tests and publishes; a failing build
will not replace a working site.

```bash
git init -b main
git add -A
git commit -m "HomeFinder"
git remote add origin https://github.com/YOUR-USER/homefinder.git
git push -u origin main
```

The site lands at `https://YOUR-USER.github.io/homefinder/`. That is a
subdirectory, which is exactly why the asset and data paths are relative.

### Cloudflare Pages, if you expect much traffic

Genuinely better on the one axis that matters here. GitHub Pages is soft-limited
to 100 GB of bandwidth a month, and at 4.2 MB a visit that is roughly 24,000
visits. Cloudflare Pages does not meter bandwidth at all, and its edge network
is faster for a file this size. Connect the same repository, set the build
command to `npm run build`, the output directory to `dist` and the root to
`web`. Netlify and Vercel work the same way with the same settings.

### Why the repository is 4.6 MB and not 18

The app loads `towns.json.gz` and decompresses it in the browser, so the
compressed copy is the only one tracked in git. The uncompressed file is
regenerated locally by `python pipeline/emit.py` and stays ignored.

That decision is doing three jobs at once. A 17.5 MB blob per data revision
turns a git history unusable within a few updates. The deploy is a quarter of
the size. And it removes a dependency on the host being configured to compress
on the fly, which not all of them are: served uncompressed, every visitor would
have pulled 17.5 MB.

The one wrinkle is that hosts disagree about `.gz` files. Some send the bytes
as they are; some set `Content-Encoding: gzip`, in which case the browser has
already decompressed it and decompressing again throws. So the loader reads the
first two bytes and looks for the gzip signature, which settles it by
observation instead of by assuming a particular host's configuration. Verified
against a server that does no compression at all, with the uncompressed file
deleted.

The pipeline does not run in CI, and should not: it needs API quota, several
gigabytes of rasters and the better part of a day. What is published is its
output.

### What other people get

A whole working copy. All of it runs in the browser, so there is no per-user
cost, nothing to keep running, and no way for one visitor's search to affect
another's. Once the dataset has loaded the app works offline.

## How the climate numbers are made

This is the part worth understanding, because it is where the real engineering is.

The obvious approach, pull daily temperature series from Open-Meteo for every
municipality, **does not work at national scale**, and it is worth writing down
why. Open-Meteo weights requests by roughly `variables × locations × days ÷ 100`
against a 600-unit-per-minute and 10,000-per-day budget. One request covering ten
locations for ten years across four variables consumes an entire minute's budget.
Full coverage would need around 400,000 units: **about forty days of continuous
fetching**. Measured, not assumed.

So the climate layer is built in two parts:

1. **Spatial field. WorldClim 2.1 at 2.5 arc-minutes (~4.6 km).** One bulk
   download, no API limits, and a finer grid than ERA5-Land's ~9 km. Monthly
   normals for min/max temperature, precipitation and vapour pressure.

2. **Recalibration, real ERA5 daily data at 295 anchor towns, 2020-2024.**
   WorldClim's baseline is 1970-2000 and materially cooler than the present. The
   anchors are chosen by farthest-point sampling across latitude, longitude and
   elevation, so they span sea level to 3,974 m and latitude -55 to +71 rather
   than clustering in the populous lowlands.

   They are drawn **per region**, and the bias is **fitted per region**, because
   a calibration fitted on Iberia has no business being applied to Finland, let
   alone to Patagonia:

   | Region | Anchors |
   |---|---|
   | Spain | 80 |
   | EU/EFTA | 60 |
   | Asia | 45 |
   | Europe outside the EU | 16 |
   | Americas, north of the equator | 30 |
   | Americas, south of it | 20 |
   | Africa, north / south | 18 / 12 |
   | Oceania | 14 |

   **The hemisphere split is not cosmetic.** What is being fitted is a warming
   signal, and warming since 1985 is far stronger at high northern latitudes than
   at high southern ones. One straight line through both hemispheres has to
   average two genuinely different slopes, and it is the far south that ends up
   worst served.

   The regions are also drawn from **frozen membership lists**, so adding a new
   one does not renumber the others. Adding the UK would otherwise have put
   London into the seed set and reshuffled all 60 EU anchors, discarding paid-for
   API fetches for countries that had not changed. When the Americas were added,
   185 of the 295 anchor fetches came straight back from cache.

From the anchors the pipeline fits two corrections:

- a **per-month baseline offset, varying with latitude**. Warming since
  1970-2000 has not been uniform across the continent, so the correction carries
  a latitude term. In Spain it lands at +0.5 to +1.5 °C on daily highs and
  **+1.5 to +2.9 °C on nightly lows**, nights warming about twice as fast as
  days, which is exactly the published pattern and a good sign the calibration is
  doing something real.
- a **within-month standard deviation**, modelled as a linear function of
  continentality, because inland Spain swings far harder day-to-day than the
  Atlantic coast does.

Threshold counts then come from integrating the monthly tail:
`days above T = Σ months  n_days × P(N(μ, σ) > T)`.

**Summer is derived, not looked up on a calendar.** Every seasonal metric used
to be a fixed set of months: summer was June to September, winter December to
February. That is right for Spain and wrong for half the planet, and going
worldwide would have reported Santiago's and Cape Town's coldest month as their
hottest. Each place's warm season is now the four months with the highest daily
maxima in its own annual cycle, its peak the top two, its winter the three
coldest by nightly minimum. That needs no hemisphere logic and it also fixes the
cases a simple hemisphere flip would still get wrong: the tropics, where there is
no summer to speak of, and monsoon climates like Delhi's, where the year peaks in
May and July is cooler under the rain. For Spain it changes nothing, because the
warmest four months there are June to September anyway. The pipeline asserts that
at least 90% of southern-hemisphere places peak between December and March.

Two further refinements: a lapse-rate correction shifts each town's series by its
elevation offset from its grid cell (worth over a degree in Cantabrian valleys),
and humid heat is derived from vapour pressure via the Bureau of Meteorology
apparent-temperature formula.

**Validation**, measured against the 80 anchors' true daily values:

| Metric | MAE | R² | Observed range |
|---|---|---|---|
| Days above 30 °C | 11.2 d | 0.78 | 0–124 |
| Days above 35 °C | 5.6 d | 0.62 | 0–67 |
| Tropical nights (≥20 °C) | 10.4 d | 0.79 | 0–191 |

The apparent-temperature check came out at `AT_era5 = −1.01 + 1.012 × AT_bom`
over 960 anchor-months, essentially 1:1, independently confirming that deriving
humid heat from WorldClim vapour pressure is sound.

Anchor towns keep their real measured values; everywhere else is tagged
`modelled` and the UI shows which is which. In the shipped dataset that is 80
measured and 4,210 modelled.

## Data sources

| Layer | Source | Coverage |
|---|---|---|
| Places | GeoNames ADM3 (Spain) + cities5000 (rest) | worldwide |
| Climate | WorldClim 2.1 recalibrated on ERA5 via Open-Meteo | worldwide, 295 anchors across 9 regions |
| Terrain, coast, relief | WorldClim elevation raster | worldwide, coast from its land mask |
| Airports | OurAirports + published traffic for 499 airports | worldwide |
| Air quality | CAMS reanalysis via Open-Meteo | worldwide, four-month seasonal sample |
| Internet | Ookla open Speedtest tiles, 2025 Q1 | worldwide |
| Cost of living | World Bank ICP price levels, rebased Spain = 100 | worldwide |
| Energy and tax | Degree days x published tariffs, curated per country | worldwide |
| Public transport | OpenStreetMap via Overpass | worldwide: 37,592 stations, 74,277 metro/tram stops, 52,057 coach terminals |
| Shops, health, schools, cycleways | OpenStreetMap via Overpass | Spain |
| Prices | MIVAU quarterly (ES) + national averages | Spain measured, elsewhere a band |
| Buying and residence rules | Government and law-firm sources, Sep 2026 | 103 countries |
| New-build developers | Company sites and trade press, Sep 2026 | 72 developers, 24 countries, incl. public housing agencies |

Airport access is a **gravity score**, `sum of passengers / (km + 25)^1.6`, not a
nearest-neighbour distance. "Links me to the world" means volume of onward
connections and having several options in range: the Bilbao area scores well
precisely because Bilbao, Vitoria, Santander and Biarritz are all reachable, and
no nearest-airport metric can express that. Distance is then turned into drive
time, because 90 km of Cantabrian valley road and 90 km of meseta motorway are
not the same trip.

**Every layer that is not worldwide says so per row**, as a `...Surveyed` flag,
and the scoring model drops an unmeasured dimension and renormalises rather than
marking a place down for data nobody collected. Three separate bugs of exactly
that shape were found and fixed while extending past Europe: the terrain raster,
the broadband tiles and the rail query were each still windowed to Europe and
Asia while being written to every row on earth, so a town in Chile was being
told its nearest station was in Portugal.

## Limitations, stated plainly

- **Price is the weakest layer, by a wide margin.** Spain's official municipal
  valuation series covers only municipalities above 25,000 inhabitants, 305
  of 4,290 here, and none of the small towns this tool exists to surface.
  Everything smaller is estimated as a *ratio to its provincial average* (more
  stable than extrapolating an absolute price down from cities) and tagged
  `modelled`. The typical error on a modelled price is **±33%**.
  That is large. **Treat modelled prices as a shortlisting device, never as a
  valuation**, the deep links exist to check the real figure in one click.
  Current split: 305 observed, 3924 modelled,
  61 provincial fallback.
- **Gems found among modelled prices are weaker claims.** The residual model is
  fitted only on observed prices. Applied to a modelled town, a large residual
  really says "this province is cheap for what it offers" rather than anything
  about that specific town. The UI distinguishes the two.
- **A neighbourhood is not a town.** Outside Spain the unit is a GeoNames
  populated place, and GeoNames tags Dublin districts like Artane and Ballymun as
  plain `PPL`, indistinguishable from a real town by feature code. Anything
  within 8 km of a same-country place at least 8× its size is dropped as a
  district (1,648 of them), plus 1,186 explicitly tagged city sections. The
  thresholds are set so genuine satellites survive: Alonsotegi is 123× smaller
  than Bilbao but 10 km out, so it stays.
- **Grid resolution.** 4.6 km is good, but a valley floor and a ridge 3 km apart
  can still share a cell. The lapse-rate correction helps; it is not a substitute
  for visiting.
- **OSM coverage is uneven in small villages.** A missing supermarket may mean
  "not mapped", not "not there".
- **Distances start as straight-line x 1.25.** Drive times are then modelled
  from that with a terrain-aware detour factor and a speed that rises with trip
  length, which is calibrated against known routes (Bilbao to its airport, 13 km,
  comes out at 23 minutes; Vitoria to the same airport, 55 km, at 62). Fine for
  screening. Not a routing engine, and it has no idea about traffic.

- **The ownership and residence rules are a screen, not advice.** They were
  checked in September 2026 against government and law-firm sources, they are one
  sentence per country where the real answer is a chapter, and several of them
  have expiry dates: Canada's ban lapses on 1 January 2027, Australia's on
  30 June 2029. Confirm with a notary in-country before acting on any of it.

- **Non-Spanish prices get worse the further out you go, and the world made that
  worse.** Spain is 13% of the dataset now. For the other 87% the figure is a
  national average bent by a gradient fitted on Spanish cities, shown as a band
  of +/- 45% and given no gem score. A national average is close to meaningless
  for a country the size of Brazil or the United States, where a coastal capital
  and an interior town differ by a factor of five. **Use it to sort, never to
  value.**

- **Air quality is a four-month sample, and coverage is partial.** PM2.5 comes
  from four representative months of CAMS reanalysis rather than a full year,
  which captures the seasonal swing without a twelvefold quota bill. Coverage is
  filling in over several days because the free tier allows 10,000 units a day
  and the world needs roughly 11,000; a cell with no reading shows null rather
  than a guess.
- **No scraping.** Idealista and Fotocasa both forbid it and actively block it.
  Deep links reach the same listings and keep working. An Idealista API adapter
  is wired but dormant until you hold a key.
- **Portal links outside Spain are searches, not filtered deep links.** Spain
  gets Idealista, Fotocasa and pisos.com with your budget and minimum size
  applied in the URL. Every other country gets its own market leader (SUUMO in
  Japan, Zillow in the US, Property24 in South Africa, ZAP in Brazil, and about
  sixty more) as a plain search, because a constructed slug for a portal that
  cannot be tested against is a dead link dressed up as a working one. A country
  with no portal listed falls back to a web search rather than a 404.
- **Not tax advice, and this matters far more at world scale.** An EU passport
  opens the whole EU/EEA freely, and nothing beyond it. Moving tax residency
  across a border can affect an employment or contracting arrangement, healthcare
  entitlement and social-security base, and leaving the EU compounds all three: a
  US or Australian move needs a visa most people cannot get, and several
  countries here tax worldwide income on arrival. The cross-border results are a
  climate, cost and legality screen, nothing more. Take advice before acting on
  them.

## Layout

```
pipeline/          Python. Run occasionally; resumable and cached.
  common.py        HTTP caching, vectorised geo maths, name normalisation
  build.py         stage orchestrator
  stages/          places, worldclim, climate, access, amenities, terrain, prices
  emit.py          merges everything into web/public/data/towns.json (columnar)
web/               Vite + React + TypeScript + Leaflet
  src/scoring.ts   the weighted model, pure and unit-tested
  src/gems.ts      ridge-regularised residual regression
  src/listings.ts  portal deep links, CSV import, dormant API adapter
```

`npm test` covers the scoring model, the gem regression and the listing parsers, 20 tests, no I/O.
