/**
 * Learning what you like from the places you have picked.
 *
 * The weight sliders assume you can articulate your own preferences as numbers.
 * Most people cannot, but everyone can name places they would live in. This
 * reads a list of those places and works out what they have in common that the
 * rest of the world does not, then scores every candidate on that.
 *
 * Method, and why it is built this way:
 *
 * Every feature is converted to a PERCENTILE RANK within the whole dataset
 * rather than used raw. Population, price and relief are all heavily skewed, so
 * a mean and a standard deviation would be dominated by outliers; a percentile
 * is scale free and robust, and it makes "coastal" and "expensive" directly
 * comparable without inventing units.
 *
 * A feature then matters to you if your picks are BOTH:
 *
 *   distinctive  their median percentile sits far from 0.5, so they are unusual
 *                in this respect rather than merely typical, and
 *   consistent   they cluster tightly, so it looks deliberate rather than
 *                coincidental.
 *
 * Importance is the product. Picking five coastal towns of wildly different
 * sizes says you care about the coast and not about size, and the product says
 * exactly that: coast scores high on both terms, size scores near zero on
 * consistency and drops out.
 *
 * One pick teaches nothing, because a single place has no spread to measure. The
 * model needs at least MIN_PICKS before it will claim to have learned anything.
 */
import type { Town } from './types';
import { hubDriveMin, transitKm } from './scoring';

export const MIN_PICKS = 3;

export type FeatureGroup = 'climate' | 'geography' | 'access' | 'services' | 'cost';

export interface Feature {
  key: string;
  label: string;
  group: FeatureGroup;
  get: (t: Town) => number | null;
  /** How to describe a high percentile, and a low one. */
  high: string;
  low: string;
  /** Render a raw value for the explanation. */
  fmt: (v: number) => string;
}

const km = (v: number) => `${Math.round(v)} km`;
const c = (v: number) => `${v.toFixed(1)} °C`;
const d = (v: number) => `${Math.round(v)}/yr`;

export const FEATURES: Feature[] = [
  { key: 'hottestTmax', label: 'summer heat', group: 'climate', get: (t) => t.hottestTmax,
    high: 'hot summers', low: 'cool summers', fmt: c },
  { key: 'tropicalNights', label: 'warm nights', group: 'climate', get: (t) => t.tropicalNights,
    high: 'warm nights', low: 'cool nights', fmt: d },
  { key: 'winterTmin', label: 'winter cold', group: 'climate', get: (t) => t.winterTmin,
    high: 'mild winters', low: 'cold winters', fmt: c },
  { key: 'annualRain', label: 'rainfall', group: 'climate', get: (t) => t.annualRain,
    high: 'wet', low: 'dry', fmt: (v) => `${Math.round(v)} mm` },
  { key: 'solarAnnual', label: 'sunshine', group: 'climate', get: (t) => t.solarAnnual,
    high: 'sunny', low: 'overcast', fmt: (v) => `${Math.round(v / 1000)}k kJ/m²` },
  { key: 'coastKm', label: 'the coast', group: 'geography', get: (t) => t.coastKm,
    high: 'far inland', low: 'near the coast', fmt: km },
  { key: 'relief25km', label: 'mountains', group: 'geography', get: (t) => t.relief25km,
    high: 'mountainous', low: 'flat', fmt: (v) => `${Math.round(v)} m of relief` },
  { key: 'elev', label: 'altitude', group: 'geography', get: (t) => t.elev,
    high: 'high up', low: 'near sea level', fmt: (v) => `${Math.round(v)} m` },
  { key: 'hubMin', label: 'airport access', group: 'access', get: (t) => hubDriveMin(t),
    high: 'far from an airport', low: 'close to an airport',
    fmt: (v) => `${Math.round(v)} min` },
  { key: 'city100kKm', label: 'city access', group: 'access', get: (t) => t.city100kKm,
    high: 'remote from cities', low: 'close to a city', fmt: km },
  { key: 'transitKm', label: 'public transport', group: 'access', get: (t) => transitKm(t),
    high: 'car country', low: 'walkable to transport', fmt: km },
  { key: 'pop', label: 'town size', group: 'services', get: (t) => t.pop,
    high: 'large towns', low: 'small towns',
    fmt: (v) => Math.round(v).toLocaleString() },
  { key: 'netDownMbps', label: 'broadband', group: 'services',
    get: (t) => (t.netTests >= 20 ? t.netDownMbps : null),
    high: 'fast broadband', low: 'slow broadband', fmt: (v) => `${Math.round(v)} Mbps` },
  { key: 'eurM2', label: 'property price', group: 'cost', get: (t) => t.eurM2,
    high: 'expensive property', low: 'cheap property',
    fmt: (v) => `€${Math.round(v).toLocaleString()}/m²` },
  { key: 'costIndex', label: 'cost of living', group: 'cost', get: (t) => t.costIndex,
    high: 'expensive to live in', low: 'cheap to live in', fmt: (v) => String(Math.round(v)) },
  { key: 'pm25', label: 'air quality', group: 'cost', get: (t) => t.pm25,
    high: 'polluted air', low: 'clean air', fmt: (v) => `${v.toFixed(1)} µg/m³` },
];

