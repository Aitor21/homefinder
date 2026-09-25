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
import type { CountryRule, Town, Filters, Weights } from './types';
import { POP_ANY, SAFETY_ANY } from './types';
import { driveMinutes, formatDrive } from './travel';
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

/**
 * Everyday services: can you live here without driving for an hour?
 *
 * Each layer contributes only where it was actually surveyed, and the weights
 * renormalise, so a town is never marked down for data nobody collected. That
 * used to matter a great deal, when shops and health were Spain only and rail
 * covered Europe and Asia; both are worldwide now, but a box that failed to
 * download still leaves a null, and a null must still mean "not looked at".
 *
 * Returns null only when nothing at all was surveyed. `score()` drops null
 * dimensions and renormalises the remaining weights.
 */
/**
 * Below this, a country's own big towns show under a third of the shops (or
 * vets) the typical country's do, and a long distance there says more about
 * OpenStreetMap than about the town. China maps essentially none; Brazil maps
 * its supermarkets and barely any vets. Those layers then drop out of the
 * score, the same as a layer nobody surveyed, and the town panel says why.
 */
export const THIN_MAPPING = 0.35;
const thin = (ratio: number | null | undefined) => ratio != null && ratio < THIN_MAPPING;

export function amenityScore(t: Town): number | null {
  const parts: Array<[number, number]> = [];
  const add = (w: number, v: number | null) => {
    if (v != null && Number.isFinite(v)) parts.push([w, v]);
  };

  if (t.amenitiesSurveyed !== false && !thin(t.servicesMapped)) {
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

/**
 * The sea, from the elevation model's coastline. Deliberately NOT the beach
 * layer: OpenStreetMap maps river and lake beaches as beaches too, which put
 * Madrid five kilometres from "the beach".
 */
export function coastScore(t: Town): number {
  return t.coastKm == null ? 0 : inv(t.coastKm, 2, 70);
}

/**
 * Protected nature within reach, measured to the EDGE of the nearest national
 * park, protected area or nature reserve. Within half an hour's drive is where
 * this stops being an expedition and becomes a weekend habit.
 */
export function natureScore(t: Town): number | null {
  return t.parkKm == null ? null : inv(t.parkKm, 0, 40);
}

/**
 * Ski slopes. A day trip is the useful threshold: under an hour and a half each
 * way, or roughly 120 km, and a weekend on the snow is something you do rather
 * than something you plan.
 */
export function skiScore(t: Town): number | null {
  return t.skiKm == null ? null : inv(t.skiKm, 10, 150);
}

/**
 * How good a place is to live in with a dog, from the things that actually
 * decide it, weighted by how much each one matters day to day:
 *
 *   a vet nearby         0.40  the one you need at 2 am
 *   nature to walk in    0.30  protected land within reach
 *   summers it can bear  0.30  dogs overheat far sooner than people do
 *
 * Each part is used only where it was measured, and the rest renormalise, so a
 * town is never marked down for a layer nobody surveyed, or for vets that exist
 * but that nobody put on the map (see THIN_MAPPING).
 *
 * A dog park is a BONUS on top, closing up to a fifth of the remaining gap when
 * one is close. Never a penalty: whether a country fences off dog areas at all
 * is cultural, and whether it maps them is luck, so their absence proves
 * nothing either way.
 */
export function petScore(t: Town): number | null {
  const parts: Array<[number, number]> = [];
  if (t.petsSurveyed !== false && t.vetKm != null && !thin(t.vetsMapped))
    parts.push([0.4, inv(t.vetKm, 1, 25)]);
  if (t.parkKm != null) parts.push([0.3, inv(t.parkKm, 0, 30)]);
  if (Number.isFinite(t.daysOver30)) parts.push([0.3, inv(t.daysOver30, 0, 90)]);
  if (!parts.length) return null;
  const wsum = parts.reduce((a, [w]) => a + w, 0);
  const base = parts.reduce((a, [w, v]) => a + w * v, 0) / wsum;
  const park = t.petsSurveyed !== false && t.dogParkKm != null ? inv(t.dogParkKm, 1, 10) : 0;
  return base + (1 - base) * 0.2 * park;
}

/**
 * National homicide rate, on a log scale. Rates run from 0.2 in Japan to 40 and
 * more, so a linear scale would call every European country identical and
 * every Latin American one hopeless; on a log scale a tenfold gap reads as the
 * big difference it is. Anchored at 0.5 (as safe as it gets) and 20.
 */
export function safetyScore(t: Town): number | null {
  if (t.homicideRate == null) return null;
  return inv(Math.log10(Math.max(t.homicideRate, 0.1)), Math.log10(0.5), Math.log10(20));
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
  nature: number | null;
  ski: number | null;
  pets: number | null;
  safety: number | null;
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
    nature: natureScore(t),
    ski: skiScore(t),
    pets: petScore(t),
    safety: safetyScore(t),
  };
}

/**
 * Weighted 0..100 score of a breakdown. Weights are relative and normalised
 * here. `skip` leaves dimensions out entirely, which is how a near miss is
 * scored "as if you did not mind" the thing holding it back.
 */
export function weightedScore(b: Breakdown, w: Weights, skip?: ReadonlySet<keyof Breakdown>): number {
  let total = 0;
  let wsum = 0;
  for (const k of Object.keys(b) as Array<keyof Breakdown>) {
    const v = b[k];
    if (v == null) continue; // not surveyed: drop it and renormalise
    if (skip?.has(k)) continue;
    const weight = w[k] ?? 0;
    total += weight * v;
    wsum += weight;
  }
  return wsum === 0 ? 0 : (100 * total) / wsum;
}

/** Weighted 0..100 score. Weights are relative; they are normalised here. */
export function score(t: Town, f: Filters, w: Weights, ctx: ScoreContext): number {
  return weightedScore(breakdown(t, f, ctx), w);
}

// ------------------------------------------------------------------ filters

/**
 * What some filters need to know that the town alone cannot tell them: where
 * the user's clock is, where home is, and the per-country rules. Optional,
 * because most callers (tests, the questionnaire's live count) do not set those
 * filters, and a filter whose context is missing simply does not apply.
 */
export interface FilterEnv {
  /** Worst-case hours between this place's clock and the user's, or null. */
  tzGap?: (t: Town) => number | null;
  /** Estimated flight hours from home, or null when no home is set. */
  homeFlightH?: (t: Town) => number | null;
  /** Hours of daylight on the shortest day. */
  winterDaylight?: (t: Town) => number;
  /** Country rules, for the pet quarantine filter. */
  rules?: Record<string, CountryRule>;
}

export type FailKey =
  | 'budget' | 'hotDays' | 'warmNights' | 'hotMax' | 'hotMin' | 'winterMin'
  | 'airport' | 'hub' | 'city' | 'transit' | 'train' | 'net' | 'air' | 'cost'
  | 'popMin' | 'popMax' | 'tz' | 'daylight' | 'homeFlight' | 'homicide'
  | 'ownership' | 'visa' | 'continent' | 'country' | 'region' | 'observedPrice'
  | 'petQuarantine';

/**
 * One filter a place fails, with enough detail to say how badly.
 *
 * `relaxable` splits the filters into two kinds. A threshold (an hour to the
 * airport, a budget) is a matter of degree: a place past it might still be the
 * right answer, and the near-miss view exists to show those. WHERE you are
 * willing to live is a matter of kind: a town outside the countries you picked
 * is not "nearly" in them, so those are never forgiven.
 */
export interface Failure {
  key: FailKey;
  /** Short reason, exactly as `rejectReason` reports it. */
  reason: string;
  relaxable: boolean;
  /**
   * How far past the limit, scaled so 1 means "a long way": a full hour over a
   * one-hour limit, 3 C over a temperature bar, twice the budget. 0 for the
   * categorical filters. Near misses sort their reasons by it.
   */
  miss: number;
  /** The measured value and the limit, formatted for reading. */
  value?: string;
  limit?: string;
  /** The score dimension this filter mirrors, forgiven along with it. */
  dim?: keyof Breakdown;
}

const eurK = (v: number) => `€${Math.round(v / 1000).toLocaleString()}k`;
const r1 = (v: number) => Math.round(v * 10) / 10;

type Draft = Omit<Failure, 'value' | 'limit'> & { value?: () => string; limit?: () => string };

/**
 * A failure whose readable strings are built only when something reads them.
 * The near-miss view asks for every failure of every place on each slider
 * move, around 90,000 of them, and nearly all are counted and thrown away.
 * Formatting them eagerly ("2 h 10 to BIO", "€520k for 80 m²") was most of
 * the cost of the whole view. Getters on the prototype keep the Failure
 * shape unchanged for everything downstream.
 */
class LazyFailure implements Failure {
  key: FailKey;
  reason: string;
  relaxable: boolean;
  miss: number;
  dim?: keyof Breakdown;
  private v?: () => string;
  private l?: () => string;
  constructor(d: Draft) {
    this.key = d.key;
    this.reason = d.reason;
    this.relaxable = d.relaxable;
    this.miss = d.miss;
    this.dim = d.dim;
    this.v = d.value;
    this.l = d.limit;
  }
  get value() { return this.v?.(); }
  get limit() { return this.l?.(); }
}

/** Every filter the place fails, in the order the panel lists them. */
export function failures(t: Town, f: Filters, env: FilterEnv = {}): Failure[] {
  const out: Failure[] = [];
  const push = (x: Draft) => out.push(new LazyFailure(x));

  const price = priceFor(t, f.minM2);
  if (price > f.budget)
    push({ key: 'budget', reason: 'over budget', relaxable: true, dim: 'affordability',
      miss: price / f.budget - 1, value: () => `${eurK(price)} for ${f.minM2} m²`,
      limit: () => eurK(f.budget) });
  if (t.daysOver30 > f.maxDaysOver30)
    push({ key: 'hotDays', reason: 'too many hot days', relaxable: true, dim: 'summerFit',
      miss: (t.daysOver30 - f.maxDaysOver30) / Math.max(f.maxDaysOver30, 10),
      value: () => `${Math.round(t.daysOver30)} days over 30 °C`, limit: () => `${f.maxDaysOver30}` });
  if (t.tropicalNights > f.maxTropicalNights)
    push({ key: 'warmNights', reason: 'too many warm nights', relaxable: true, dim: 'summerFit',
      miss: (t.tropicalNights - f.maxTropicalNights) / Math.max(f.maxTropicalNights, 10),
      value: () => `${Math.round(t.tropicalNights)} nights over 20 °C`, limit: () => `${f.maxTropicalNights}` });
  if (t.hottestTmax > f.maxHotTmax)
    push({ key: 'hotMax', reason: 'hottest month too hot', relaxable: true, dim: 'summerFit',
      miss: (t.hottestTmax - f.maxHotTmax) / 3, value: () => `${r1(t.hottestTmax)} °C peak`,
      limit: () => `${f.maxHotTmax} °C` });
  if (t.hottestTmax < f.minHotTmax)
    push({ key: 'hotMin', reason: 'hottest month too cool', relaxable: true, dim: 'summerFit',
      miss: (f.minHotTmax - t.hottestTmax) / 3, value: () => `${r1(t.hottestTmax)} °C peak`,
      limit: () => `${f.minHotTmax} °C` });
  if (t.winterTmin < f.minWinterTmin)
    push({ key: 'winterMin', reason: 'winters too cold', relaxable: true, dim: 'winterMild',
      miss: (f.minWinterTmin - t.winterTmin) / 3, value: () => `${r1(t.winterTmin)} °C winter nights`,
      limit: () => `${f.minWinterTmin} °C` });
  const air = airportDriveMin(t);
  if (air != null && air > f.maxAirportMin)
    push({ key: 'airport', reason: 'airport too far', relaxable: true, dim: 'airport',
      miss: (air - f.maxAirportMin) / f.maxAirportMin,
      value: () => `${formatDrive(air)} to ${t.airportName}`, limit: () => formatDrive(f.maxAirportMin) });
  const hub = hubDriveMin(t);
  if (hub != null && hub > f.maxHubMin)
    push({ key: 'hub', reason: 'hub airport too far', relaxable: true, dim: 'airport',
      miss: (hub - f.maxHubMin) / f.maxHubMin,
      value: () => `${formatDrive(hub)} to ${t.hubName}`, limit: () => formatDrive(f.maxHubMin) });
  if (t.city100kKm > f.maxCityKm)
    push({ key: 'city', reason: 'city too far', relaxable: true, dim: 'city',
      miss: (t.city100kKm - f.maxCityKm) / Math.max(f.maxCityKm, 20),
      value: () => `${Math.round(t.city100kKm)} km to ${t.city100kName}`, limit: () => `${f.maxCityKm} km` });
  if (f.maxTransitKm != null) {
    const d = transitKm(t);
    if (d == null)
      push({ key: 'transit', reason: 'public transport not surveyed', relaxable: true,
        dim: 'amenities', miss: 0.5, value: () => 'not surveyed here', limit: () => `${f.maxTransitKm} km` });
    else if (d > f.maxTransitKm)
      push({ key: 'transit', reason: 'no public transport nearby', relaxable: true,
        dim: 'amenities', miss: (d - f.maxTransitKm) / Math.max(f.maxTransitKm, 3),
        value: () => `${r1(d)} km to the nearest`, limit: () => `${f.maxTransitKm} km` });
  }
  if (f.maxTrainKm != null && (t.trainKm == null || t.trainKm > f.maxTrainKm))
    push({ key: 'train', reason: 'no station nearby', relaxable: true, dim: 'amenities',
      miss: t.trainKm == null ? 0.5 : (t.trainKm - f.maxTrainKm) / Math.max(f.maxTrainKm, 5),
      value: () => t.trainKm == null ? 'not surveyed here' : `${r1(t.trainKm)} km to a station`,
      limit: () => `${f.maxTrainKm} km` });
  // A null here means "not measured", which must not fail the filter -- only a
  // measured value below the bar does.
  // Nullable fields are copied into constants first: narrowing does not
  // follow them into the lazy closures below.
  const net = t.netDownMbps;
  if (f.minNetMbps > 0 && net != null && t.netTests >= 20 && net < f.minNetMbps)
    push({ key: 'net', reason: 'broadband too slow', relaxable: true, dim: 'internet',
      miss: (f.minNetMbps - net) / f.minNetMbps,
      value: () => `${net < 100 ? r1(net) : Math.round(net)} Mbps`,
      limit: () => `${f.minNetMbps} Mbps` });
  const pm = t.pm25;
  if (pm != null && pm > f.maxPm25)
    push({ key: 'air', reason: 'air too polluted', relaxable: true, dim: 'cleanAir',
      miss: (pm - f.maxPm25) / f.maxPm25, value: () => `PM2.5 ${r1(pm)}`,
      limit: () => `${f.maxPm25}` });
  if (t.costIndex != null && t.costIndex > f.maxCostIndex)
    push({ key: 'cost', reason: 'too expensive to live in', relaxable: true, dim: 'livingCost',
      miss: (t.costIndex - f.maxCostIndex) / f.maxCostIndex, value: () => `index ${t.costIndex}`,
      limit: () => `${f.maxCostIndex}` });
  if (t.pop < f.minPop)
    push({ key: 'popMin', reason: 'too small', relaxable: true,
      miss: (f.minPop - t.pop) / f.minPop, value: () => `${t.pop.toLocaleString()} people`,
      limit: () => f.minPop.toLocaleString() });
  // The slider's top notch reads "any", so it has to mean any. It used to cap
  // at five million, which quietly excluded Tokyo, Seoul, Bogota and Sao Paulo
  // from a search the user believed was unbounded.
  if (f.maxPop < POP_ANY && t.pop > f.maxPop)
    push({ key: 'popMax', reason: 'too large', relaxable: true,
      miss: (t.pop - f.maxPop) / f.maxPop, value: () => `${t.pop.toLocaleString()} people`,
      limit: () => f.maxPop.toLocaleString() });
  if (f.maxTzDiff != null && env.tzGap) {
    const gap = env.tzGap(t);
    if (gap != null && gap > f.maxTzDiff)
      push({ key: 'tz', reason: 'too many hours from your clock', relaxable: true,
        miss: gap - f.maxTzDiff, value: () => `${r1(gap)} h from your clock`,
        limit: () => `${f.maxTzDiff} h` });
  }
  if (f.minWinterDaylight > 0 && env.winterDaylight) {
    const h = env.winterDaylight(t);
    if (h < f.minWinterDaylight)
      push({ key: 'daylight', reason: 'winter days too short', relaxable: true,
        miss: f.minWinterDaylight - h, value: () => `${r1(h)} h of daylight in midwinter`,
        limit: () => `${f.minWinterDaylight} h` });
  }
  if (f.maxHomeFlightH != null && env.homeFlightH) {
    const h = env.homeFlightH(t);
    if (h != null && h > f.maxHomeFlightH)
      push({ key: 'homeFlight', reason: 'too far from home', relaxable: true,
        miss: (h - f.maxHomeFlightH) / Math.max(f.maxHomeFlightH, 1),
        value: () => `about ${r1(h)} h flying`, limit: () => `${f.maxHomeFlightH} h` });
  }
  const hom = t.homicideRate;
  if (f.maxHomicide < SAFETY_ANY && hom != null && hom > f.maxHomicide)
    push({ key: 'homicide', reason: 'homicide rate too high', relaxable: true, dim: 'safety',
      miss: (hom - f.maxHomicide) / f.maxHomicide,
      value: () => `${r1(hom)} per 100,000`, limit: () => `${f.maxHomicide}` });

  // Where you are willing to live. Never forgiven.
  if (f.ownership.length && !f.ownership.includes(t.ownership))
    push({ key: 'ownership', reason: 'cannot buy there', relaxable: false, miss: 0 });
  if (f.freeMovementOnly && t.residence !== 'free')
    push({ key: 'visa', reason: 'would need a visa', relaxable: false, miss: 0 });
  if (f.continents.length && !f.continents.includes(t.continent))
    push({ key: 'continent', reason: 'outside chosen continents', relaxable: false, miss: 0 });
  if (f.countries.length && !f.countries.includes(t.country))
    push({ key: 'country', reason: 'outside chosen countries', relaxable: false, miss: 0 });
  if (f.regions.length && !f.regions.includes(t.ccaa))
    push({ key: 'region', reason: 'outside chosen regions', relaxable: false, miss: 0 });
  if (f.requireObservedPrice && t.priceSource !== 'observed')
    push({ key: 'observedPrice', reason: 'price is estimated', relaxable: false, miss: 0 });
  if (f.noPetQuarantine && env.rules?.[t.country]?.pets === 'quarantine')
    push({ key: 'petQuarantine', reason: 'quarantines arriving pets', relaxable: false, miss: 0 });
  return out;
}

/**
 * Hard filters. Returns null if the town passes, or the first reason it fails.
 *
 * Deliberately a separate short-circuiting pass rather than `failures()[0]`:
 * this runs for every place on every keystroke, and most places fail early.
 * The two must agree on order, which the tests check.
 */
export function rejectReason(t: Town, f: Filters, env: FilterEnv = {}): string | null {
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
    // Unknown is excluded too, since the filter asks for transport it cannot
    // confirm, but it says so rather than claiming there is none.
    if (d == null) return 'public transport not surveyed';
    if (d > f.maxTransitKm) return 'no public transport nearby';
  }
  if (f.maxTrainKm != null && (t.trainKm == null || t.trainKm > f.maxTrainKm))
    return 'no station nearby';
  if (f.minNetMbps > 0 && t.netDownMbps != null && t.netTests >= 20
      && t.netDownMbps < f.minNetMbps) return 'broadband too slow';
  if (t.pm25 != null && t.pm25 > f.maxPm25) return 'air too polluted';
  if (t.costIndex != null && t.costIndex > f.maxCostIndex) return 'too expensive to live in';
  if (t.pop < f.minPop) return 'too small';
  if (f.maxPop < POP_ANY && t.pop > f.maxPop) return 'too large';
  if (f.maxTzDiff != null && env.tzGap) {
    const gap = env.tzGap(t);
    if (gap != null && gap > f.maxTzDiff) return 'too many hours from your clock';
  }
  if (f.minWinterDaylight > 0 && env.winterDaylight
      && env.winterDaylight(t) < f.minWinterDaylight) return 'winter days too short';
  if (f.maxHomeFlightH != null && env.homeFlightH) {
    const h = env.homeFlightH(t);
    if (h != null && h > f.maxHomeFlightH) return 'too far from home';
  }
  if (f.maxHomicide < SAFETY_ANY && t.homicideRate != null && t.homicideRate > f.maxHomicide)
    return 'homicide rate too high';
  if (f.ownership.length && !f.ownership.includes(t.ownership)) return 'cannot buy there';
  if (f.freeMovementOnly && t.residence !== 'free') return 'would need a visa';
  if (f.continents.length && !f.continents.includes(t.continent)) return 'outside chosen continents';
  if (f.countries.length && !f.countries.includes(t.country)) return 'outside chosen countries';
  if (f.regions.length && !f.regions.includes(t.ccaa)) return 'outside chosen regions';
  if (f.requireObservedPrice && t.priceSource !== 'observed') return 'price is estimated';
  if (f.noPetQuarantine && env.rules?.[t.country]?.pets === 'quarantine')
    return 'quarantines arriving pets';
  return null;
}

