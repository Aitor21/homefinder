/**
 * The quick start: four taps from nothing to a ranked list.
 *
 * The questionnaire in profile.ts is precise and slow. It asks for places you
 * have lived in and found unbearable, out of a list of a hundred and fifty
 * cities worldwide, then for which way they were wrong, then five more
 * screens. For someone who already knows what they are escaping that is the
 * right tool. For someone arriving for the first time it is a wall: they have
 * not seen a single result yet, and they are being asked to grade the world.
 *
 * So the first visit asks four things anyone can answer without thinking:
 * where you would consider, what summer you want, what you would love to have
 * around you, and roughly what you can spend. Each is one tap on a picture,
 * not a slider. Results come straight after, and the precise tools (the
 * questionnaire, every slider, the weights) are still there to fine-tune.
 *
 * Every control here is a PATCH on the filters and weights rather than a
 * separate store of answers. That is what lets the same tiles sit at the top of
 * the filter panel afterwards and stay truthful: a tile is lit because the
 * filters say so, not because of what was tapped three screens ago, so moving
 * a slider by hand can never leave a tile claiming something that is no longer
 * true.
 */
import type { Filters, Intent, Ownership, Town, Weights } from './types';
import { monthLabel, weatherHigh } from './climate';
import { DEFAULT_FILTERS, DEFAULT_WEIGHTS, POP_ANY } from './types';
import { FREE_MOVEMENT } from './home';
import { resolveReferences } from './profile';

export interface Search {
  filters: Filters;
  weights: Weights;
}

// ----------------------------------------------------------------- intent

export interface IntentOption {
  key: Intent;
  icon: string;
  label: string;
  hint: string;
  /** Weights this intent sets. Kept at 6 or under where a tile also uses the
   *  dimension, so a tile lights only when the person picked it. */
  weights: Partial<Weights>;
  filters: Partial<Filters>;
}

const ALL_TIERS: Ownership[] = ['freehold', 'restricted', 'leasehold', 'prohibited'];
const BUYABLE: Ownership[] = ['freehold', 'restricted', 'leasehold'];

/**
 * Why someone is here. The tool began as a purchase screener, but most people
 * looking for somewhere new are not buying: they will rent, work from a laptop,
 * retire, or want to know where to spend October. Only "Buy a home" switches
 * on the purchase budget and the question of whether a foreigner may buy;
 * everyone else gets every country, ranked on living there.
 */
export const INTENTS: IntentOption[] = [
  {
    key: 'live', icon: '🏡', label: 'Move & live', hint: 'Find a new place to call home',
    weights: {}, filters: {},
  },
  {
    key: 'nomad', icon: '💻', label: 'Work remotely', hint: 'Fast internet, flights out, sensible costs',
    weights: { internet: 9, livingCost: 6, affordability: 5, culture: 4 },
    filters: { minNetMbps: 50 },
  },
  {
    key: 'rent', icon: '🔑', label: 'Rent for a while', hint: 'Affordable housing and everyday services',
    weights: { affordability: 8, livingCost: 6, amenities: 6 },
    filters: {},
  },
  {
    key: 'travel', icon: '🧳', label: 'Travel & visit', hint: 'Great weather and things to do when you go',
    weights: {
      culture: 6, events: 6, internet: 0, affordability: 1, livingCost: 3, energyBill: 0,
      amenities: 3, winterMild: 0, cleanAir: 3, safety: 6,
      // Rain on your dates, not over the year: a wet fortnight ruins a trip.
      drier: 5,
    },
    // Living constraints that mean nothing on a visit: a resort island two
    // hundred km from the nearest city is the point, not a problem, and a
    // week of hazy air is not a year of it.
    filters: { minNetMbps: 0, maxCityKm: 400, maxPm25: 40 },
  },
  {
    key: 'retire', icon: '🌅', label: 'Retire', hint: 'Mild winters, health care, calm and safe',
    weights: { winterMild: 6, amenities: 6, safety: 6, livingCost: 6, internet: 3, city: 4 },
    filters: {},
  },
  {
    key: 'buy', icon: '🏠', label: 'Buy a home', hint: 'Where your budget buys the space you need',
    weights: { affordability: 8 },
    filters: {},
  },
];

