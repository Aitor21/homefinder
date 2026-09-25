import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { Dataset, Filters, Town, Weights } from './types';
import { DEFAULT_FILTERS, DEFAULT_WEIGHTS } from './types';
import {
  breakdown, failures, rank, rejectReason, weightedScore, type FilterEnv, type Ranked,
} from './scoring';
import { nearMisses, wouldRank } from './nearmiss';
import type { Listing } from './listings';
import {
  loadHome, saveHome, countryCostIndex, countryName, homeOptions, FREE_MOVEMENT,
} from './home';
import {
  deviceTimeZone, flightHours, greatCircleKm, homeAnchor, shortestDay, tzGap,
} from './clock';
import { fitGems } from './gems';
import { buildDistribution, learnAffinity } from './affinity';
import { loadDataset } from './data';
import { buildProfile, type Answers, type Profile } from './profile';
import FilterPanel from './ui/FilterPanel';
import MapView from './ui/MapView';
import TownTable from './ui/TownTable';
import TownDetail from './ui/TownDetail';
import ListingsPanel from './ui/ListingsPanel';
import Questionnaire from './ui/Questionnaire';

/**
 * Three ways to read the same ranking:
 *   score  everything that passes your filters, best first
 *   near   places one or two things away from the top: see nearmiss.ts
 *   gems   places priced below what their quality implies: see gems.ts
 */
export type Mode = 'score' | 'near' | 'gems';

/**
 * Both lists start empty on purpose. Preloading Bilbao and Madrid meant a new
 * user arrived with somebody else's taste already applied, and every result was
 * ranked against a climate they had never asked for.
 */

// v2: the answers changed shape when the cool-climate assumption came out.
const STORE = 'homefinder.answers.v2';
// Closing the questionnaire without answering used to record nothing, so it
// reopened on every single load. Offering it once is help; offering it every
// time is nagging, and the comment below already claimed it did not.
const SEEN = 'homefinder.wizard-seen.v1';
// The clock you work to. Defaults to this device's, which is right for nearly
// everyone; stored only when someone picks a different one.
const WORK_TZ = 'homefinder.worktz.v1';

function loadWorkTz(): string | null {
  try {
    return localStorage.getItem(WORK_TZ) || deviceTimeZone();
  } catch {
    return deviceTimeZone();
  }
}