export interface Ranked {
  town: Town;
  score: number;
  breakdown: Breakdown;
  gem?: number;
  /**
   * Set only on near misses: what the place would score if the things holding
   * it back were forgiven, and what those things are.
   */
  forgiven?: number;
  held?: HeldBack[];
  /**
   * Opened from a search although a filter keeps it out and it is not a near
   * miss either. Shown anyway, with every reason, because "why is my town not
   * in the list" deserves a full answer rather than silence.
   */
  excluded?: boolean;
}

/** One reason a near miss is not in the main list: a filter, or a dimension. */
export interface HeldBack {
  /** A filter it fails, with the numbers... */
  failure?: Failure;
  /** ...or a dimension so weak it drags an otherwise excellent score down. */
  dim?: keyof Breakdown;
  /** 0..1 value of that dimension, for the weak-dimension case. */
  value?: number;
}

export function rank(
  towns: Town[], f: Filters, w: Weights, ctx: ScoreContext, env: FilterEnv = {},
): Ranked[] {
  const out: Ranked[] = [];
  for (const t of towns) {
    if (rejectReason(t, f, env)) continue;
    // breakdown is computed once and reused rather than recomputed inside
    // score(); at 30k towns per keystroke that doubling is worth avoiding.
    const b = breakdown(t, f, ctx);
    out.push({ town: t, score: weightedScore(b, w), breakdown: b });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}