export function intentOf(key: Intent): IntentOption {
  return INTENTS.find((i) => i.key === key) ?? INTENTS[0];
}

/** The month after this one: the natural default for "when are you going?". */
export function nextMonth(now = new Date()): number {
  return (now.getMonth() + 1) % 12;
}

/**
 * Switch intent: undo the previous intent's weights, apply the new one's.
 * Buying turns the budget and the ownership rule on; anything else turns them
 * off and opens every country. Travel brings months; anything else drops them.
 */
export function applyIntent(s: Search, key: Intent): Search {
  const prev = intentOf(s.filters.intent);
  const next = intentOf(key);
  const weights = { ...s.weights };
  for (const k of Object.keys(prev.weights) as Array<keyof Weights>) weights[k] = DEFAULT_WEIGHTS[k];
  Object.assign(weights, next.weights);
  const buying = key === 'buy';
  // Undo what the previous intent set before applying the new one.
  const base = quickBase().filters;
  const undone: Partial<Filters> = {};
  for (const k of Object.keys(prev.filters) as Array<keyof Filters>) {
    (undone as Record<string, unknown>)[k] = base[k];
  }
  const filters: Filters = {
    ...s.filters,
    ...undone,
    ...next.filters,
    intent: key,
    buying,
    ownership: buying ? BUYABLE : ALL_TIERS,
    months: key === 'travel' ? (s.filters.months.length ? s.filters.months : [nextMonth()]) : [],
  };
  return { filters, weights };
}

/** Turn the purchase budget on or off without changing anything else. */
export function setBuying(s: Search, on: boolean): Search {
  return {
    ...s,
    filters: { ...s.filters, buying: on, ownership: on ? BUYABLE : ALL_TIERS },
  };
}

// ------------------------------------------------------------------ where

export type Where = 'world' | 'europe' | 'nofuss' | 'home';

export interface WhereOption {
  key: Where;
  icon: string;
  label: string;
  hint: string;
}

export function whereOptions(homeName: string | null, home: string | null): WhereOption[] {
  const out: WhereOption[] = [
    { key: 'world', icon: '🌍', label: 'Anywhere', hint: 'The whole world, if I can buy there' },
    { key: 'europe', icon: '🇪🇺', label: 'Europe', hint: 'The continent, in or out of the EU' },
    {
      key: 'nofuss',
      icon: '🛂',
      label: 'No visa needed',
      hint: home && !FREE_MOVEMENT.has(home)
        ? 'EU and EFTA, assuming an EU passport'
        : 'The EU and EFTA, where an EU passport is enough',
    },
  ];
  if (home && homeName) {
    out.push({ key: 'home', icon: '🏠', label: `Only ${homeName}`, hint: 'Somewhere new, same country' });
  }
  return out;
}

export function applyWhere(f: Filters, where: Where, home: string | null): Filters {
  const base = { ...f, continents: [], countries: [], regions: [], freeMovementOnly: false };
  if (where === 'europe') return { ...base, continents: ['Europe'] };
  if (where === 'nofuss') return { ...base, freeMovementOnly: true };
  if (where === 'home' && home) return { ...base, countries: [home] };
  return base;
}

/** Which tile the filters currently amount to, or null when they are custom. */
export function whereOf(f: Filters, home: string | null): Where | null {
  if (f.regions.length) return null;
  const c = f.continents;
  const k = f.countries;
  if (!c.length && !k.length && !f.freeMovementOnly) return 'world';
  if (c.length === 1 && c[0] === 'Europe' && !k.length && !f.freeMovementOnly) return 'europe';
  if (!c.length && !k.length && f.freeMovementOnly) return 'nofuss';
  if (!c.length && k.length === 1 && home && k[0] === home && !f.freeMovementOnly) return 'home';
  return null;
}

// ----------------------------------------------------------------- summer

export type Summer = 'fresh' | 'mild' | 'warm' | 'hot' | 'any';

export interface SummerOption {
  key: Summer;
  icon: string;
  label: string;
  /** What it means, in the unit people actually feel. */
  hint: string;
  /** The hottest month's daily high it aims at, or null for no preference. */
  target: number | null;
  /** The band a place must sit in. Wide enough to leave choice, narrow enough to mean it. */
  min: number;
  max: number;
}

