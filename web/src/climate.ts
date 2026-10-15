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

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The daily high that matters for this search: the hottest month's for
 * someone living there year-round, the mean over the months of a visit for
 * someone who is not. Someone going to Seville in November is not asking
 * about August.
 */
export function weatherHigh(t: Town, months: readonly number[]): number {
  if (!months.length || t.monthlyTmax?.length !== 12) return t.hottestTmax;
  let s = 0;
  for (const m of months) s += t.monthlyTmax[m];
  return s / months.length;
}

/** Mean night-time low over the months of a visit, or the winter low year-round. */
export function weatherLow(t: Town, months: readonly number[]): number {
  if (!months.length || t.monthlyTmin?.length !== 12) return t.winterTmin;
  let s = 0;
  for (const m of months) s += t.monthlyTmin[m];
  return s / months.length;
}

/** Mean monthly rain over the months of a visit, in mm, or null year-round. */
export function rainIn(t: Town, months: readonly number[]): number | null {
  if (!months.length || t.monthlyPrec?.length !== 12) return null;
  let s = 0;
  for (const m of months) s += t.monthlyPrec[m];
  return s / months.length;
}

/** "Oct", "Oct–Nov", "Jul, Dec": the months of a visit, for display. */
export function monthLabel(months: readonly number[]): string {
  if (!months.length) return 'year-round';
  const s = [...months].sort((a, b) => a - b);
  if (s.length === 1) return MONTHS[s[0]];
  const run = s.every((m, i) => i === 0 || m === s[i - 1] + 1);
  return run ? `${MONTHS[s[0]]}–${MONTHS[s[s.length - 1]]}` : s.map((m) => MONTHS[m]).join(', ');
}
