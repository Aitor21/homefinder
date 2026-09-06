/**
 * The scoring model. Pure functions, no I/O, unit-tested in scoring.test.ts.
 *
 * Two things worth understanding before changing any of this:
 *
 * 1. Summer discomfort is dominated by NIGHTS, not days. A place that hits 32
 *    but cools to 16 is fine; a place that peaks at 31 and never drops below 22
 *    is not. Hence tropicalNights carries nearly as much weight as daysOver30,
 *    and `humidHeat` (which folds in vapour pressure) carries its own share.
 *
 * 2. Nothing here rewards a strong local economy, and that is deliberate. This
 *    tool is for someone with external income, so a weak local labour market is
 *    a discount to capture rather than a defect to avoid. See gems.ts.
 */
import type { Town, Filters, Weights } from './types';
import { POP_ANY } from './types';
import { driveMinutes } from './travel';
import { affinityScore, type Affinity, type Distribution } from './affinity';

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Map v from [lo,hi] onto [0,1]; higher input -> higher output. */
export const norm = (v: number, lo: number, hi: number) => clamp((v - lo) / (hi - lo), 0, 1);

/** Map v from [lo,hi] onto [1,0]; higher input -> lower output. */
export const inv = (v: number, lo: number, hi: number) => 1 - norm(v, lo, hi);

/** How many square metres the budget buys here. */
export const affordableM2 = (t: Town, budget: number) => budget / t.eurM2;

/** Cheapest total price for a home of `m2` square metres. */
export const priceFor = (t: Town, m2: number) => t.eurM2 * m2;

/**
 * Absolute summer coolness, 0..1. Retained because the gem model needs a proxy
 * for what the MARKET treats as desirable, which in Spain does track coolness.
 * It is deliberately NOT what the user is scored on: see summerFit.
 */
export function summerComfort(t: Town): number {
  const days = inv(t.daysOver30, 0, 100);
  const nights = inv(t.tropicalNights, 0, 75);
  const peak = inv(t.hottestTmax, 22, 38);
  const humid = inv(t.appDaysOver32, 0, 90);
  return 0.32 * days + 0.3 * nights + 0.21 * peak + 0.17 * humid;
}

/** The climate dimensions used for "find me somewhere like X". */
const MATCH_DIMS: Array<[keyof Town, number, number, number]> = [
  // field, lo, hi, weight
  ['hottestTmax', 18, 38, 1.0],
  ['hottestTmin', 8, 24, 1.0],
  ['winterTmin', -4, 14, 0.6],
  ['daysOver30', 0, 120, 0.9],
  ['tropicalNights', 0, 90, 0.9],
  ['annualRain', 200, 2000, 0.5],
];

/** 0..1 similarity of `t` to a single reference across the dimensions above. */
export function climateMatchOne(t: Town, ref: Town): number {
  let sum = 0;
  let wsum = 0;
  for (const [k, lo, hi, w] of MATCH_DIMS) {
    const a = norm(Number(t[k]), lo, hi);
    const b = norm(Number(ref[k]), lo, hi);
    sum += w * Math.abs(a - b);
    wsum += w;
  }
  return 1 - sum / wsum;
}

/**
 * Similarity to the CLOSEST of the places you like, not to their average.
 * Someone who loves both Bilbao and Sapporo is not asking for the midpoint
 * between them -- averaging two references describes a climate that may not
 * exist anywhere.
 */
export function climateMatch(t: Town, refs: Town[]): number {
  if (!refs.length) return 0.5;
  let best = 0;
  for (const r of refs) best = Math.max(best, climateMatchOne(t, r));
  return best;
}

/** Which favourite a place resembles most, for display. */
export function bestMatch(t: Town, refs: Town[]): { town: Town; score: number } | null {
  let best: { town: Town; score: number } | null = null;
  for (const r of refs) {
    const sc = climateMatchOne(t, r);
    if (!best || sc > best.score) best = { town: r, score: sc };
  }
  return best;
}

/** Drive time to the nearest airport / nearest well-connected hub, in minutes. */
export const airportDriveMin = (t: Town) => driveMinutes(t.airportKm, t.relief25km);
export const hubDriveMin = (t: Town) => driveMinutes(t.hubKm, t.relief25km);