/**
 * Bands on the hottest month's mean daily high, which is the single number
 * people can picture ("highs around 26"). They overlap by a degree or so on
 * purpose: a 28.5 °C summer is honestly both mild and warm, and the target
 * still sorts it. Outside the band a place is a near miss, not invisible.
 */
export const SUMMERS: SummerOption[] = [
  { key: 'fresh', icon: '🌥️', label: 'Fresh', hint: 'Highs up to about 24 °C. Sleep with a duvet in August', target: 22, min: 0, max: 25 },
  { key: 'mild', icon: '🌤️', label: 'Mild', hint: 'Highs around 26 °C. Warm days, cool nights', target: 26, min: 23, max: 28.5 },
  { key: 'warm', icon: '☀️', label: 'Warm', hint: 'Highs around 30 °C. Proper beach summers', target: 30, min: 27.5, max: 32.5 },
  { key: 'hot', icon: '🔥', label: 'Hot', hint: 'Highs of 32 °C and up. The more sun the better', target: 34, min: 31.5, max: 50 },
  { key: 'any', icon: '🤷', label: 'No preference', hint: 'Do not rank on weather at all', target: null, min: 0, max: 50 },
];

/** The same tiles, worded for a visit: the weather while you are there. */
export const TRAVEL_HINT: Record<Summer, string> = {
  fresh: 'Highs up to about 24 °C. Walking weather',
  mild: 'Highs around 26 °C. T-shirt days, jacket evenings',
  warm: 'Highs around 30 °C. Beach and terrace weather',
  hot: 'Highs of 32 °C and up. Proper heat',
  any: 'Do not rank on weather at all',
};

export function applySummer(f: Filters, key: Summer): Filters {
  const s = SUMMERS.find((x) => x.key === key)!;
  return {
    ...f,
    summerTarget: s.target,
    minHotTmax: s.min,
    maxHotTmax: s.max,
    // The day and night counts are the questionnaire's finer tools. A tile
    // speaks in highs only, so it resets them rather than leaving a ceiling
    // from an earlier session silently fighting the band it just set.
    maxDaysOver30: DEFAULT_FILTERS.maxDaysOver30,
    maxTropicalNights: DEFAULT_FILTERS.maxTropicalNights,
  };
}

export function summerOf(f: Filters): Summer | null {
  if (f.summerTarget == null) {
    return f.minHotTmax === 0 && f.maxHotTmax >= 50 ? 'any' : null;
  }
  const s = SUMMERS.find((x) => x.target === f.summerTarget);
  return s ? s.key : null;
}

/**
 * Two or three places people have heard of with this kind of summer, nearest
 * home first, so "mild" means something concrete: "like Paris or Munich".
 * Drawn from the largest towns in the band, one per country.
 */
export function summerExamples(
  towns: Town[], key: Summer, home: string | null, n = 3, months: readonly number[] = [],
): string[] {
  const s = SUMMERS.find((x) => x.key === key);
  if (!s || s.target == null) return [];
  // Only cities people have heard of: the questionnaire's reference list.
  // "Like Ordos" explains nothing, however big Ordos is.
  const byId = new Map(towns.map((t) => [t.id, t]));
  const homeTown = home ? towns.find((t) => t.country === home) : undefined;
  const continent = homeTown?.continent ?? 'Europe';
  const fits = resolveReferences(towns, home)
    .map((r, order) => ({ label: r.label, town: byId.get(r.id)!, order }))
    .filter((r) => r.town && Math.abs(weatherHigh(r.town, months) - s.target!) <= 1.5);
  // Home country first, then home continent, then the world.
  const rankOf = (t: Town) => (t.country === home ? 0 : t.continent === continent ? 1 : 2);
  fits.sort((a, b) => rankOf(a.town) - rankOf(b.town) || a.order - b.order);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of fits) {
    if (seen.has(r.town.country)) continue;
    seen.add(r.town.country);
    out.push(r.label);
    if (out.length >= n) break;
  }
  return out;
}

// ------------------------------------------------------------------ vibes