export default function App() {
  const [data, setData] = useState<Dataset | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [mode, setMode] = useState<Mode>('score');
  const [selected, setSelected] = useState<string | null>(null);
  const [compareIne, setCompareIne] = useState<string | null>(null);
  const [showListings, setShowListings] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  // Imported developments live here rather than in the panel, because the
  // map needs them and the panel is closed most of the time.
  const [listings, setListings] = useState<Listing[]>([]);
  const [showPlaces, setShowPlaces] = useState(true);
  // Where the user is starting from. Not a filter: it removes nothing, it
  // changes what the numbers are measured against.
  const [home, setHome] = useState<string | null>(null);
  const [workTz, setWorkTz] = useState<string | null>(loadWorkTz);
  // On a phone the filter panel is a sheet you open, not a column. It is
  // one piece of state rather than two layouts, so the desktop rules simply
  // ignore it.
  const [showFilters, setShowFilters] = useState(false);
  const [showBuilds, setShowBuilds] = useState(true);
  const [answers, setAnswers] = useState<Answers | undefined>(undefined);
  const [notes, setNotes] = useState<string[]>([]);

  useEffect(() => {
    loadDataset()
      .then((d: Dataset) => {
        setData(d);
        // Offer the questionnaire on a first visit; never nag afterwards. On a
        // return visit the saved answers are re-applied, not just remembered --
        // restoring the answers without the filters they imply would silently
        // show unfiltered results under a profile that claims to be active.
        setHome(loadHome(new Set(d.towns.map((t) => t.country))));
        try {
          const saved = localStorage.getItem(STORE);
          if (!saved) {
            if (!localStorage.getItem(SEEN)) setShowWizard(true);
            return;
          }
          const a = JSON.parse(saved) as Answers;
          const p = buildProfile(a, d.towns);
          setAnswers(a);
          setFilters(p.filters);
          setWeights(p.weights);
          setNotes(p.notes);
        } catch {
          setShowWizard(true);
        }
      })
      .catch((e) => setErr(String(e)));
  }, []);

  const towns = data?.towns ?? [];
  const byId = useMemo(() => new Map(towns.map((t) => [t.id, t])), [towns]);

  /** Every place you said you liked, resolved. Candidates match the best of them. */
  const refs = useMemo(
    () => filters.favourites.map((id) => byId.get(id)).filter(Boolean) as Town[],
    [filters.favourites, byId],
  );
  /** The place you are escaping, used for the side-by-side comparison. */
  const compare = useMemo(() => {
    const pick = compareIne ?? filters.avoid[0] ?? null;
    return pick ? byId.get(pick) ?? null : null;
  }, [compareIne, filters.avoid, byId]);
  const gemModel = useMemo(() => fitGems(towns), [towns]);

  // Percentile distributions are built once per dataset; the taste model is
  // relearned whenever the list of liked places changes.
  const homeIndex = useMemo(() => countryCostIndex(towns, home), [towns, home]);
  const homeName = useMemo(() => countryName(towns, home), [towns, home]);
  const homeList = useMemo(() => homeOptions(towns), [towns]);
  const anchor = useMemo(() => homeAnchor(towns, home), [towns, home]);
  const tzList = useMemo(
    () => Array.from(new Set(towns.map((t) => t.tz).filter(Boolean) as string[])).sort(),
    [towns],
  );
  const dist = useMemo(() => (towns.length ? buildDistribution(towns) : null), [towns]);
  const affinity = useMemo(
    () => (dist ? learnAffinity(refs, dist, towns) : null),
    [refs, dist, towns],
  );
  const scoreCtx = useMemo(() => ({ refs, affinity, dist }), [refs, affinity, dist]);

  /** What the clock, home and pet filters need beyond the town itself. */
  const env = useMemo<FilterEnv>(
    () => ({
      tzGap: (t) => tzGap(t.tz, workTz)?.worst ?? null,
      homeFlightH: anchor
        ? (t) => flightHours(greatCircleKm(anchor.lat, anchor.lon, t.lat, t.lon))
        : undefined,
      winterDaylight: (t) => shortestDay(t.lat),
      rules: data?.meta.countryRules,
    }),
    [workTz, anchor, data],
  );

  const ranked = useMemo<Ranked[]>(
    () => rank(towns, filters, weights, scoreCtx, env),
    [towns, filters, weights, scoreCtx, env],
  );
  // Near misses look at every place on earth, not only those that pass, so
  // they are computed from DEFERRED copies of the filters and weights: while a
  // slider is being dragged React renders the ranking first and lets this
  // catch up once the hand stops, instead of stuttering on every notch. It
  // ranks its own deferred copy too, since its bar is the tenth-best score
  // and must come from the same filters as the places it compares with.
  const nearFilters = useDeferredValue(filters);
  const nearWeights = useDeferredValue(weights);
  const near = useMemo<Ranked[]>(() => {
    const base = nearFilters === filters && nearWeights === weights
      ? ranked
      : rank(towns, nearFilters, nearWeights, scoreCtx, env);
    return nearMisses(towns, base, nearFilters, nearWeights, scoreCtx, env);
    // `ranked` is deliberately not a dependency: it is only read when it was
    // built from exactly these deferred inputs, in which case it is current.
  }, [towns, nearFilters, nearWeights, scoreCtx, env]);

  // Gems exist only where a price was measured or modelled from measured
  // neighbours, which is Spain. Everywhere else used to sit in the middle of
  // the gems list with a residual of zero, ranked above every Spanish town
  // that happened to be dearer than predicted, which read as a finding and
  // was an artefact.
  const gems = useMemo<Ranked[]>(() => {
    const rows = ranked
      .filter((r) => gemModel.gem.has(r.town.id))
      .map((r) => ({ ...r, gem: gemModel.gem.get(r.town.id) }));
    let best = 0;
    for (const r of rows) best = Math.max(best, r.score);
    // Still require a decent absolute score: a cheap town that fails on
    // everything else is not a gem, it is just cheap.
    const cutoff = best * 0.62;
    return rows.filter((r) => r.score >= cutoff).sort((a, b) => (b.gem ?? 0) - (a.gem ?? 0));
  }, [ranked, gemModel]);

  const rows = mode === 'near' ? near : mode === 'gems' ? gems : ranked;

  const sel = useMemo<Ranked | null>(() => {
    if (!selected) return null;
    const hit =
      rows.find((r) => r.town.id === selected)
      ?? ranked.find((r) => r.town.id === selected)
      ?? near.find((r) => r.town.id === selected);
    if (hit) return hit;
    // A town the filters exclude, opened from a search. It used to open
    // nothing at all, which is the least helpful answer to "why is it out?".
    const t = byId.get(selected);
    if (!t) return null;
    const b = breakdown(t, filters, scoreCtx);
    return {
      town: t,
      score: weightedScore(b, weights),
      breakdown: b,
      held: failures(t, filters, env).map((failure) => ({ failure })),
      excluded: true,
    };
  }, [rows, ranked, near, selected, byId, filters, scoreCtx, weights, env]);

  const applyProfile = (p: Profile, a: Answers) => {
    setFilters(p.filters);
    setWeights(p.weights);
    setNotes(p.notes);
    setAnswers(a);
    setShowWizard(false);
    setSelected(null);
    setCompareIne(null);
    try {
      localStorage.setItem(STORE, JSON.stringify(a));
    } catch {
      /* private browsing; the profile just will not persist */
    }
  };

  const chooseWorkTz = (tz: string | null) => {
    setWorkTz(tz ?? deviceTimeZone());
    try {
      if (tz && tz !== deviceTimeZone()) localStorage.setItem(WORK_TZ, tz);
      else localStorage.removeItem(WORK_TZ);
    } catch {
      /* the device clock is used next time instead */
    }
  };

  if (err) {
    return (
      <div className="empty">
        <p><b>Could not load the dataset.</b></p>
        <p>{err}</p>
        <p>Run the pipeline first: <code>python pipeline/build.py</code></p>
      </div>
    );
  }
  if (!data) return <div className="empty">Loading {'…'}</div>;

  const countryCounts = new Map<string, { code: string; name: string; n: number }>();
  for (const t of towns) {
    const e = countryCounts.get(t.country);
    if (e) e.n++;
    else countryCounts.set(t.country, { code: t.country, name: t.countryName, n: 1 });
  }
  const countries = Array.from(countryCounts.values()).sort((a, b) => b.n - a.n);
  const continents = Array.from(new Set(towns.map((t) => t.continent))).sort();

  // With 31 countries in play, listing every admin region at once is unusable.
  // Regions only appear once a single country is selected.
  const regions =
    filters.countries.length === 1
      ? Array.from(
          new Set(towns.filter((t) => t.country === filters.countries[0]).map((t) => t.ccaa)),
        ).sort()
      : [];

  return (
    <div className={showFilters ? "app filters-open" : "app"}>
      <header>
        <h1>HomeFinder</h1>
        <span className="sub">
          {data.meta.count.toLocaleString()} places in {countries.length} countries
        </span>
        <button
          className="filtersbtn"
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
        >
          {showFilters ? 'Done' : 'Filters'}
        </button>
        <label className="homepick" title="Everything money-related is shown relative to here">
          I am in
          <select
            value={home ?? ''}
            onChange={(e) => {
              const v = e.target.value || null;
              setHome(v);
              saveHome(v);
            }}
          >
            <option value="">not set</option>
            {homeList.map((o) => (
              <option key={o.cc} value={o.cc}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        {home && !FREE_MOVEMENT.has(home) && (
          <span className="warn" title="Residence and ownership here assume an EU or EFTA passport">
            residence rules assume an EU passport
          </span>
        )}
        <div className="spacer" />
        <button className="primary small" onClick={() => setShowWizard(true)}>
          {answers ? 'Edit preferences' : 'Set up'}
        </button>
        <div className="modes" role="tablist" aria-label="How to rank">
          <button className={mode === 'score' ? 'on' : ''} onClick={() => setMode('score')}>
            Best fit
          </button>
          <button
            className={mode === 'near' ? 'on' : ''}
            onClick={() => setMode('near')}
            title="Places that would be among your best if you forgave one or two things"
          >
            Near misses{near.length ? ` ${near.length}` : ''}
          </button>
          <button className={mode === 'gems' ? 'on' : ''} onClick={() => setMode('gems')}>
            Gems
          </button>
        </div>
        <button className="link" onClick={() => setShowListings(true)}>
          My listings
        </button>
        <span className="count">
          {rows.length.toLocaleString()} {mode === 'near' ? 'near misses' : 'match'}
        </span>
      </header>

      <div className="body">
        {/* Tapping the map or table area closes the filter sheet. Only rendered
            when it is open, so it cannot swallow clicks on desktop. */}
        {showFilters && (
          <div className="scrim" onClick={() => setShowFilters(false)} aria-hidden />
        )}
        <aside>
          {/* The drawer covers the header on a phone, and the header is where
              the button that opened it lives. Without this there is no way
              back out. Hidden on desktop, where the sidebar is never covering
              anything. */}
          <div className="drawerbar">
            <b>Filters</b>
            <button onClick={() => setShowFilters(false)}>Done</button>
          </div>
          <FilterPanel
            filters={filters}
            weights={weights}
            regions={regions}
            countries={countries}
            continents={continents}
            towns={towns}
            notes={notes}
            affinity={affinity}
            homeIndex={homeIndex}
            homeName={homeName}
            anchor={anchor}
            workTz={workTz}
            tzOptions={tzList}
            onWorkTz={chooseWorkTz}
            onFilters={setFilters}
            onWeights={setWeights}
            onOpenWizard={() => setShowWizard(true)}
          />
        </aside>

        <div className="center">
          <div className="mapwrap">
            <MapView
              ranked={rows}
              mode={mode}
              selected={selected}
              focus={sel?.town ?? null}
              onSelect={setSelected}
              listings={listings}
              showPlaces={showPlaces}
              showBuilds={showBuilds}
            />
            <div className="layers">
              <label>
                <input
                  type="checkbox"
                  checked={showPlaces}
                  onChange={(e) => setShowPlaces(e.target.checked)}
                />
                {mode === 'near' ? 'Near misses' : 'Places'}{' '}
                <span className="n">{rows.length.toLocaleString()}</span>
              </label>
              <label className={listings.length ? '' : 'off'}>
                <input
                  type="checkbox"
                  checked={showBuilds}
                  disabled={!listings.length}
                  onChange={(e) => setShowBuilds(e.target.checked)}
                />
                Developments <span className="n">{listings.length}</span>
              </label>
              {!listings.length && (
                <div className="hint">
                  Import a list under <b>My listings</b> to plot developments here.
                </div>
              )}
            </div>
          </div>
          <TownTable
            ranked={rows}
            base={ranked}
            all={towns}
            reject={(t) => rejectReason(t, filters, env)}
            mode={mode}
            gemModel={gemModel}
            compare={compare}
            refs={refs}
            affinity={affinity}
            dist={dist}
            homeIndex={homeIndex}
            workTz={workTz}
            showPets={weights.pets > 0}
            selected={selected}
            onSelect={setSelected}
          />
        </div>

        {sel && (
          <div className="detail">
            <TownDetail
              ranked={sel}
              wouldRank={sel.forgiven != null ? wouldRank(ranked, sel.forgiven) : null}
              rankNow={sel.forgiven != null || sel.excluded ? wouldRank(ranked, sel.score) : null}
              filters={filters}
              env={env}
              gemModel={gemModel}
              refs={refs}
              compare={compare}
              rules={data.meta.countryRules}
              homeIndex={homeIndex}
              homeName={homeName}
              anchor={anchor}
              workTz={workTz}
              developers={data.meta.developers}
              onClose={() => setSelected(null)}
              onRelax={(patch) => setFilters((f) => ({ ...f, ...patch }))}
              onToggleFavourite={(t: Town) =>
                setFilters((f) => ({
                  ...f,
                  favourites: f.favourites.includes(t.id)
                    ? f.favourites.filter((x) => x !== t.id)
                    : [...f.favourites, t.id],
                }))
              }
              onToggleAvoid={(t: Town) =>
                setFilters((f) => ({
                  ...f,
                  avoid: f.avoid.includes(t.id)
                    ? f.avoid.filter((x) => x !== t.id)
                    : [...f.avoid, t.id],
                }))
              }
            />
          </div>
        )}
      </div>

      {showWizard && (
        <Questionnaire
          towns={towns}
          home={home}
          initial={answers}
          onApply={applyProfile}
          onClose={() => {
            setShowWizard(false);
            try {
              localStorage.setItem(SEEN, '1');
            } catch {
              /* private mode: the worst case is being asked again */
            }
          }}
        />
      )}

      {showListings && (
        <ListingsPanel
          towns={towns}
          filters={filters}
          weights={weights}
          refs={refs}
          scoreCtx={scoreCtx}
          listings={listings}
          onListings={setListings}
          onClose={() => setShowListings(false)}
          onSelectTown={(ine) => {
            setSelected(ine);
            setShowListings(false);
          }}
        />
      )}
    </div>
  );
}
