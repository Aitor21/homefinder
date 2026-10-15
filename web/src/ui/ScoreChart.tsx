import type { Breakdown } from '../scoring';
import type { Weights } from '../types';
import { DIM_LABEL } from './labels';

interface Props {
  breakdown: Breakdown;
  weights: Weights;
  /** Dimensions a near miss is held back by, drawn in red. */
  weak?: ReadonlySet<keyof Breakdown>;
}

const tone = (v: number) => (v >= 0.66 ? 'hi' : v >= 0.33 ? 'mid' : 'lo');

/**
 * Where the score comes from. The old panel listed all twenty dimensions in a
 * fixed order at equal size, including the ones weighted zero that count for
 * nothing, so the eye went to whatever happened to be first. This shows only
 * what counts, heaviest first, with the weight drawn as the row's thickness of
 * dots, and names what was left out and why in one line underneath.
 */
export default function ScoreChart({ breakdown, weights, weak }: Props) {
  const keys = Object.keys(breakdown) as Array<keyof Breakdown>;
  const counted = keys
    .filter((k) => (weights[k] ?? 0) > 0 && breakdown[k] != null)
    .sort((a, b) => (weights[b] ?? 0) - (weights[a] ?? 0) || (breakdown[b] ?? 0) - (breakdown[a] ?? 0));
  const unweighted = keys.filter((k) => (weights[k] ?? 0) === 0);
  // "Like my picks" is not missing data: it is waiting for three liked places.
  const waiting = (weights.affinity ?? 0) > 0 && breakdown.affinity == null;
  const unmeasured = keys.filter((k) => k !== 'affinity' && (weights[k] ?? 0) > 0 && breakdown[k] == null);
  const wsum = counted.reduce((a, k) => a + (weights[k] ?? 0), 0) || 1;
  return (
    <div className="schart">
      {counted.map((k) => {
        const v = breakdown[k]!;
        const w = weights[k] ?? 0;
        return (
          <div key={k} className={weak?.has(k) ? 'srow weak' : 'srow'} title={`Weight ${w} of 10: ${Math.round((100 * w) / wsum)}% of the score`}>
            <span className="slbl">{DIM_LABEL[k]}</span>
            <span className="sw" aria-label={`weight ${w}`}>
              {Array.from({ length: 5 }, (_, i) => (
                <i key={i} className={w >= (i + 1) * 2 ? 'on' : w >= i * 2 + 1 ? 'half' : ''} />
              ))}
            </span>
            <span className="sbar">
              <i className={tone(v)} style={{ width: `${Math.max(2, Math.min(100, v * 100))}%` }} />
            </span>
            <span className="snum">{Math.round(v * 100)}</span>
          </div>
        );
      })}
      {(unweighted.length > 0 || unmeasured.length > 0 || waiting) && (
        <div className="hint snote">
          {waiting && <>Like my picks starts counting once you have liked three places. </>}
          {unmeasured.length > 0 && (
            <>Not measured here, so left out rather than guessed: {unmeasured.map((k) => DIM_LABEL[k].toLowerCase()).join(', ')}. </>
          )}
          {unweighted.length > 0 && (
            <>Not counted, weight zero: {unweighted.map((k) => DIM_LABEL[k].toLowerCase()).join(', ')}.</>
          )}
        </div>
      )}
    </div>
  );
}
