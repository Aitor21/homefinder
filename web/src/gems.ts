/**
 * Gem-finding by residual analysis.
 *
 * Regress what a town COSTS against what a town OFFERS, then look for the ones
 * sitting furthest below the line. Those are places whose price has not caught
 * up with their quality of life.
 *
 * The feature set deliberately excludes province, local income and employment.
 * That is the whole point: for someone earning externally, a depressed local
 * labour market is not a defect to be priced in, it is the source of the
 * discount. Including a province term would regress that signal away and the
 * model would only ever find gems *within* a province -- which is precisely the
 * comparison this tool exists to avoid.
 *
 * IMPORTANT CAVEAT, surfaced in the UI: the model is fitted only on towns with
 * an officially *observed* price -- roughly 300 Spanish municipalities above
 * 25,000 inhabitants, the only places in Europe where this project has a
 * measured number to learn from. Applied to a town whose price was itself
 * modelled, the residual is really a statement about that province being cheap
 * rather than about that town specifically. Honest, but weaker.
 *
 * Outside Spain there is no gem score at all. Those prices are derived from a
 * national average, so a residual against them would be measuring this project's
 * own assumptions rather than the market. Returning null is the truthful answer.
 */
import type { Town } from './types';
import { summerComfort, airportAccess, cityAccess, amenityScore, coastScore, mountainScore } from './scoring';

/**
 * Solve (X'X + lambda*I) b = X'y by Gaussian elimination with partial pivoting.
 *
 * The ridge term is tiny and scaled to the problem, so it barely moves a
 * well-conditioned fit. Its job is to keep the solve defined when two features
 * happen to be collinear over the current set of towns -- which does occur, e.g.
 * when every candidate is coastal, making coastScore constant. Without it the
 * whole gems view would blank out instead of degrading gracefully.
 */
const RIDGE = 1e-6;

function ols(X: number[][], y: number[]): number[] | null {
  const n = X.length;
  const p = X[0]?.length ?? 0;
  if (n <= p) return null;

  const A: number[][] = Array.from({ length: p }, () => new Array(p + 1).fill(0));
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += X[k][i] * X[k][j];
      A[i][j] = s;
    }
    let s = 0;
    for (let k = 0; k < n; k++) s += X[k][i] * y[k];
    A[i][p] = s;
  }

  // Scale-aware ridge, skipping the intercept so the mean stays unbiased.
  let trace = 0;
  for (let i = 0; i < p; i++) trace += A[i][i];
  const lambda = (RIDGE * trace) / p;
  for (let i = 1; i < p; i++) A[i][i] += lambda;

  for (let col = 0; col < p; col++) {
    let piv = col;
    for (let r = col + 1; r < p; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-12) return null;
    [A[col], A[piv]] = [A[piv], A[col]];
    for (let r = 0; r < p; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      for (let ccc = col; ccc <= p; ccc++) A[r][ccc] -= f * A[col][ccc];
    }
  }
  return A.map((row, i) => row[p] / A[i][i]);
}

function features(t: Town): number[] {
  return [
    1,
    summerComfort(t),
    airportAccess(t),
    cityAccess(t),
    amenityScore(t) ?? 0.5,
    coastScore(t),
    mountainScore(t),
    Math.log10(Math.max(t.pop, 100)),
  ];
}

export interface GemModel {
  /** place id -> how far below its predicted price the town sits, in log units. */
  gem: Map<string, number>;
  /** place id -> the price the model expected, eur/m2. */
  predicted: Map<string, number>;
  r2: number;
  fittedOn: number;
  ok: boolean;
}

export function fitGems(towns: Town[]): GemModel {
  const train = towns.filter((t) => t.priceSource === 'observed' && t.eurM2 > 0);
  const gem = new Map<string, number>();
  const predicted = new Map<string, number>();

  const X = train.map(features);
  const y = train.map((t) => Math.log(t.eurM2));
  const beta = ols(X, y);
  if (!beta) return { gem, predicted, r2: 0, fittedOn: 0, ok: false };

  const fit = (t: Town) => features(t).reduce((s, v, i) => s + v * beta[i], 0);

  let ssRes = 0;
  let ssTot = 0;
  const mean = y.reduce((a, b) => a + b, 0) / y.length;
  for (let i = 0; i < train.length; i++) {
    const e = y[i] - fit(train[i]);
    ssRes += e * e;
    ssTot += (y[i] - mean) ** 2;
  }

  for (const t of towns) {
    // A country-tier price is our own national average pushed through a model.
    // Scoring it against another model would be circular, so it gets no gem.
    if (t.priceSource === 'country') continue;
    const yhat = fit(t);
    predicted.set(t.id, Math.exp(yhat));
    // Positive = cheaper than the model expects = more of a gem.
    gem.set(t.id, yhat - Math.log(Math.max(t.eurM2, 1)));
  }

  return {
    gem,
    predicted,
    r2: ssTot > 0 ? 1 - ssRes / ssTot : 0,
    fittedOn: train.length,
    ok: true,
  };
}

/** Percentage below the modelled fair price, for display. */
export function discountPct(model: GemModel, t: Town): number | null {
  const p = model.predicted.get(t.id);
  if (!p || !t.eurM2) return null;
  return (1 - t.eurM2 / p) * 100;
}
