import { useMemo, useState } from 'react';
import type { Town } from '../types';
import { rejectReason } from '../scoring';
import {
  buildProfile,
  countMatches,
  DEFAULT_ANSWERS,
  resolveReferences,
  type Answers,
  type Essential,
  type Profile,
  type Strictness,
  type Want,
} from '../profile';

interface Props {
  towns: Town[];
  /** Home country, so the places offered start near the user. */
  home?: string | null;
  initial?: Answers;
  onApply: (p: Profile, a: Answers) => void;
  onClose: () => void;
}

function Chips<T extends string>(props: {
  options: Array<{ value: T; label: string; hint?: string }>;
  value: T[];
  onChange: (v: T[]) => void;
}) {
  return (
    <div className="chips">
      {props.options.map((o) => {
        const on = props.value.includes(o.value);
        return (
          <button
            key={o.value}
            className={on ? 'on' : ''}
            title={o.hint}
            onClick={() =>
              props.onChange(on ? props.value.filter((v) => v !== o.value) : [...props.value, o.value])
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Pick<T extends string>(props: {
  options: Array<{ value: T; label: string; hint?: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="picks">
      {props.options.map((o) => (
        <button
          key={o.value}
          className={props.value === o.value ? 'on' : ''}
          onClick={() => props.onChange(o.value)}
        >
          <b>{o.label}</b>
          {o.hint && <small>{o.hint}</small>}
        </button>
      ))}
    </div>
  );
}

const STEPS = ['Places you know', 'What you want', 'Your days', 'Travel & winter', 'Budget', 'Result'];

export default function Questionnaire({ towns, home, initial, onApply, onClose }: Props) {
  const [step, setStep] = useState(0);
  const [a, setA] = useState<Answers>(initial ?? DEFAULT_ANSWERS);
  const set = (patch: Partial<Answers>) => setA((prev) => ({ ...prev, ...patch }));

  const byId = useMemo(() => new Map(towns.map((t) => [t.id, t])), [towns]);
  const cities = useMemo(() => resolveReferences(towns, home), [towns, home]);

  const profile = useMemo(() => buildProfile(a, towns), [a, towns]);
  const matches = useMemo(
    () => countMatches(towns, profile.filters, rejectReason),
    [towns, profile],
  );

  /** Live count at each strictness level, so the trade-off is visible up front. */
  const strictnessPreview = useMemo(() => {
    const out: Record<string, { n: number; example: string }> = {};
    for (const s of ['clearly', 'much', 'max'] as Strictness[]) {
      const p = buildProfile({ ...a, strictness: s }, towns);
      const passing = towns.filter((t) => !rejectReason(t, p.filters));
      passing.sort((x, y) => y.pop - x.pop);
      out[s] = { n: passing.length, example: passing[0]?.name ?? 'n/a' };
    }
    return out;
  }, [a, towns]);

  const hotPicked = a.ruledOut.map((i) => byId.get(i)).filter(Boolean) as Town[];
  const madrid = byId.get('ES-28079') ?? null;

  const canNext = step === 0 ? a.ruledOut.length > 0 || a.feltRight.length > 0 : true;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet wizard" onClick={(e) => e.stopPropagation()}>
        <div className="wizhead">
          <div>
            <h2>Find your climate</h2>
            <div className="steps">
              {STEPS.map((s, i) => (
                <span key={s} className={i === step ? 'on' : i < step ? 'done' : ''}>
                  {s}
                </span>
              ))}
            </div>
          </div>
          <button className="link" onClick={onClose}>
            close
          </button>
        </div>

        {/* ---------------------------------------------------- step 0 */}
        {step === 0 && (
          <div className="wizbody">
            <p className="lede">
              Nobody knows whether they want "fewer than 12 nights above 20&nbsp;°C". Everybody
              knows which places felt wrong. Name the ones you have actually experienced and this
              reads their real measurements to set your limits. Too hot and too cold are both
              valid answers; the next step asks which.
            </p>

            <h4>Climates that did not suit me</h4>
            <Chips
              options={cities.map((r) => ({ value: r.id, label: r.label }))}
              value={a.ruledOut}
              onChange={(v) => set({ ruledOut: v })}
            />

            <h4>Felt right, or close to it (optional)</h4>
            <Chips
              options={cities.map((r) => ({ value: r.id, label: r.label }))}
              value={a.feltRight}
              onChange={(v) => set({ feltRight: v })}
            />
            <p className="hintline">
              Anything picked here is guaranteed to survive your own filters, a profile that
              excludes the place you liked is a bug, not a result.
            </p>

            {hotPicked.length > 0 && (
              <table className="mini">
                <thead>
                  <tr>
                    <th>Rejected</th>
                    <th>days &gt;30°</th>
                    <th>nights &gt;20°</th>
                    <th>peak high</th>
                    <th>humidity</th>
                  </tr>
                </thead>
                <tbody>
                  {hotPicked.map((t) => (
                    <tr key={t.id}>
                      <td className="town">{t.name}</td>
                      <td>{t.daysOver30.toFixed(0)}</td>
                      <td>{t.tropicalNights.toFixed(0)}</td>
                      <td>{t.hottestTmax.toFixed(1)}°</td>
                      <td>{t.humidity.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {hotPicked.length > 1 && (
              <div className="note">
                Two cities can be unbearable for opposite reasons, one punishing by day, the other
                never cooling at night. Each metric takes the strictest of your rejections rather
                than averaging them, so both complaints are respected.
              </div>
            )}
          </div>
        )}

        {/* ---------------------------------------------------- step 1 */}
        {step === 1 && (
          <div className="wizbody">
            <h4>What was wrong with them?</h4>
            <Pick
              options={[
                { value: 'cooler' as Want, label: 'Too hot', hint: 'You want somewhere cooler' },
                { value: 'warmer' as Want, label: 'Too cold', hint: 'You want somewhere warmer' },
              ]}
              value={a.want}
              onChange={(v) => set({ want: v })}
            />
            <p className="hintline">
              Asked rather than assumed. Everything downstream reads this, so wanting heat is
              treated exactly as seriously as wanting to escape it.
            </p>

            <h4>How far past that do you want to be?</h4>
            <Pick
              options={[
                {
                  value: 'clearly' as Strictness,
                  label: a.want === 'warmer' ? 'Clearly warmer' : 'Clearly cooler',
                  hint: `${strictnessPreview.clearly.n} towns · e.g. ${strictnessPreview.clearly.example}`,
                },
                {
                  value: 'much' as Strictness,
                  label: a.want === 'warmer' ? 'Much warmer' : 'Much cooler',
                  hint: `${strictnessPreview.much.n} towns · e.g. ${strictnessPreview.much.example}`,
                },
                {
                  value: 'max' as Strictness,
                  label: a.want === 'warmer' ? 'As warm as it gets' : 'As cool as it gets',
                  hint: `${strictnessPreview.max.n} towns · e.g. ${strictnessPreview.max.example}`,
                },
              ]}
              value={a.strictness}
              onChange={(v) => set({ strictness: v })}
            />
            <div className="derived">
              <div>
                <span>Summer target</span>
                <b>
                  {profile.filters.summerTarget == null
                    ? 'not set'
                    : `${profile.filters.summerTarget} °C`}
                </b>
              </div>
              {a.want === 'warmer' ? (
                <>
                  <div>
                    <span>Hottest month, daily high</span>
                    <b>≥ {profile.filters.minHotTmax} °C</b>
                  </div>
                  <div>
                    <span>Winter nights</span>
                    <b>≥ {profile.filters.minWinterTmin} °C</b>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <span>Days above 30 °C</span>
                    <b>≤ {profile.filters.maxDaysOver30}</b>
                  </div>
                  <div>
                    <span>Nights above 20 °C</span>
                    <b>≤ {profile.filters.maxTropicalNights}</b>
                  </div>
                  <div>
                    <span>Hottest month, daily high</span>
                    <b>≤ {profile.filters.maxHotTmax} °C</b>
                  </div>
                </>
              )}
            </div>
            <p className="hintline">
              {a.want === 'warmer'
                ? 'The strictest setting pushes toward the subtropics and the coast, where winters stay mild as well.'
                : 'The strictest setting pushes inland, uphill and north. The coolest summers are not on any coast but above 1,000 m or past 50° latitude, where nights fall away sharply: the Carpathians, the Alps, Hokkaido, the Cantabrian interior.'}
            </p>
          </div>
        )}

        {/* ---------------------------------------------------- step 2 */}
        {step === 2 && (
          <div className="wizbody">
            <h4>How do you spend a working day?</h4>
            <Pick
              options={[
                { value: 'wfh' as const, label: 'At home, all day', hint: 'You live inside the summer, for months' },
                { value: 'hybrid' as const, label: 'Partly at home', hint: 'Some trips into a city' },
                { value: 'commute' as const, label: 'Commuting daily', hint: 'City distance becomes critical' },
              ]}
              value={a.day}
              onChange={(v) => set({ day: v })}
            />
            {a.day === 'wfh' && madrid && (
              <div className="note">
                Working from home changes which number matters. Peak temperature is a bad guide when
                you are indoors from June to September; the cooling load over the whole season is the
                real burden. The results table shows this as <b>AC</b>, cooling need as a percentage
                of {madrid.name}'s.
              </div>
            )}

            <h4>What kind of place?</h4>
            <Pick
              options={[
                { value: 'any' as const, label: 'Anywhere', hint: 'No size constraint' },
                { value: 'city' as const, label: 'In a city', hint: '50,000+ people' },
                { value: 'edge' as const, label: 'Edge of a city', hint: 'Within 30 km of one' },
                { value: 'town' as const, label: 'A small town', hint: '2,000 to 60,000' },
              ]}
              value={a.placeSize}
              onChange={(v) => set({ placeSize: v })}
            />
          </div>
        )}

        {/* ---------------------------------------------------- step 3 */}
        {step === 3 && (
          <div className="wizbody">
            <h4>How much do you fly?</h4>
            <Pick
              options={[
                { value: 'often' as const, label: 'Often', hint: 'Hub within a 45-minute drive' },
                { value: 'sometimes' as const, label: 'Now and then', hint: 'Hub within 1 h 30' },
                { value: 'rarely' as const, label: 'Rarely', hint: 'Any airport within 2 h' },
              ]}
              value={a.flying}
              onChange={(v) => set({ flying: v })}
            />
            <p className="hintline">
              "Hub" means 2M+ passengers a year, enough for real international routes: Bilbao,
              Porto and Lyon qualify, Santander does not. If an airport is the only thing wrong
              with a place, the Near misses view will still show it to you.
            </p>

            <h4>Winter, rain and grey skies?</h4>
            <Pick
              options={[
                { value: 'love-cold' as const, label: 'I like them', hint: 'Cold and wet count as neutral' },
                { value: 'dont-mind' as const, label: "Don't mind", hint: 'Mild preference for milder' },
                { value: 'prefer-mild' as const, label: 'Prefer mild and sunny', hint: 'Fights the summer limits' },
              ]}
              value={a.winter}
              onChange={(v) => set({ winter: v })}
            />
          </div>
        )}

        {/* ---------------------------------------------------- step 4 */}
        {step === 4 && (
          <div className="wizbody">
            <h4>Budget and size</h4>
            <div className="f">
              <label>
                <span className="name">Maximum budget</span>
                <span className="val">€{a.budget.toLocaleString()}</span>
              </label>
              <input
                type="range"
                min={50_000}
                max={800_000}
                step={10_000}
                value={a.budget}
                onChange={(e) => set({ budget: Number(e.target.value) })}
              />
            </div>
            <div className="f">
              <label>
                <span className="name">Minimum size</span>
                <span className="val">{a.minM2} m²</span>
              </label>
              <input
                type="range"
                min={40}
                max={250}
                step={5}
                value={a.minM2}
                onChange={(e) => set({ minM2: Number(e.target.value) })}
              />
              <div className="hint">
                Needs €/m² under {Math.round(a.budget / a.minM2).toLocaleString()}
              </div>
            </div>

            <h4>Anything essential?</h4>
            <Chips
              options={[
                { value: 'train' as Essential, label: 'Train station nearby' },
                { value: 'coast' as Essential, label: 'Near the coast' },
                { value: 'mountains' as Essential, label: 'Mountains nearby' },
                { value: 'nature' as Essential, label: 'Protected nature nearby' },
                { value: 'ski' as Essential, label: 'Ski slopes within a day trip' },
                { value: 'dog' as Essential, label: 'Moving with a dog' },
                { value: 'observed-price' as Essential, label: 'Officially priced only' },
              ]}
              value={a.essentials}
              onChange={(v) => set({ essentials: v })}
            />
          </div>
        )}

        {/* ---------------------------------------------------- step 5 */}
        {step === 5 && (
          <div className="wizbody">
            <div className="bigcount">
              <b>{matches.toLocaleString()}</b> places match
            </div>
            {matches === 0 && (
              <div className="note">
                Nothing survives. The summer limits and the budget are almost always the binding
                pair, step back and loosen one.
              </div>
            )}
            <h4>What this set, and why</h4>
            <ul className="notes">
              {profile.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
            <div className="derived">
              {a.want === 'warmer' ? (
                <>
                  <div><span>Hottest month</span><b>≥ {profile.filters.minHotTmax} °C</b></div>
                  <div><span>Winter nights</span><b>≥ {profile.filters.minWinterTmin} °C</b></div>
                </>
              ) : (
                <>
                  <div><span>Days above 30 °C</span><b>≤ {profile.filters.maxDaysOver30}</b></div>
                  <div><span>Nights above 20 °C</span><b>≤ {profile.filters.maxTropicalNights}</b></div>
                  <div><span>Hottest month</span><b>≤ {profile.filters.maxHotTmax} °C</b></div>
                </>
              )}
              <div><span>Drive to a hub airport</span><b>≤ {profile.filters.maxHubMin} min</b></div>
              <div><span>City of 100k</span><b>≤ {profile.filters.maxCityKm} km</b></div>
              <div><span>Budget</span><b>€{profile.filters.budget.toLocaleString()} / {profile.filters.minM2} m²</b></div>
            </div>
            <p className="hintline">
              Everything here stays adjustable in the sidebar afterwards, this only sets the
              starting point.
            </p>
          </div>
        )}

        <div className="wizfoot">
          <button className="link" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            back
          </button>
          <span className="count">
            {step > 0 && `${matches.toLocaleString()} matching`}
          </span>
          {step < STEPS.length - 1 ? (
            <button className="primary" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
              {step === 0 && !canNext ? 'Pick at least one place' : 'Next'}
            </button>
          ) : (
            <button className="primary" onClick={() => onApply(profile, a)}>
              Apply these settings
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