/**
 * Everyday services: can you live here without driving for an hour?
 *
 * Returns null where the layer was never surveyed. That is not the same as
 * scoring zero -- a town must never be marked down for data we did not collect.
 * `score()` drops null dimensions and renormalises the remaining weights.
 */
/**
 * Services within reach, from whichever layers were actually surveyed here.
 *
 * The two layers have different footprints and it matters: shops, health and
 * schools are Spain only, rail covers Europe and much of Asia. Bailing out on
 * `amenitiesSurveyed` alone meant 15,808 places had real, measured rail access
 * that the model then refused to look at, which is the same sin as inventing
 * data, just in the other direction.
 *
 * Each part contributes only where it was measured and the weights renormalise,
 * so a Romanian town is judged on its station and never marked down for the
 * Spanish supermarket layer nobody ran there.
 */
/**
 * Distance to public transport of any kind, in km, or null where none of the
 * layers were surveyed. Takes the nearest of mainline rail, urban rail and
 * coach terminal, because the question is whether you can leave without a car,
 * not which mode does it.
 */
export function transitKm(t: Town): number | null {
  if (t.transitSurveyed === false) return null;
  const ds = [t.trainKm, t.metroKm, t.busKm].filter(
    (d): d is number => d != null && Number.isFinite(d),
  );
  return ds.length ? Math.min(...ds) : null;
}

export function amenityScore(t: Town): number | null {
  const parts: Array<[number, number]> = [];
  const add = (w: number, v: number | null) => {
    if (v != null && Number.isFinite(v)) parts.push([w, v]);
  };

  if (t.amenitiesSurveyed !== false) {
    add(0.26, t.supermarketKm == null ? null : inv(t.supermarketKm, 0, 20));
    add(0.16, t.supermarket5km == null ? null : norm(t.supermarket5km, 0, 8));
    add(0.2, t.pharmacyKm == null ? null : inv(t.pharmacyKm, 0, 15));
    add(0.18, t.hospitalKm == null ? null : inv(t.hospitalKm, 0, 45));
  }
  if (t.transitSurveyed !== false) {
    // Mainline rail is about reaching other cities, so it is generous about
    // distance. Urban rail is about daily life without a car, so it is not:
    // a metro 20 km away does nothing for you.
    add(0.13, t.trainKm == null ? 0 : inv(t.trainKm, 0, 45));
    add(0.07, t.metroKm == null ? 0 : inv(t.metroKm, 0, 8));
  }

  if (!parts.length) return null;
  const wsum = parts.reduce((a, [w]) => a + w, 0);
  return parts.reduce((a, [w, v]) => a + w * v, 0) / wsum;
}

export function airportAccess(t: Town): number {
  // airportScore is a gravity sum; it is heavily skewed, so compress it.
  const gravity = norm(Math.log10(t.airportScore + 1e-4) + 2.2, 0, 1.6);
  // Scored on drive time, between "airport run before breakfast" and "that is
  // a day out". 20 to 150 minutes spans what people actually tolerate.
  const hub = inv(hubDriveMin(t) ?? 240, 20, 150);
  return 0.6 * gravity + 0.4 * hub;
}

export function cityAccess(t: Town): number {
  return 0.65 * inv(t.city100kKm, 0, 110) + 0.35 * inv(t.city50kKm, 0, 60);
}

export function mountainScore(t: Town): number {
  const relief = t.relief25km == null ? 0 : norm(t.relief25km, 200, 1800);
  const high = t.maxElev25km == null ? 0 : norm(t.maxElev25km, 400, 2400);
  return 0.6 * relief + 0.4 * high;
}

/**
 * How close this summer is to the one asked for, measured in both directions.
 *
 * The predecessor, summerComfort, scored cool summers high and sat at the
 * heaviest default weight, so the whole tool quietly assumed you were escaping
 * heat. Somebody who wants 32 C at the peak is not expressing a worse preference,
 * just a different one, and a target with a symmetric penalty says so.
 *
 * Returns null when no target has been set, which drops the dimension from the
 * score rather than substituting an opinion.
 */