/** Sorted population values per feature, for percentile lookup. */
export interface Distribution {
  sorted: Map<string, Float64Array>;
}

export function buildDistribution(towns: Town[]): Distribution {
  const sorted = new Map<string, Float64Array>();
  for (const f of FEATURES) {
    const vals: number[] = [];
    for (const t of towns) {
      const v = f.get(t);
      if (v != null && Number.isFinite(v)) vals.push(v);
    }
    vals.sort((a, b) => a - b);
    sorted.set(f.key, Float64Array.from(vals));
  }
  return { sorted };
}

/** Where a value sits in the population, 0..1. */
export function percentile(dist: Distribution, key: string, v: number | null): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const arr = dist.sorted.get(key);
  if (!arr || arr.length === 0) return null;
  // Mid-rank of the tied block, not its lower bound. With the lower bound a
  // feature that is CONSTANT across the dataset gives every town percentile 0,
  // which then reads as maximally distinctive and dominates the model. Ties
  // resolved at their midpoint give 0.5, i.e. no information, which is right.
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  let up = lo;
  while (up < arr.length && arr[up] === v) up++;
  return (lo + up) / 2 / arr.length;
}

function quantile(xs: number[], q: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
}

export interface LearnedFeature {
  feature: Feature;
  /** Median percentile of the picks, 0..1. */
  target: number;
  /** How far from typical, 0..1. */
  distinctive: number;
  /** How tightly the picks agree, 0..1. */
  consistent: number;
  /** distinctive x consistent. */
  importance: number;
  /** Median raw value across the picks, for display. */
  median: number;
  /** Median raw value across the whole dataset. */
  typical: number;
  /** Which phrasing applies. */
  phrase: string;
}

export interface Affinity {
  ok: boolean;
  picks: number;
  learned: LearnedFeature[];
}

/** Work out what a set of liked places has in common. */
export function learnAffinity(picks: Town[], dist: Distribution, towns: Town[]): Affinity {
  if (picks.length < MIN_PICKS) return { ok: false, picks: picks.length, learned: [] };

  const learned: LearnedFeature[] = [];
  for (const f of FEATURES) {
    const pcts: number[] = [];
    const raws: number[] = [];
    for (const p of picks) {
      const v = f.get(p);
      const pc = percentile(dist, f.key, v);
      if (pc != null && v != null) {
        pcts.push(pc);
        raws.push(v);
      }
    }
    // Need most of the picks to carry the feature before drawing conclusions.
    if (pcts.length < Math.max(MIN_PICKS, Math.ceil(picks.length * 0.6))) continue;

    const target = quantile(pcts, 0.5);
    // Distance from the middle of the pack, scaled to 0..1.
    const distinctive = Math.min(1, Math.abs(target - 0.5) * 2);
    // A tight cluster of percentiles means the agreement is deliberate. The
    // expected spread of n random picks is about 1/(n+1) per gap, so compare
    // against a uniform sample rather than against zero.
    const spread = quantile(pcts, 0.75) - quantile(pcts, 0.25);
    const consistent = Math.max(0, 1 - spread / 0.5);

    const arr = dist.sorted.get(f.key)!;
    learned.push({
      feature: f,
      target,
      distinctive,
      consistent,
      importance: distinctive * consistent,
      median: quantile(raws, 0.5),
      typical: arr.length ? arr[Math.floor(arr.length / 2)] : 0,
      phrase: target >= 0.5 ? f.high : f.low,
    });
  }

  learned.sort((a, b) => b.importance - a.importance);
  return { ok: learned.length > 0, picks: picks.length, learned };
}

/**
 * How well a candidate fits the learned taste, 0..1.
 * Features the picks disagreed about barely count, which is the point.
 */
export function affinityScore(t: Town, aff: Affinity, dist: Distribution): number | null {
  if (!aff.ok) return null;
  let sum = 0;
  let wsum = 0;
  for (const L of aff.learned) {
    if (L.importance < 0.02) continue;
    const pc = percentile(dist, L.feature.key, L.feature.get(t));
    if (pc == null) continue;
    sum += L.importance * Math.abs(pc - L.target);
    wsum += L.importance;
  }
  if (wsum === 0) return null;
  // Mean absolute percentile gap of 0.5 is as wrong as it gets in practice.
  return Math.max(0, 1 - (sum / wsum) / 0.5);
}

/** Plain-English account of what was learned, strongest signals first. */
export function explain(aff: Affinity, limit = 6): string[] {
  if (!aff.ok) {
    return [
      `Pick at least ${MIN_PICKS} places you would live in and this will work out what they have in common.`,
    ];
  }
  const out: string[] = [];
  for (const L of aff.learned.slice(0, limit)) {
    if (L.importance < 0.12) break;
    out.push(
      `${L.phrase}: your picks average ${L.feature.fmt(L.median)}, against ` +
        `${L.feature.fmt(L.typical)} typical.`,
    );
  }
  const ignored = aff.learned
    .filter((L) => L.importance < 0.06)
    .slice(0, 4)
    .map((L) => L.feature.label);
  if (ignored.length) {
    out.push(`Your picks vary too much on ${ignored.join(', ')} for it to look deliberate, so it is weighted down.`);
  }
  return out;
}