export type Vibe =
  | 'beach' | 'mountains' | 'nature' | 'lakes' | 'highlands' | 'flat'
  | 'culture' | 'festivals' | 'city' | 'quiet'
  | 'sun' | 'mildWinter' | 'ski' | 'cheap' | 'remote' | 'carfree' | 'fly' | 'dog' | 'safe';

/** Landscape is what a place looks like; life is what you do there. */
export type VibeGroup = 'landscape' | 'life';

export interface VibeOption {
  key: Vibe;
  group: VibeGroup;
  icon: string;
  label: string;
  hint: string;
  /** Switching it on is a patch; so is switching it off. */
  on: (s: Search) => Search;
  off: (s: Search) => Search;
  isOn: (s: Search) => boolean;
}

/** Weight a vibe raises a dimension to. High, not maximal, so two vibes can coexist. */
const BOOST = 8;
const D = DEFAULT_WEIGHTS;

/** A vibe that is nothing more than one or more weights turned up. */
function weighted(
  key: Vibe, icon: string, label: string, hint: string,
  dims: Array<keyof Weights>, extra?: { on?: Partial<Filters>; off?: Partial<Filters> },
  group: VibeGroup = 'life',
): VibeOption {
  return {
    key, group, icon, label, hint,
    on: ({ filters, weights }) => {
      const w = { ...weights };
      for (const d of dims) w[d] = Math.max(w[d], BOOST);
      return { filters: { ...filters, ...extra?.on }, weights: w };
    },
    off: ({ filters, weights }) => {
      const w = { ...weights };
      for (const d of dims) w[d] = D[d];
      return { filters: { ...filters, ...extra?.off }, weights: w };
    },
    // Lit when the FIRST dimension is boosted: that one is the vibe, the
    // rest are supporting cast and may be set by hand to anything.
    isOn: ({ weights }) => weights[dims[0]] >= BOOST - 1,
  };
}

/** Anything at or above this counts as a city, for the city/quiet pair. */
const CITY_POP = 100_000;
const QUIET_POP = 30_000;