export function summerFit(t: Town, target: number | null): number | null {
  if (target == null) return null;
  // 9 C off target is as wrong as it gets in practice: that is roughly the
  // spread between the Atlantic coast and inland Andalusia.
  return 1 - clamp(Math.abs(t.hottestTmax - target) / 9, 0, 1);
}

export function coastScore(t: Town): number {
  return t.coastKm == null ? 0 : inv(t.coastKm, 2, 70);
}

/**
 * Brightness, from solar radiation (kJ/m2/day). Spain spans roughly 11,000 in
 * the wettest Atlantic corners to 19,000 in the southeast, so that is the range
 * worth resolving. Defaults to weight zero -- grey is fine here.
 */
export function sunScore(t: Town): number | null {
  // null, not 0.5. Substituting a middle value is the one habit this model
  // avoids everywhere else: it turns "not measured" into a mediocre score and
  // quietly ranks the place against data nobody collected.
  return t.solarAnnual == null ? null : norm(t.solarAnnual, 11000, 19000);
}

/**
 * Air quality. Scaled between the WHO annual guideline (5 ug/m3) and its first
 * interim target (35), which is roughly the range real inhabited places span.
 */
export function airScore(t: Town): number | null {
  return t.pm25 == null ? null : inv(t.pm25, 5, 35);
}

/**
 * Broadband. 25 Mbps is the floor for video calls that do not embarrass you;
 * past ~250 the difference stops being felt. A thin sample is not scored as a
 * fact -- fewer than 20 tests returns null so the dimension drops out.
 */
export function internetScore(t: Town): number | null {
  if (t.netDownMbps == null || t.netTests < 20) return null;
  return norm(t.netDownMbps, 25, 250);
}

/** Everyday prices, Spain = 100. Cheaper is better. */
export function livingCostScore(t: Town): number | null {
  return t.costIndex == null ? null : inv(t.costIndex, 45, 160);
}

/**
 * Annual heating plus cooling bill. This is the hidden cost of chasing cool
 * summers: Bilbao runs about EUR 450 a year, Berlin about EUR 2,350.
 */
export function energyScore(t: Town): number | null {
  return t.energyEurYear == null ? null : inv(t.energyEurYear, 250, 2500);
}

/**
 * Everything the score needs beyond the town itself. Passed as one object so
 * adding a dimension does not mean threading another argument through every
 * call site.
 */
export interface ScoreContext {
  /** Places the user said they would live in. */
  refs: Town[];
  /** What those places have in common, if enough were given. */
  affinity?: Affinity | null;
  /** Population distributions backing the affinity percentiles. */
  dist?: Distribution | null;
}

export interface Breakdown {
  /** null when no summer preference has been stated. */
  summerFit: number | null;
  affordability: number;
  airport: number;
  city: number;
  /** null when the amenity layer was not surveyed for this place. */
  amenities: number | null;
  mountains: number;
  coast: number;
  winterMild: number;
  drier: number;
  sunny: number | null;
  cleanAir: number | null;
  internet: number | null;
  livingCost: number | null;
  energyBill: number | null;
  affinity: number | null;
}

export function breakdown(t: Town, f: Filters, ctx: ScoreContext): Breakdown {
  return {
    summerFit: summerFit(t, f.summerTarget),
    // 80 m2 is the floor; 200 m2 for the same money is a genuinely different life.
    affordability: norm(affordableM2(t, f.budget), f.minM2, f.minM2 * 2.6),
    airport: airportAccess(t),
    city: cityAccess(t),
    amenities: amenityScore(t),
    mountains: mountainScore(t),
    coast: coastScore(t),
    winterMild: norm(t.winterTmin, -4, 12),
    drier: inv(t.annualRain, 350, 1800),
    sunny: sunScore(t),
    cleanAir: airScore(t),
    internet: internetScore(t),
    livingCost: livingCostScore(t),
    energyBill: energyScore(t),
    affinity:
      ctx.affinity && ctx.dist ? affinityScore(t, ctx.affinity, ctx.dist) : null,
  };
}

