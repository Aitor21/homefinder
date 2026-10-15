import {
  applySummer, applyWhere, BUDGETS, SIZES, SUMMERS, summaryChips, summerOf, toggleVibe, VIBES,
  whereOf, whereOptions, type Search,
} from '../quickstart';

interface Props {
  search: Search;
  onSearch: (s: Search) => void;
  home: string | null;
  homeName: string | null;
}

/**
 * The quick start's tiles, kept at the top of the filter panel after the first
 * visit. The same four questions, answerable again in one tap each, so
 * changing your mind about the beach does not mean finding the coast weight
 * among nineteen sliders.
 */
export default function QuickControls({ search, onSearch, home, homeName }: Props) {
  const f = search.filters;
  const where = whereOf(f, home);
  const summer = summerOf(f);
  return (
    <div className="quick">
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

      <h3>Summer</h3>
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

      <h3>Around you</h3>
      <div className="vibechips">
        {VIBES.map((v) => {
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
        })}
      </div>

      <h3>Budget</h3>
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
          <span key={c.key} className="schip">
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