export const VIBES: VibeOption[] = [
  // --- landscape
  weighted('beach', '🏖️', 'Coast & beaches', 'Close to the sea', ['coast'], undefined, 'landscape'),
  weighted('mountains', '⛰️', 'Mountains', 'Real relief on the horizon', ['mountains'], undefined, 'landscape'),
  weighted('lakes', '🏞️', 'Lakes & rivers', 'Swimmable water inland', ['water'], undefined, 'landscape'),
  weighted('highlands', '🏔️', 'Highlands', 'Up high: fresher air, cooler nights', ['altitude'], undefined, 'landscape'),
  weighted('nature', '🌲', 'Forests & parks', 'National parks and reserves to walk in', ['nature'], undefined, 'landscape'),
  weighted('flat', '🌾', 'Flat, open country', 'Easy walking and cycling, big skies', ['flat'], undefined, 'landscape'),
  // --- what you do there
  weighted('culture', '🎭', 'Museums & theatre', 'Culture within an evening’s reach', ['culture']),
  weighted('festivals', '🎶', 'Festivals & live music', 'Big recurring festivals and fiestas nearby', ['events']),
  {
    key: 'city', group: 'life', icon: '🏙️', label: 'Big-city buzz', hint: 'A city of 100,000 or more',
    on: ({ filters, weights }) => ({
      filters: { ...filters, minPop: Math.max(filters.minPop, CITY_POP), maxPop: POP_ANY },
      weights: { ...weights, city: Math.max(weights.city, BOOST), culture: Math.max(weights.culture, 5) },
    }),
    off: ({ filters, weights }) => ({
      filters: { ...filters, minPop: DEFAULT_FILTERS.minPop },
      weights: { ...weights, city: D.city },
    }),
    isOn: ({ filters }) => filters.minPop >= CITY_POP,
  },
  {
    key: 'quiet', group: 'life', icon: '🏡', label: 'Quiet small town', hint: 'Under 30,000 people',
    on: ({ filters, weights }) => ({
      filters: { ...filters, maxPop: QUIET_POP, minPop: Math.min(filters.minPop, DEFAULT_FILTERS.minPop) },
      weights: { ...weights, amenities: Math.max(weights.amenities, 6) },
    }),
    off: ({ filters, weights }) => ({
      filters: { ...filters, maxPop: POP_ANY },
      weights: { ...weights, amenities: D.amenities },
    }),
    isOn: ({ filters }) => filters.maxPop <= QUIET_POP,
  },
  weighted('sun', '😎', 'Sunshine', 'Bright skies, little rain', ['sunny', 'drier']),
  weighted('mildWinter', '🧣', 'Mild winters', 'No real winter to speak of', ['winterMild']),
  weighted('ski', '⛷️', 'Skiing', 'Slopes within a day trip', ['ski']),
  weighted('cheap', '💶', 'Low cost of living', 'Everyday prices well below home', ['livingCost', 'affordability']),
  weighted('remote', '💻', 'Remote work', 'Fast broadband, a sane time zone', ['internet'],
    { on: { minNetMbps: 50 }, off: { minNetMbps: DEFAULT_FILTERS.minNetMbps } }),
  {
    key: 'carfree', group: 'life', icon: '🚆', label: 'Car-free life', hint: 'A station or tram within 3 km',
    on: ({ filters, weights }) => ({
      filters: { ...filters, maxTransitKm: 3 },
      weights: { ...weights, amenities: Math.max(weights.amenities, 7) },
    }),
    off: ({ filters, weights }) => ({
      filters: { ...filters, maxTransitKm: null },
      weights: { ...weights, amenities: D.amenities },
    }),
    isOn: ({ filters }) => filters.maxTransitKm != null,
  },
  weighted('fly', '✈️', 'Fly often', 'A big airport within an hour', ['airport'],
    { on: { maxHubMin: 60, maxAirportMin: 45 }, off: { maxHubMin: 150, maxAirportMin: 120 } }),
  weighted('dog', '🐕', 'Moving with a dog', 'Vets, walks, bearable summers', ['pets']),
  // National homicide rates only, so the tile says country. It used to say
  // "Very safe", which promised something about towns the data cannot see.
  weighted('safe', '🛡️', 'Low-crime country', 'National homicide rate: tells countries apart, not towns', ['safety']),
];

export function vibe(key: Vibe): VibeOption {
  return VIBES.find((v) => v.key === key)!;
}

/** Pairs that contradict each other: picking one drops the other. */
const OPPOSITE: Partial<Record<Vibe, Vibe>> = {
  city: 'quiet', quiet: 'city', mountains: 'flat', flat: 'mountains',
};

export function toggleVibe(s: Search, key: Vibe): Search {
  const v = vibe(key);
  if (v.isOn(s)) return v.off(s);
  let next = s;
  const other = OPPOSITE[key];
  if (other && vibe(other).isOn(next)) next = vibe(other).off(next);
  return v.on(next);
}

export function activeVibes(s: Search): Vibe[] {
  return VIBES.filter((v) => v.isOn(s)).map((v) => v.key);
}

// ----------------------------------------------------------------- budget

export const BUDGETS = [
  { value: 150_000, label: 'Up to €150k' },
  { value: 300_000, label: 'Up to €300k' },
  { value: 500_000, label: 'Up to €500k' },
  { value: 800_000, label: '€800k or more' },
];

export const SIZES = [
  { value: 50, label: 'Compact', hint: '50 m², one or two people' },
  { value: 80, label: 'Family', hint: '80 m², two or three bedrooms' },
  { value: 120, label: 'Spacious', hint: '120 m² and up' },
];

// ---------------------------------------------------------------- profile

export interface QuickAnswers {
  intent: Intent;
  /** Months of a visit; only used when travelling. */
  months: number[];
  where: Where;
  summer: Summer;
  vibes: Vibe[];
  budget: number;
  minM2: number;
}

export const DEFAULT_QUICK: QuickAnswers = {
  intent: 'live',
  months: [],
  where: 'world',
  summer: 'any',
  vibes: [],
  budget: 300_000,
  minM2: 80,
};

