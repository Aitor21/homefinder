import { useEffect, useMemo, useState } from 'react';
import type { Dataset, Filters, Town, Weights } from './types';
import { DEFAULT_FILTERS, DEFAULT_WEIGHTS } from './types';
import { rank, rejectReason, type Ranked } from './scoring';
import type { Listing } from './listings';
import {
  loadHome, saveHome, countryCostIndex, countryName, homeOptions, FREE_MOVEMENT,
} from './home';
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

export type Mode = 'score' | 'gems';

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
  const dist = useMemo(() => (towns.length ? buildDistribution(towns) : null), [towns]);
  const affinity = useMemo(
    () => (dist ? learnAffinity(refs, dist, towns) : null),
    [refs, dist, towns],
  );
  const scoreCtx = useMemo(() => ({ refs, affinity, dist }), [refs, affinity, dist]);

  const ranked = useMemo<Ranked[]>(() => {
    const rows = rank(towns, filters, weights, scoreCtx);
    for (const r of rows) r.gem = gemModel.gem.get(r.town.id) ?? 0;
    if (mode === 'gems') {
      // Still require a decent absolute score -- a cheap town that fails on
      // everything else is not a gem, it is just cheap.
      const cutoff = rows.length ? Math.max(...rows.map((r) => r.score)) * 0.62 : 0;
      return rows.filter((r) => r.score >= cutoff).sort((a, b) => (b.gem ?? 0) - (a.gem ?? 0));
    }
    return rows;
  }, [towns, filters, weights, scoreCtx, mode, gemModel]);

  const sel = useMemo(
    () => ranked.find((r) => r.town.id === selected) ?? null,
    [ranked, selected],
  );

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
    <div className="app">
      <header>
        <h1>HomeFinder</h1>
        <span className="sub">
          {data.meta.count.toLocaleString()} places in {countries.length} countries
        </span>
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
        <div className="modes">
          <button className={mode === 'score' ? 'on' : ''} onClick={() => setMode('score')}>
            Best fit
          </button>
          <button className={mode === 'gems' ? 'on' : ''} onClick={() => setMode('gems')}>
            Gems
          </button>
        </div>
        <button className="link" onClick={() => setShowListings(true)}>
          My listings
        </button>
        <span className="count">{ranked.length.toLocaleString()} match</span>
      </header>

      <div className="body">
        <aside>
          <FilterPanel
            filters={filters}
            weights={weights}
            regions={regions}
            countries={countries}
            continents={continents}
            towns={towns}
            notes={notes}
            affinity={affinity}
            onFilters={setFilters}
            onWeights={setWeights}
            onOpenWizard={() => setShowWizard(true)}
          />
        </aside>

        <div className="center">
          <div className="mapwrap">
            <MapView
              ranked={ranked}
              mode={mode}
              selected={selected}
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
                Places <span className="n">{ranked.length.toLocaleString()}</span>
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
            ranked={ranked}
            all={towns}
            reject={(t) => rejectReason(t, filters)}
            mode={mode}
            gemModel={gemModel}
            compare={compare}
            refs={refs}
            affinity={affinity}
            dist={dist}
            selected={selected}
            onSelect={setSelected}
          />
        </div>

        {sel && (
          <div className="detail">
            <TownDetail
              ranked={sel}
              filters={filters}
              gemModel={gemModel}
              refs={refs}
              compare={compare}
              rules={data.meta.countryRules}
              homeIndex={homeIndex}
              homeName={homeName}
              developers={data.meta.developers}
              onClose={() => setSelected(null)}
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
