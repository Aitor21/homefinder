import type { Filters, Ownership, Town, Weights } from '../types';
import { POP_ANY } from '../types';
import { OWNERSHIP_LABEL } from '../types';
import { explain, MIN_PICKS, type Affinity } from '../affinity';
import { DEFAULT_FILTERS, DEFAULT_WEIGHTS } from '../types';

interface Props {
  filters: Filters;
  weights: Weights;
  regions: string[];
  countries: Array<{ code: string; name: string; n: number }>;
  continents: string[];
  towns: Town[];
  /** Plain-English account of what the questionnaire set, if it has been run. */
  notes: string[];
  affinity: Affinity | null;
  onFilters: (f: Filters) => void;
  onWeights: (w: Weights) => void;
  onOpenWizard: () => void;
}

function Slider(props: {
  name: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  fmt?: (v: number) => string;
  hint?: string;
  onChange: (v: number) => void;
}) {
  const { name, value, min, max, step = 1, fmt, hint, onChange } = props;
  return (
    <div className="f">
      <label>
        <span className="name">{name}</span>
        <span className="val">{fmt ? fmt(value) : value}</span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

const eur = (v: number) => '€' + v.toLocaleString();
const km = (v: number) => v + ' km';
const days = (v: number) => v + ' d';
const mins = (v: number) =>
  v >= 90 ? Math.floor(v / 60) + ' h ' + String(v % 60).padStart(2, '0') : v + ' min';

export default function FilterPanel(p: Props) {
  const f = p.filters;
  const w = p.weights;
  const set = (patch: Partial<Filters>) => p.onFilters({ ...f, ...patch });
  const setW = (patch: Partial<Weights>) => p.onWeights({ ...w, ...patch });

  const byId = new Map(p.towns.map((t) => [t.id, t]));
  const favourites = f.favourites.map((id) => byId.get(id)).filter(Boolean) as Town[];
  const avoided = f.avoid.map((id) => byId.get(id)).filter(Boolean) as Town[];
  const refTown = favourites[0];

  const drop = (key: 'favourites' | 'avoid', id: string) =>
    set({ [key]: f[key].filter((x) => x !== id) } as Partial<Filters>);

  return (
    <>
      {p.notes.length > 0 && (
        <div className="group">
          <h3>
            Your profile{' '}
            <button className="link" onClick={p.onOpenWizard}>
              edit
            </button>
          </h3>
          <ul className="notes">
            {p.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="group">
        <h3>Budget &amp; size</h3>
        <Slider
          name="Max budget"
          value={f.budget}
          min={50_000}
          max={800_000}
          step={10_000}
          fmt={eur}
          onChange={(v) => set({ budget: v })}
        />
        <Slider
          name="Minimum size"
          value={f.minM2}
          min={40}
          max={250}
          step={5}
          fmt={(v) => v + ' m²'}
          hint={`Needs €/m² under ${Math.round(f.budget / f.minM2).toLocaleString()}`}
          onChange={(v) => set({ minM2: v })}
        />
        <label className="chk">
          <input
            type="checkbox"
            checked={f.requireObservedPrice}
            onChange={(e) => set({ requireObservedPrice: e.target.checked })}
          />
          Only officially priced towns
        </label>
      </div>

      <div className="group">
        <h3>Summer</h3>
        <Slider
          name="Summer you want"
          value={f.summerTarget ?? 0}
          min={0}
          max={40}
          fmt={(v) => (v === 0 ? 'no preference' : v + ' °C in the hottest month')}
          hint="Scored by distance from this in both directions, so asking for heat is
                as valid as asking for cool. Left at zero it is not scored at all."
          onChange={(v) => set({ summerTarget: v === 0 ? null : v })}
        />
        <Slider
          name="Hottest month at least"
          value={f.minHotTmax}
          min={0}
          max={40}
          fmt={(v) => (v === 0 ? 'any' : v + ' °C')}
          onChange={(v) => set({ minHotTmax: v })}
        />
        <Slider
          name="Days over 30 °C at most"
          value={f.maxDaysOver30}
          min={0}
          max={200}
          fmt={days}
          onChange={(v) => set({ maxDaysOver30: v })}
        />
        <Slider
          name="Nights over 20 °C at most"
          value={f.maxTropicalNights}
          min={0}
          max={200}
          fmt={days}
          hint="The one that decides whether you sleep"
          onChange={(v) => set({ maxTropicalNights: v })}
        />
        <Slider
          name="Hottest month at most"
          value={f.maxHotTmax}
          min={15}
          max={50}
          fmt={(v) => (v >= 50 ? 'any' : v + ' °C')}
          onChange={(v) => set({ maxHotTmax: v })}
        />
        <Slider
          name="Winter nights at least"
          value={f.minWinterTmin}
          min={-99}
          max={20}
          fmt={(v) => (v <= -99 ? 'any' : v + ' °C')}
          hint="For anyone ruling out places that get genuinely cold in winter"
          onChange={(v) => set({ minWinterTmin: v })}
        />
      </div>

      <div className="group">
        <h3>Getting out</h3>
        <Slider
          name="Drive to any airport"
          value={f.maxAirportMin}
          min={10}
          max={180}
          step={5}
          fmt={mins}
          onChange={(v) => set({ maxAirportMin: v })}
        />
        <Slider
          name="Drive to a hub airport"
          value={f.maxHubMin}
          min={15}
          max={240}
          step={5}
          fmt={mins}
          hint="2M+ passengers. Estimated drive time, not straight-line distance: the same 50 km is half an hour on the meseta and over an hour across a pass."
          onChange={(v) => set({ maxHubMin: v })}
        />
        <Slider
          name="To a city of 100k"
          value={f.maxCityKm}
          min={0}
          max={250}
          step={5}
          fmt={km}
          onChange={(v) => set({ maxCityKm: v })}
        />
        <label className="chk">
          <input
            type="checkbox"
            checked={f.maxTrainKm != null}
            onChange={(e) => set({ maxTrainKm: e.target.checked ? 15 : null })}
          />
          Must have a train station
        </label>
        {f.maxTrainKm != null && (
          <Slider
            name="Station within"
            value={f.maxTrainKm}
            min={1}
            max={60}
            fmt={km}
            onChange={(v) => set({ maxTrainKm: v })}
          />
        )}
        <label className="chk">
          <input
            type="checkbox"
            checked={f.maxTransitKm != null}
            onChange={(e) => set({ maxTransitKm: e.target.checked ? 3 : null })}
          />
          Must have public transport
        </label>
        {f.maxTransitKm != null && (
          <Slider
            name="Transport within"
            value={f.maxTransitKm}
            min={1}
            max={30}
            fmt={km}
            hint="Nearest of a mainline station, a metro, tram or light rail stop, or a
                  coach terminal. One control because the question is whether you can
                  leave without a car, not which mode does it."
            onChange={(v) => set({ maxTransitKm: v })}
          />
        )}
        <div className="hint">
          Urban rail and coach terminals are surveyed everywhere the dataset reaches. Bus
          <i> stops</i> are deliberately not: every village street has one and it tells you
          nothing, so this counts stations, which mean scheduled services actually call.
        </div>
      </div>

      <div className="group">
        <h3>Living conditions</h3>
        <Slider
          name="Broadband at least"
          value={f.minNetMbps}
          min={0}
          max={300}
          step={5}
          fmt={(v) => (v === 0 ? 'any' : v + ' Mbps')}
          hint="Places with too few Speedtest results are never excluded on this"
          onChange={(v) => set({ minNetMbps: v })}
        />
        <Slider
          name="PM2.5 at most"
          value={f.maxPm25}
          min={5}
          max={60}
          fmt={(v) => v + ' µg/m³'}
          hint="WHO guideline 5, EU limit value 25"
          onChange={(v) => set({ maxPm25: v })}
        />
        <Slider
          name="Cost of living at most"
          value={f.maxCostIndex}
          min={40}
          max={250}
          step={5}
          fmt={(v) => (v >= 250 ? 'any' : String(v))}
          hint="World Bank price level. The town panel shows this relative to wherever you say you are."
          onChange={(v) => set({ maxCostIndex: v })}
        />
      </div>

      <div className="group">
        <h3>Town size</h3>
        <Slider
          name="Minimum population"
          value={f.minPop}
          min={500}
          max={100_000}
          step={500}
          fmt={(v) => v.toLocaleString()}
          onChange={(v) => set({ minPop: v })}
        />
        <Slider
          name="Maximum population"
          value={f.maxPop}
          min={5_000}
          max={POP_ANY}
          step={5_000}
          fmt={(v) => (v >= POP_ANY ? 'any' : v.toLocaleString())}
          onChange={(v) => set({ maxPop: v })}
        />
      </div>

      <div className="group">
        <h3>
          Weights{' '}
          <button className="link" onClick={() => p.onWeights({ ...DEFAULT_WEIGHTS })}>
            reset
          </button>
        </h3>
        {(
          [
            ['summerFit', 'Right kind of summer'],
            ['affordability', 'Value for money'],
            ['airport', 'Airport access'],
            ['city', 'City access'],
            ['amenities', 'Local services'],
            ['mountains', 'Mountains'],
            ['coast', 'Coast'],
            ['winterMild', 'Mild winters'],
            ['drier', 'Less rain'],
            ['sunny', 'More sun'],
            ['cleanAir', 'Clean air'],
            ['internet', 'Fast broadband'],
            ['livingCost', 'Cheap to live in'],
            ['energyBill', 'Low energy bill'],
            ['affinity', 'Like my picks'],
          ] as Array<[keyof Weights, string]>
        ).map(([k, label]) => (
          <Slider
            key={k}
            name={label}
            value={w[k]}
            min={0}
            max={10}
            onChange={(v) => setW({ [k]: v } as Partial<Weights>)}
          />
        ))}
        <div className="hint">
          Rain and winter cold start at zero, cold and wet are preferences here, not penalties.
        </div>
      </div>

      <div className="group">
        <h3>Places you would live in</h3>
        {favourites.length ? (
          <div className="regions">
            {favourites.map((t) => (
              <button key={t.id} className="on" onClick={() => drop('favourites', t.id)}>
                {t.name} &times;
              </button>
            ))}
          </div>
        ) : (
          <div className="hint">None chosen &mdash; the climate-match weight has nothing to aim at.</div>
        )}
        <div className="hint">
          Every candidate is matched against the <b>closest</b> of these, not their average:
          liking both Bilbao and Sapporo is not a request for the midpoint between them. Add or
          remove any town from its detail panel.
        </div>

        {p.affinity && (
          <div className={p.affinity.ok ? 'note gem' : 'note'}>
            <b>
              {p.affinity.ok
                ? 'What your picks have in common'
                : `Add ${MIN_PICKS - p.affinity.picks} more to learn your taste`}
            </b>
            <ul className="notes" style={{ marginTop: 6 }}>
              {explain(p.affinity).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        )}

        <h3 style={{ marginTop: 14 }}>Climates you have ruled out</h3>
        {avoided.length ? (
          <div className="regions">
            {avoided.map((t) => (
              <button key={t.id} className="on" onClick={() => drop('avoid', t.id)}>
                {t.name} &times;
              </button>
            ))}
          </div>
        ) : (
          <div className="hint">None chosen.</div>
        )}
        <div className="hint">
          These set the summer ceilings, taking the strictest limit each one implies. Re-run the
          questionnaire to recompute the thresholds after changing them.
        </div>
      </div>

      <div className="group" hidden={p.continents.length < 2}>
        <h3>
          Continent{' '}
          {f.continents.length > 0 && (
            <button className="link" onClick={() => set({ continents: [] })}>
              clear
            </button>
          )}
        </h3>
        <div className="regions">
          {p.continents.map((k) => (
            <button
              key={k}
              className={f.continents.includes(k) ? 'on' : ''}
              onClick={() =>
                set({
                  continents: f.continents.includes(k)
                    ? f.continents.filter((x) => x !== k)
                    : [...f.continents, k],
                })
              }
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      <div className="group">
        <h3>Can you actually buy?</h3>
        <div className="regions">
          {(['freehold', 'restricted', 'leasehold', 'prohibited'] as Ownership[]).map((o) => (
            <button
              key={o}
              className={f.ownership.includes(o) ? 'on' : ''}
              onClick={() =>
                set({
                  ownership: f.ownership.includes(o)
                    ? f.ownership.filter((x) => x !== o)
                    : [...f.ownership, o],
                })
              }
            >
              {OWNERSHIP_LABEL[o]}
            </button>
          ))}
        </div>
        <div className="hint">
          Roughly half the world sells freehold to an EU passport holder. The rest does not:
          Australia has banned foreign buyers from established homes until 2029, New Zealand
          since 2018, Canada inside its cities until 2027. Mexico needs a bank trust within
          50 km of the coast, Thailand and the Philippines sell condominiums only, Kenya and
          Ghana lease rather than sell, and China and India are closed to non-residents. Open a
          town to read the rule for its country. Indicative only, verify before acting.
        </div>
      </div>

      <div className="group">
        <h3>Where you may live</h3>
        <label className="chk">
          <input
            type="checkbox"
            checked={f.freeMovementOnly}
            onChange={(e) => set({ freeMovementOnly: e.target.checked })}
          />
          Only where my passport already lets me live
        </label>
        <div className="hint">
          Owning a home grants residency almost nowhere, so this is a separate question from
          the one above. Ticked, you see the EU and EFTA only. Unticked, you also see the
          {' '}places that would need a visa, which is a solvable problem in most of the world
          and a very hard one in a few.
        </div>
      </div>

      <div className="group">
        <h3>
          Countries{' '}
          {f.countries.length > 0 && (
            <button className="link" onClick={() => set({ countries: [] })}>
              clear
            </button>
          )}
        </h3>
        <div className="regions">
          {p.countries.map((ccc) => (
            <button
              key={ccc.code}
              title={`${ccc.n.toLocaleString()} places`}
              className={f.countries.includes(ccc.code) ? 'on' : ''}
              onClick={() =>
                set({
                  countries: f.countries.includes(ccc.code)
                    ? f.countries.filter((x) => x !== ccc.code)
                    : [...f.countries, ccc.code],
                })
              }
            >
              {ccc.name}
            </button>
          ))}
        </div>
        <div className="hint">
          Spain has official municipal prices and a full amenity survey. Everywhere else
          carries a national price band and rail access only, useful for finding the
          climate, not for valuing a house.
        </div>
      </div>

      <div className="group" hidden={f.countries.length !== 1}>
        <h3>
          Regions{' '}
          {p.filters.regions.length > 0 && (
            <button className="link" onClick={() => set({ regions: [] })}>
              clear
            </button>
          )}
        </h3>
        <div className="regions">
          {p.regions.map((r) => (
            <button
              key={r}
              className={f.regions.includes(r) ? 'on' : ''}
              onClick={() =>
                set({
                  regions: f.regions.includes(r)
                    ? f.regions.filter((x) => x !== r)
                    : [...f.regions, r],
                })
              }
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <button className="link" onClick={() => p.onFilters({ ...DEFAULT_FILTERS })}>
        Reset all filters
      </button>
    </>
  );
}