/**
 * The starting point for a quick search, before any answer is applied.
 *
 * Wider than DEFAULT_FILTERS on access, deliberately. Those defaults were
 * tuned for someone who flies often: a 45-minute drive to any airport and an
 * hour to a hub, which is a real constraint and quietly removes most of the
 * mountain and island towns a first-time visitor might fall for. Two hours to
 * an airport is the neutral answer; "Fly often" tightens it back.
 */
export function quickBase(): Search {
  return {
    filters: {
      ...DEFAULT_FILTERS,
      // Living somewhere, not buying: no purchase budget and every country,
      // including the ones a foreigner cannot buy in.
      intent: 'live',
      buying: false,
      ownership: ALL_TIERS,
      maxAirportMin: 120,
      maxHubMin: 150,
      maxCityKm: 150,
    },
    weights: { ...DEFAULT_WEIGHTS },
  };
}

export function buildQuickSearch(a: QuickAnswers, home: string | null): Search {
  let s = applyIntent(quickBase(), a.intent ?? 'live');
  if (s.filters.intent === 'travel' && a.months?.length) {
    s = { ...s, filters: { ...s.filters, months: [...a.months] } };
  }
  s = { ...s, filters: applyWhere(s.filters, a.where, home) };
  s = { ...s, filters: applySummer(s.filters, a.summer) };
  for (const v of a.vibes) if (!vibe(v)?.isOn(s)) s = toggleVibe(s, v);
  s = { ...s, filters: { ...s.filters, budget: a.budget, minM2: a.minM2 } };
  return s;
}

/** Plain-English account of a quick search, for the "Your profile" notes. */
export function describeSearch(s: Search, home: string | null, homeName: string | null): string[] {
  const out: string[] = [];
  const f = s.filters;
  const intent = intentOf(f.intent);
  out.push(`${intent.label}: ${intent.hint.toLowerCase()}.`);
  const w = whereOf(f, home);
  const where = w ? whereOptions(homeName, home).find((o) => o.key === w) : null;
  if (where && w !== 'world') out.push(`${where.label}: ${where.hint.toLowerCase()}.`);
  const su = summerOf(f);
  const so = su ? SUMMERS.find((x) => x.key === su) : null;
  if (so && so.target != null) {
    const when = f.months.length ? `daytime highs in ${monthLabel(f.months)}` : 'hottest-month highs';
    out.push(
      `${so.label} weather: ${when} between ${so.min || 'any'} and ${so.max >= 50 ? 'any' : so.max} °C, ` +
        `ranked by closeness to ${so.target} °C in either direction.`,
    );
  }
  const vibes = activeVibes(s).map((k) => vibe(k).label.toLowerCase());
  if (vibes.length) out.push(`Weighted up: ${vibes.join(', ')}.`);
  out.push(
    f.buying
      ? `Buying: budget €${Math.round(f.budget / 1000)}k for at least ${f.minM2} m².`
      : 'No purchase budget: housing costs are ranked, not filtered. Turn on "I want to buy" to set one.',
  );
  return out;
}

// ---------------------------------------------------------------- summary

export interface SummaryChip {
  key: string;
  icon: string;
  label: string;
  /** What removing the chip does; absent for chips that cannot be removed. */
  remove?: (s: Search) => Search;
}

/**
 * The current search as a row of chips, for the strip above the results.
 * Each one can be dismissed with one tap, which is the cheapest fine-tuning
 * there is: "actually, forget the beach".
 */
