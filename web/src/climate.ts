/**
 * Derived climate measures, computed in the browser from the monthly normals
 * the pipeline already ships. No pipeline rerun needed to add one of these.
 */
import type { Town } from './types';

const DAYS_IN_MONTH = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Base temperature for cooling degree days, in C. */
const CDD_BASE = 21;

/**
 * Cooling degree days: how much heat has to be removed from a building over a
 * year. This is the number that matters when you work from home, because it
 * measures the *whole season's* burden rather than the peak. A place can have a
 * mild worst-day and still be exhausting for four months.
 *
 * Computed from monthly means, which understates the true value a little (daily
 * swings push some days over the base even when the month's mean sits under it).
 * That is why it is only ever presented as an index against a reference city --
 * the bias is in both numbers and cancels.
 */
export function coolingDegreeDays(t: Town, base = CDD_BASE): number {
  if (!t.monthlyTmax?.length || !t.monthlyTmin?.length) return 0;
  let cdd = 0;
  for (let m = 0; m < 12; m++) {
    const mean = (t.monthlyTmax[m] + t.monthlyTmin[m]) / 2;
    if (mean > base) cdd += (mean - base) * DAYS_IN_MONTH[m];
  }
  return cdd;
}

/**
 * Cooling need as a percentage of a reference city's. Bilbao against Madrid
 * lands near 20, i.e. about a fifth of the air conditioning.
 */
export function acIndexVs(t: Town, ref: Town | null): number | null {
  if (!ref) return null;
  const r = coolingDegreeDays(ref);
  if (r <= 0) return null;
  return (coolingDegreeDays(t) / r) * 100;
}

/** Months whose mean daily high reaches `threshold` -- the length of the hot season. */
export function hotMonths(t: Town, threshold = 26): number {
  if (!t.monthlyTmax?.length) return 0;
  return t.monthlyTmax.filter((v) => v >= threshold).length;
}

/** Months that sit in the range most people call pleasant. */
export function comfortMonths(t: Town, lo = 15, hi = 26): number {
  if (!t.monthlyTmax?.length) return 0;
  return t.monthlyTmax.filter((v) => v >= lo && v <= hi).length;
}

export interface Comparison {
  daysOver30: number;
  tropicalNights: number;
  hottestTmax: number;
  acPct: number | null;
}

/** How much better (positive) or worse (negative) `t` is than `ref`. */
export function improvementOver(t: Town, ref: Town | null): Comparison | null {
  if (!ref) return null;
  return {
    daysOver30: ref.daysOver30 - t.daysOver30,
    tropicalNights: ref.tropicalNights - t.tropicalNights,
    hottestTmax: ref.hottestTmax - t.hottestTmax,
    acPct: acIndexVs(t, ref),
  };
}
