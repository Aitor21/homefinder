import type { Ranked } from '../scoring';
import type { Mode } from '../App';
import { discountPct, type GemModel } from '../gems';
import { reasons, topShare, type ExplainCtx } from '../explain';
import { flag } from '../quickstart';
import { Highlights } from './bits';

interface Props {
  r: Ranked;
  rank: number;
  total: number;
  /** The best score in the list, so the pill can say how close to it this is. */
  best: number;
  mode: Mode;
  gemModel: GemModel;
  explain: ExplainCtx;
  liked: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
  /** Rendered between the reasons and the highlights: near-miss chips. */
  children?: React.ReactNode;
}

/** Score colour: the same scale as the map, so a card and its pin agree. */
export function scoreClass(v: number, best: number): string {
  const rel = best > 0 ? v / best : 0;
  return rel >= 0.97 ? 's-top' : rel >= 0.9 ? 's-good' : rel >= 0.8 ? 's-mid' : 's-low';
}

/**
 * One suggestion: who it is, how it ranks, and in a line why. The why is the
 * point. A score says how good; the reasons say good at WHAT, against the
 * rest of your list, which is what makes two 83s different answers.
 */
export default function ResultCard({
  r, rank, total, best, mode, gemModel, explain, liked, selected, onSelect, children,
}: Props) {
  const t = r.town;
  const shown = mode === 'near' ? r.forgiven ?? r.score : r.score;
  const why = reasons(r, explain, 3, 1);
  const disc = mode === 'gems' ? discountPct(gemModel, t) : null;
  return (
    <li
      className={selected ? 'card sel' : 'card'}
      onClick={() => onSelect(t.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(t.id);
        }
      }}
      tabIndex={0}
      aria-label={`${rank}. ${t.name}, ${t.countryName}`}
    >
      <div className="crow">
        <span className="rank">{rank}</span>
        <span className="cflag" aria-hidden>{flag(t.country)}</span>
        <div className="cname">
          <b>{t.name}</b>
          {liked && <span className="heart" title="You liked this"> ♥</span>}
          <div className="subtle">{t.province} {'·'} {t.countryName}</div>
        </div>
        <div className="cscore" title={mode === 'near' ? 'Would score, with what holds it back set aside' : 'Score out of 100'}>
          <span className={`scorepill ${scoreClass(shown, best)}`}>{Math.round(shown)}</span>
          <span className="share">{topShare(rank, total)}</span>
        </div>
      </div>
      {disc != null && (
        <div className="subtle gemline">
          <span className={disc > 0 ? 'discount' : ''}>
            {disc > 0 ? `${disc.toFixed(0)}% under` : `${(-disc).toFixed(0)}% over`}
          </span>{' '}
          the fair price for what it offers
        </div>
      )}
      {why.length > 0 && (
        <ul className="why">
          {why.map((w) => (
            <li key={w.dim} className={w.kind}>
              <span aria-hidden>{w.kind === 'strength' ? '✓' : '!'}</span> {w.text}
            </li>
          ))}
        </ul>
      )}
      {children}
      <Highlights town={t} max={3} />
    </li>
  );
}