export function summaryChips(s: Search, home: string | null, homeName: string | null): SummaryChip[] {
  const out: SummaryChip[] = [];
  const intent = intentOf(s.filters.intent);
  out.push({ key: 'intent', icon: intent.icon, label: intent.label });
  if (s.filters.months.length) {
    out.push({
      key: 'months', icon: '📅', label: monthLabel(s.filters.months),
      remove: (x) => ({ ...x, filters: { ...x.filters, months: [] } }),
    });
  }
  const w = whereOf(s.filters, home);
  if (w && w !== 'world') {
    const o = whereOptions(homeName, home).find((x) => x.key === w)!;
    out.push({
      key: 'where', icon: o.icon, label: o.label,
      remove: (x) => ({ ...x, filters: applyWhere(x.filters, 'world', home) }),
    });
  } else if (!w) {
    const n = s.filters.countries.length;
    const label = n === 1 ? (s.filters.countries[0] === home && homeName ? homeName : '1 country')
      : n > 1 ? `${n} countries`
        : s.filters.continents.length ? s.filters.continents.join(', ') : 'Custom area';
    out.push({
      key: 'where', icon: '📍', label,
      remove: (x) => ({ ...x, filters: applyWhere(x.filters, 'world', home) }),
    });
  }
  const su = summerOf(s.filters);
  if (su && su !== 'any') {
    const o = SUMMERS.find((x) => x.key === su)!;
    out.push({
      key: 'summer', icon: o.icon, label: s.filters.months.length ? `${o.label} weather` : `${o.label} summers`,
      remove: (x) => ({ ...x, filters: applySummer(x.filters, 'any') }),
    });
  } else if (!su && s.filters.summerTarget != null) {
    out.push({
      key: 'summer', icon: '🌡️', label: `Summers ~${s.filters.summerTarget} °C`,
      remove: (x) => ({ ...x, filters: applySummer(x.filters, 'any') }),
    });
  }
  for (const k of activeVibes(s)) {
    const v = vibe(k);
    out.push({ key: k, icon: v.icon, label: v.label, remove: (x) => v.off(x) });
  }
  if (s.filters.buying) {
    out.push({
      key: 'budget', icon: '💶',
      label: `≤ €${Math.round(s.filters.budget / 1000)}k · ${s.filters.minM2} m²`,
      remove: (x) => setBuying(x, false),
    });
  }
  if (s.filters.favourites.length) {
    out.push({
      key: 'likes', icon: '♥', label: `${s.filters.favourites.length} liked`,
      remove: (x) => ({ ...x, filters: { ...x.filters, favourites: [] } }),
    });
  }
  return out;
}

// ------------------------------------------------------------- taste deck

/**
 * A handful of places to react to, spread out rather than the top ten in a
 * row. The top of a ranking is usually one region ten times over, and liking
 * ten neighbours teaches the taste model only that you like that region.
 *
 * Greedy farthest-point selection over a few features people react to at a
 * glance (summer heat, sea, mountains, size, culture), with a nudge toward
 * places that score well and a penalty for repeating a country.
 */
export function tasteSample(
  candidates: Array<{ town: Town; score: number }>,
  n: number,
  exclude: ReadonlySet<string>,
  culture: (t: Town) => number,
): Town[] {
  const pool = candidates.filter((c) => !exclude.has(c.town.id)).slice(0, 600);
  if (!pool.length) return [];
  const feat = (t: Town) => [
    Math.min(1, Math.max(0, (t.hottestTmax - 16) / 20)),
    t.coastKm == null ? 0.5 : Math.min(1, t.coastKm / 60),
    t.relief25km == null ? 0 : Math.min(1, t.relief25km / 1500),
    Math.min(1, Math.max(0, (Math.log10(Math.max(t.pop, 1)) - 3) / 3.5)),
    culture(t),
  ];
  const fs = pool.map((c) => feat(c.town));
  const top = pool[0].score || 1;
  const chosen: number[] = [0];
  const countries = new Map<string, number>([[pool[0].town.country, 1]]);
  const minDist = fs.map((f) => dist(f, fs[0]));
  while (chosen.length < Math.min(n, pool.length)) {
    let best = -1;
    let bestVal = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      if (chosen.includes(i)) continue;
      const repeat = countries.get(pool[i].town.country) ?? 0;
      const val = minDist[i] + 0.35 * (pool[i].score / top) - 0.25 * repeat;
      if (val > bestVal) {
        bestVal = val;
        best = i;
      }
    }
    if (best < 0) break;
    chosen.push(best);
    countries.set(pool[best].town.country, (countries.get(pool[best].town.country) ?? 0) + 1);
    for (let i = 0; i < pool.length; i++) minDist[i] = Math.min(minDist[i], dist(fs[i], fs[best]));
  }
  return chosen.map((i) => pool[i].town);
}

function dist(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

/** A country's flag, from its ISO code, without shipping a single image. */
export function flag(cc: string): string {
  if (!/^[A-Z]{2}$/.test(cc)) return '';
  return String.fromCodePoint(...[...cc].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}