/** Weighted 0..100 score. Weights are relative; they are normalised here. */
export function score(t: Town, f: Filters, w: Weights, ctx: ScoreContext): number {
  const b = breakdown(t, f, ctx);
  let total = 0;
  let wsum = 0;
  for (const k of Object.keys(b) as Array<keyof Breakdown>) {
    const v = b[k];
    if (v == null) continue; // not surveyed: drop it and renormalise
    const weight = w[k] ?? 0;
    total += weight * v;
    wsum += weight;
  }
  return wsum === 0 ? 0 : (100 * total) / wsum;
}

/** Hard filters. Returns null if the town passes, or the reason it failed. */
export function rejectReason(t: Town, f: Filters): string | null {
  if (priceFor(t, f.minM2) > f.budget) return 'over budget';
  if (t.daysOver30 > f.maxDaysOver30) return 'too many hot days';
  if (t.tropicalNights > f.maxTropicalNights) return 'too many warm nights';
  if (t.hottestTmax > f.maxHotTmax) return 'hottest month too hot';
  if (t.hottestTmax < f.minHotTmax) return 'hottest month too cool';
  if (t.winterTmin < f.minWinterTmin) return 'winters too cold';
  const air = airportDriveMin(t);
  if (air != null && air > f.maxAirportMin) return 'airport too far';
  const hub = hubDriveMin(t);
  if (hub != null && hub > f.maxHubMin) return 'hub airport too far';
  if (t.city100kKm > f.maxCityKm) return 'city too far';
  if (f.maxTransitKm != null) {
    const d = transitKm(t);
    if (d == null || d > f.maxTransitKm) return 'no public transport nearby';
  }
  if (f.maxTrainKm != null && (t.trainKm == null || t.trainKm > f.maxTrainKm))
    return 'no station nearby';
  // A null here means "not measured", which must not fail the filter -- only a
  // measured value below the bar does.
  if (f.minNetMbps > 0 && t.netDownMbps != null && t.netTests >= 20
      && t.netDownMbps < f.minNetMbps) return 'broadband too slow';
  if (t.pm25 != null && t.pm25 > f.maxPm25) return 'air too polluted';
  if (t.costIndex != null && t.costIndex > f.maxCostIndex) return 'too expensive to live in';
  if (t.pop < f.minPop) return 'too small';
  // The slider's top notch reads "any", so it has to mean any. It used to cap
  // at five million, which quietly excluded Tokyo, Seoul, Bogota and Sao Paulo
  // from a search the user believed was unbounded.
  if (f.maxPop < POP_ANY && t.pop > f.maxPop) return 'too large';
  if (f.ownership.length && !f.ownership.includes(t.ownership)) return 'cannot buy there';
  if (f.freeMovementOnly && t.residence !== 'free') return 'would need a visa';
  if (f.continents.length && !f.continents.includes(t.continent)) return 'outside chosen continents';
  if (f.countries.length && !f.countries.includes(t.country)) return 'outside chosen countries';
  if (f.regions.length && !f.regions.includes(t.ccaa)) return 'outside chosen regions';
  if (f.requireObservedPrice && t.priceSource !== 'observed') return 'price is estimated';
  return null;
}

export interface Ranked {
  town: Town;
  score: number;
  breakdown: Breakdown;
  gem?: number;
}

export function rank(towns: Town[], f: Filters, w: Weights, ctx: ScoreContext): Ranked[] {
  const out: Ranked[] = [];
  for (const t of towns) {
    if (rejectReason(t, f)) continue;
    // breakdown is computed once and reused rather than recomputed inside
    // score(); at 22k towns per keystroke that doubling is worth avoiding.
    const b = breakdown(t, f, ctx);
    let total = 0;
    let wsum = 0;
    for (const k of Object.keys(b) as Array<keyof Breakdown>) {
      const v = b[k];
      if (v == null) continue;
      total += (w[k] ?? 0) * v;
      wsum += w[k] ?? 0;
    }
    out.push({ town: t, score: wsum === 0 ? 0 : (100 * total) / wsum, breakdown: b });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}
