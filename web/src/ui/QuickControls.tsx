import { MONTHS } from '../climate';
import {
  applyIntent, applySummer, applyWhere, BUDGETS, INTENTS, setBuying, SIZES, SUMMERS, summaryChips,
  summerOf, toggleVibe, VIBES, whereOf, whereOptions, type Search, type VibeOption,
} from '../quickstart';

interface Props {
  search: Search;
  onSearch: (s: Search) => void;
  home: string | null;
  homeName: string | null;
}

/**
 * The quick start's tiles, kept at the top of the filter panel after the first
 * visit. The same questions, answerable again in one tap each, so changing
 * your mind about the beach does not mean finding the coast weight among
 * twenty sliders.
 */
export default function QuickControls({ search, onSearch, home, homeName }: Props) {
  const f = search.filters;
  const where = whereOf(f, home);
  const summer = summerOf(f);
  const travel = f.intent === 'travel';

  const toggleMonth = (m: number) => {
    const ms = f.months.includes(m) ? f.months.filter((x) => x !== m) : [...f.months, m].sort((a, b) => a - b);
    onSearch({ ...search, filters: { ...f, months: ms } });
  };

  const chip = (v: VibeOption) => {
    const on = v.isOn(search);
    return (
      <button
        key={v.key}
        className={on ? 'on' : ''}
        aria-pressed={on}
        title={v.hint}
        onClick={() => onSearch(toggleVibe(search, v.key))}
      >
        <span aria-hidden>{v.icon}</span> {v.label}
      </button>
    );
  };

  return (
    <div className="quick">
      <h3>Looking to</h3>
      <div className="seg wrap">
        {INTENTS.map((o) => (
          <button
            key={o.key}
            className={f.intent === o.key ? 'on' : ''}
            title={o.hint}
            onClick={() => onSearch(applyIntent(search, o.key))}
          >
            <span aria-hidden>{o.icon}</span> {o.label}
          </button>
        ))}
      </div>

      {travel && (
        <>
          <h3>When</h3>
          <div className="months compact" role="group" aria-label="Months of your visit">
            {MONTHS.map((m, i) => (
              <button key={m} className={f.months.includes(i) ? 'on' : ''} aria-pressed={f.months.includes(i)} onClick={() => toggleMonth(i)}>
                {m}
              </button>
            ))}
          </div>
          {!f.months.length && <div className="hint">No months picked: weather is judged on the warmest month.</div>}
        </>
      )}

      <h3>Where</h3>
      <div className="seg wrap">
        {whereOptions(homeName, home).map((o) => (
          <button
            key={o.key}
            className={where === o.key ? 'on' : ''}
            title={o.hint}
            onClick={() => onSearch({ ...search, filters: applyWhere(f, o.key, home) })}
          >
            <span aria-hidden>{o.icon}</span> {o.label}
          </button>
        ))}
      </div>
      {where == null && <div className="hint">Custom countries or regions, set below.</div>}

      <h3>{travel && f.months.length ? 'Weather then' : 'Weather'}</h3>
      <div className="seg wrap">
        {SUMMERS.map((s) => (
          <button
            key={s.key}
            className={summer === s.key ? 'on' : ''}
            title={s.hint}
            onClick={() => onSearch({ ...search, filters: applySummer(f, s.key) })}
          >
            <span aria-hidden>{s.icon}</span> {s.key === 'any' ? 'Any' : s.label}
          </button>
        ))}
      </div>
      {summer == null && f.summerTarget != null && (
        <div className="hint">Custom: aiming at {f.summerTarget} °C, from your places or the sliders below.</div>
      )}

      <h3>Landscape</h3>
      <div className="vibechips">{VIBES.filter((v) => v.group === 'landscape').map(chip)}</div>

      <h3>Things to do &amp; way of life</h3>
      <div className="vibechips">{VIBES.filter((v) => v.group === 'life').map(chip)}</div>

      <h3>Buying</h3>
      <label className="chk">
        <input type="checkbox" checked={f.buying} onChange={(e) => onSearch(setBuying(search, e.target.checked))} />
        I want to buy: filter by budget and size
      </label>
      {f.buying ? (
        <>
          <div className="seg wrap">
            {BUDGETS.map((b) => (
              <button
                key={b.value}
                className={f.budget === b.value ? 'on' : ''}
                onClick={() => onSearch({ ...search, filters: { ...f, budget: b.value } })}
              >
                {b.label.replace('Up to ', '≤ ')}
              </button>
            ))}
          </div>
          <div className="seg wrap" style={{ marginTop: 5 }}>
            {SIZES.map((s) => (
              <button
                key={s.value}
                className={f.minM2 === s.value ? 'on' : ''}
                title={s.hint}
                onClick={() => onSearch({ ...search, filters: { ...f, minM2: s.value } })}
              >
                {s.label} {s.value} m²
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="hint">
          Off: housing costs are ranked (cheaper scores higher), not filtered, and every country is
          shown, including those where a foreigner cannot buy.
        </div>
      )}
    </div>
  );
}

/**
 * The search as a row of chips above the results. Each one tells you what is
 * shaping the list and removes itself in one tap.
 */
export function SearchSummary({
  search, onSearch, home, homeName, onRefine, onTaste, likes,
}: Props & { onRefine: () => void; onTaste: () => void; likes: number }) {
  const chips = summaryChips(search, home, homeName);
  return (
    <div className="summary">
      <div className="chiprow">
        {chips.map((c) => (
          <span key={c.key} className={c.key === 'intent' ? 'schip intent' : 'schip'}>
            <span aria-hidden>{c.icon}</span> {c.label}
            {c.remove && (
              <button aria-label={`Remove ${c.label}`} onClick={() => onSearch(c.remove!(search))}>
                ×
              </button>
            )}
          </span>
        ))}
        <button className="schip add" onClick={onRefine}>+ Refine</button>
      </div>
      {likes < 3 && (
        <button className="tastecta" onClick={onTaste}>
          <span aria-hidden>♥</span> {likes ? `Like ${3 - likes} more to sharpen your matches` : 'Sharpen your matches: rate 10 places'}
        </button>
      )}
    </div>
  );
}
