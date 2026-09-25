/**
 * Near misses: places that would be among your best if you forgave one or two
 * things.
 *
 * Filters are blunt. A town that is right in every respect but sits two hours
 * from an airport, when you asked for forty-five minutes, simply vanishes, and
 * nothing tells you it was there. The same happens more quietly inside the
 * score: one terrible dimension drags an excellent place down to the middle of
 * the list, where nobody scrolls. For someone who might happily trade a long
 * airport run for everything else being perfect, those are exactly the places
 * worth seeing.
 *
 * So a near miss is a place that:
 *
 *   * fails at most two filters, and only threshold filters. WHERE you will
 *     live (the countries, continents and regions you picked, whether you can
 *     buy, visas, pet quarantine) is never forgiven: a town outside the
 *     countries you chose is not nearly inside them.
 *   * or passes every filter, but is so remote on one or two counts (airports,
 *     city, services) that they are not even close (below WEAK on 0..1).
 *   * and, with those one or two things set aside, would score at least as
 *     well as your tenth-best result.
 *
 * Two constraints are treated as more than thresholds, because they are the
 * reason most people use this at all. Budget is forgiven only up to 25% over:
 * twice the budget is not a near miss, it is a different search. And summer
 * filters are forgiven only when just over the line, and even then the summer
 * target keeps scoring, so a scorching city cannot pass itself off as a near
 * miss by being cheap and well connected.
 */
import type { Town, Filters, Weights } from './types';
import {
  airportDriveMin, breakdown, failures, hubDriveMin, transitKm, weightedScore,
  type Breakdown, type Failure, type FailKey, type FilterEnv, type HeldBack,
  type Ranked, type ScoreContext,
} from './scoring';

/** At most this many things forgiven per place: "one or two", no more. */
export const MAX_FORGIVE = 2;
/** A dimension below this is not even close. */
export const WEAK = 0.25;
/** Weights below this are preferences held too lightly to count as a flaw. */
const MIN_WEIGHT = 2;
/** For a place that already passes, forgiving must be worth at least this. */
const MIN_GAIN = 4;
/** Near misses must reach the score of your N-th best result. */
export const TOP = 10;
const LIMIT = 300;

const CLIMATE: ReadonlySet<FailKey> = new Set(['hotDays', 'warmNights', 'hotMax', 'hotMin', 'winterMin']);

/**
 * Dimensions that can be set aside for being weak: the ones that measure how
 * REMOTE a place is. Airports, the nearest city, everyday services.
 *
 * That is the trade a near miss is about. "Perfect, but two hours from a
 * runway" is a choice someone might happily make. The first version forgave any
 * weak dimension, and on real data the list filled with places that are not
 * near misses at all: Bay Area suburbs forgiven for a cost of living scoring
 * 3/100, Paris suburbs for having neither mountains nor sea, a town forgiven
 * for 2/100 broadband that no remote worker could live with. Character (sea,
 * mountains, nature, climate), money and connectivity are what a place IS, and
 * they stay in the score.
 */
const FORGIVABLE: Array<keyof Breakdown> = ['airport', 'city', 'amenities'];

/** Whether this failure is the kind a near miss may have. */
export function forgivable(x: Failure): boolean {
  if (!x.relaxable) return false;
  if (x.key === 'budget') return x.miss <= 0.25;
  if (CLIMATE.has(x.key)) return x.miss <= 0.5;
  return true;
}

/** "close" when a small nudge would bring it in, "far" when it is not even close. */
export function severity(x: Failure): 'close' | 'far' {
  return x.miss <= 0.25 ? 'close' : 'far';
}

function weakest(
  b: Breakdown, w: Weights, skip: ReadonlySet<keyof Breakdown>, n: number,
): Array<{ key: keyof Breakdown; value: number }> {
  const out: Array<{ key: keyof Breakdown; value: number; damage: number }> = [];
  for (const k of FORGIVABLE) {
    const v = b[k];
    const wt = w[k] ?? 0;
    if (v == null || skip.has(k) || wt < MIN_WEIGHT || v >= WEAK) continue;
    out.push({ key: k, value: v, damage: wt * (1 - v) });
  }
  out.sort((a, c) => c.damage - a.damage);
  return out.slice(0, n).map(({ key, value }) => ({ key, value }));
}

/**
 * Near misses, best first. `ranked` is the ordinary ranking of places that
 * pass every filter, already sorted; its tenth score is the bar to clear.
 */
export function nearMisses(
  towns: Town[], ranked: Ranked[], f: Filters, w: Weights, ctx: ScoreContext,
  env: FilterEnv = {},
): Ranked[] {
  const bar = ranked.length ? ranked[Math.min(TOP, ranked.length) - 1].score : 0;
  const passing = new Set(ranked.map((r) => r.town.id));
  const out: Ranked[] = [];

  // Places a filter keeps out.
  for (const t of towns) {
    if (passing.has(t.id)) continue;
    const fails = failures(t, f, env);
    if (!fails.length || fails.length > MAX_FORGIVE || !fails.every(forgivable)) continue;
    const b = breakdown(t, f, ctx);
    const skip = new Set<keyof Breakdown>();
    // A climate filter forgives the line, not the summer: the target still scores.
    for (const x of fails) if (x.dim && !CLIMATE.has(x.key)) skip.add(x.dim);
    const held: HeldBack[] = fails.map((failure) => ({ failure }));
    for (const d of weakest(b, w, skip, MAX_FORGIVE - fails.length)) {
      skip.add(d.key);
      held.push({ dim: d.key, value: d.value });
    }
    const forgiven = weightedScore(b, w, skip);
    if (forgiven < bar) continue;
    out.push({ town: t, score: weightedScore(b, w), breakdown: b, forgiven, held });
  }

  // Places that pass, but sit below the bar because of one or two dimensions.
  for (const r of ranked) {
    if (r.score >= bar) continue; // already among the best: nothing held it back
    const weak = weakest(r.breakdown, w, new Set(), MAX_FORGIVE);
    if (!weak.length) continue;
    const forgiven = weightedScore(r.breakdown, w, new Set(weak.map((d) => d.key)));
    if (forgiven < bar || forgiven - r.score < MIN_GAIN) continue;
    out.push({ ...r, forgiven, held: weak.map((d) => ({ dim: d.key, value: d.value })) });
  }

  out.sort((a, b) => (b.forgiven ?? 0) - (a.forgiven ?? 0));
  return out.slice(0, LIMIT);
}

/**
 * The smallest change to one filter that would let this town through it.
 *
 * Offered as a button on a near miss, because "relax the airport limit" is a
 * decision people want to make about a specific place, and working out which
 * slider and to what value is busywork. Rounded outward to the slider's step so
 * the town really does pass afterwards. Returns null for anything that cannot
 * be relaxed by moving a number.
 */
export function relaxFor(x: Failure, t: Town, f: Filters, env: FilterEnv = {}): Partial<Filters> | null {
  const up = (v: number, step: number) => Math.ceil(v / step - 1e-9) * step;
  const down = (v: number, step: number) => Math.floor(v / step + 1e-9) * step;
  switch (x.key) {
    case 'budget': return { budget: up(t.eurM2 * f.minM2, 10_000) };
    case 'hotDays': return { maxDaysOver30: up(t.daysOver30, 1) };
    case 'warmNights': return { maxTropicalNights: up(t.tropicalNights, 1) };
    case 'hotMax': return { maxHotTmax: up(t.hottestTmax, 1) };
    case 'hotMin': return { minHotTmax: down(t.hottestTmax, 1) };
    case 'winterMin': return { minWinterTmin: down(t.winterTmin, 1) };
    case 'airport': {
      const m = airportDriveMin(t);
      return m == null ? null : { maxAirportMin: up(m, 5) };
    }
    case 'hub': {
      const m = hubDriveMin(t);
      return m == null ? null : { maxHubMin: up(m, 5) };
    }
    case 'city': return { maxCityKm: up(t.city100kKm, 5) };
    case 'transit': {
      const d = transitKm(t);
      return { maxTransitKm: d == null ? null : up(d, 1) };
    }
    case 'train': return { maxTrainKm: t.trainKm == null ? null : up(t.trainKm, 1) };
    case 'net': return t.netDownMbps == null ? null : { minNetMbps: down(t.netDownMbps, 5) };
    case 'air': return t.pm25 == null ? null : { maxPm25: up(t.pm25, 1) };
    case 'cost': return t.costIndex == null ? null : { maxCostIndex: up(t.costIndex, 5) };
    case 'popMin': return { minPop: down(t.pop, 500) };
    case 'popMax': return { maxPop: up(t.pop, 5_000) };
    case 'tz': {
      const g = env.tzGap?.(t);
      return g == null ? null : { maxTzDiff: up(g, 1) };
    }
    case 'daylight': {
      const h = env.winterDaylight?.(t);
      return h == null ? null : { minWinterDaylight: down(h, 0.5) };
    }
    case 'homeFlight': {
      const h = env.homeFlightH?.(t);
      return h == null ? null : { maxHomeFlightH: up(h, 1) };
    }
    case 'homicide': return t.homicideRate == null ? null : { maxHomicide: up(t.homicideRate, 1) };
    default: return null;
  }
}

/** Where a forgiven score would land in the ordinary ranking, 1-based. */
export function wouldRank(ranked: Ranked[], forgiven: number): number {
  let lo = 0;
  let hi = ranked.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ranked[mid].score > forgiven) lo = mid + 1;
    else hi = mid;
  }
  return lo + 1;
}
