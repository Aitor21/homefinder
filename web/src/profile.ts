/**
 * The questionnaire: turning what someone can actually judge into filter values.
 *
 * Nobody knows whether they want "fewer than 12 nights above 20 C". Everybody
 * knows whether they suffered in Madrid. So the questionnaire asks for places
 * rather than numbers, reads those places' real measurements out of the dataset,
 * and derives the thresholds from them.
 *
 * The important subtlety: two cities can be unbearable for opposite reasons.
 * Madrid runs 66 days over 30 C but cools at night; Barcelona manages only 18
 * such days yet gives you 68 tropical nights. Someone who rejects both is
 * telling you about *two different* limits, so each metric takes the MINIMUM
 * across the rejected cities -- the strictest complaint per axis, not an average
 * that would wash both out.
 *
 * A second guarantee: if you also name places that felt right, the thresholds
 * are relaxed as far as needed to keep those places in the results. A profile
 * that excludes the city you said you liked is simply a bug.
 */
import type { Filters, Town, Weights } from './types';
import { DEFAULT_FILTERS, DEFAULT_WEIGHTS } from './types';

export type Strictness = 'clearly' | 'much' | 'max';
/** Which way the places you ruled out were wrong. */
export type Want = 'cooler' | 'warmer';
export type DayShape = 'wfh' | 'hybrid' | 'commute';
export type PlaceSize = 'city' | 'edge' | 'town' | 'any';
export type Flying = 'often' | 'sometimes' | 'rarely';
export type WinterTaste = 'love-cold' | 'dont-mind' | 'prefer-mild';
export type Essential = 'train' | 'hospital' | 'coast' | 'mountains' | 'bike' | 'observed-price';

export interface Answers {
  ruledOut: string[];
  want: Want;
  feltRight: string[];
  strictness: Strictness;
  day: DayShape;
  placeSize: PlaceSize;
  flying: Flying;
  winter: WinterTaste;
  budget: number;
  minM2: number;
  essentials: Essential[];
}

export const DEFAULT_ANSWERS: Answers = {
  ruledOut: [],
  want: 'cooler',
  feltRight: [],
  strictness: 'clearly',
  day: 'wfh',
  placeSize: 'any',
  flying: 'sometimes',
  winter: 'dont-mind',
  budget: 400_000,
  minM2: 80,
  essentials: [],
};

/**
 * Cities offered as reference points, matched by name at load time rather than
 * by hardcoded id. GeoNames ids are opaque and change between dumps; names plus
 * a country code are stable and readable. Anything that fails to resolve is
 * simply dropped from the list.
 */
export const REFERENCE_CITIES: Array<{ match: string; cc: string; label: string }> = [
  // Ordered by country below, but resolveReferences() puts the user's own
  // country first at runtime: the places you can judge are the ones near you.
  { match: 'Madrid', cc: 'ES', label: 'Madrid' },
  { match: 'Barcelona', cc: 'ES', label: 'Barcelona' },
  { match: 'Valencia', cc: 'ES', label: 'Valencia' },
  { match: 'Seville', cc: 'ES', label: 'Seville' },
  { match: 'Malaga', cc: 'ES', label: 'Malaga' },
  { match: 'Murcia', cc: 'ES', label: 'Murcia' },
  { match: 'Zaragoza', cc: 'ES', label: 'Zaragoza' },
  { match: 'Bilbao', cc: 'ES', label: 'Bilbao' },
  { match: 'Santander', cc: 'ES', label: 'Santander' },
  { match: 'Oviedo', cc: 'ES', label: 'Oviedo' },
  { match: 'A Coruna', cc: 'ES', label: 'A Coruna' },
  { match: 'Vigo', cc: 'ES', label: 'Vigo' },
  { match: 'Burgos', cc: 'ES', label: 'Burgos' },
  { match: 'Granada', cc: 'ES', label: 'Granada' },
  // The rest of Europe, spanning the continent's climate range.
  { match: 'Lisbon', cc: 'PT', label: 'Lisbon' },
  { match: 'Porto', cc: 'PT', label: 'Porto' },
  { match: 'Paris', cc: 'FR', label: 'Paris' },
  { match: 'Lyon', cc: 'FR', label: 'Lyon' },
  { match: 'Marseille', cc: 'FR', label: 'Marseille' },
  { match: 'Bordeaux', cc: 'FR', label: 'Bordeaux' },
  { match: 'Rennes', cc: 'FR', label: 'Rennes' },
  { match: 'Rome', cc: 'IT', label: 'Rome' },
  { match: 'Milan', cc: 'IT', label: 'Milan' },
  { match: 'Turin', cc: 'IT', label: 'Turin' },
  { match: 'Naples', cc: 'IT', label: 'Naples' },
  { match: 'Berlin', cc: 'DE', label: 'Berlin' },
  { match: 'Munich', cc: 'DE', label: 'Munich' },
  { match: 'Hamburg', cc: 'DE', label: 'Hamburg' },
  { match: 'Koln', cc: 'DE', label: 'Cologne' },
  { match: 'Frankfurt am Main', cc: 'DE', label: 'Frankfurt' },
  { match: 'Stuttgart', cc: 'DE', label: 'Stuttgart' },
  { match: 'Vienna', cc: 'AT', label: 'Vienna' },
  { match: 'Zurich', cc: 'CH', label: 'Zurich' },
  { match: 'Geneva', cc: 'CH', label: 'Geneva' },
  { match: 'Amsterdam', cc: 'NL', label: 'Amsterdam' },
  { match: 'Brussels', cc: 'BE', label: 'Brussels' },
  { match: 'Dublin', cc: 'IE', label: 'Dublin' },
  { match: 'Cork', cc: 'IE', label: 'Cork' },
  { match: 'Copenhagen', cc: 'DK', label: 'Copenhagen' },
  { match: 'Stockholm', cc: 'SE', label: 'Stockholm' },
  { match: 'Oslo', cc: 'NO', label: 'Oslo' },
  { match: 'Bergen', cc: 'NO', label: 'Bergen' },
  { match: 'Helsinki', cc: 'FI', label: 'Helsinki' },
  { match: 'Reykjavik', cc: 'IS', label: 'Reykjavik' },
  { match: 'Prague', cc: 'CZ', label: 'Prague' },
  { match: 'Warsaw', cc: 'PL', label: 'Warsaw' },
  { match: 'Krakow', cc: 'PL', label: 'Krakow' },
  { match: 'Budapest', cc: 'HU', label: 'Budapest' },
  { match: 'Ljubljana', cc: 'SI', label: 'Ljubljana' },
  { match: 'Zagreb', cc: 'HR', label: 'Zagreb' },
  { match: 'Athens', cc: 'GR', label: 'Athens' },
  { match: 'Bucharest', cc: 'RO', label: 'Bucharest' },
  { match: 'Sofia', cc: 'BG', label: 'Sofia' },
  { match: 'Tallinn', cc: 'EE', label: 'Tallinn' },
  { match: 'Riga', cc: 'LV', label: 'Riga' },
  { match: 'Vilnius', cc: 'LT', label: 'Vilnius' },
  // Asia -- useful as anti-references even where you could never buy.
  { match: 'Tokyo', cc: 'JP', label: 'Tokyo' },
  { match: 'Osaka', cc: 'JP', label: 'Osaka' },
  { match: 'Sapporo', cc: 'JP', label: 'Sapporo' },
  { match: 'Kyoto', cc: 'JP', label: 'Kyoto' },
  { match: 'Nagano', cc: 'JP', label: 'Nagano' },
  { match: 'Seoul', cc: 'KR', label: 'Seoul' },
  { match: 'Taipei', cc: 'TW', label: 'Taipei' },
  { match: 'Bangkok', cc: 'TH', label: 'Bangkok' },
  { match: 'Chiang Mai', cc: 'TH', label: 'Chiang Mai' },
  { match: 'Singapore', cc: 'SG', label: 'Singapore' },
  { match: 'Kuala Lumpur', cc: 'MY', label: 'Kuala Lumpur' },
  { match: 'Hong Kong', cc: 'HK', label: 'Hong Kong' },
  { match: 'Tbilisi', cc: 'GE', label: 'Tbilisi' },
  { match: 'Istanbul', cc: 'TR', label: 'Istanbul' },
  { match: 'Almaty', cc: 'KZ', label: 'Almaty' },
  { match: 'Dubai', cc: 'AE', label: 'Dubai' },
  { match: 'Manila', cc: 'PH', label: 'Manila' },
  { match: 'Jakarta', cc: 'ID', label: 'Jakarta' },
  { match: 'Hanoi', cc: 'VN', label: 'Hanoi' },
  { match: 'Kunming', cc: 'CN', label: 'Kunming' },
  { match: 'Beijing', cc: 'CN', label: 'Beijing' },
  { match: 'Shanghai', cc: 'CN', label: 'Shanghai' },
  { match: 'New Delhi', cc: 'IN', label: 'Delhi' },
  // The Americas. The highland tropics matter most here: Bogota, Quito, Cuenca
  // and Mexico City are never hot in a way no European latitude can manage.
  { match: 'New York City', cc: 'US', label: 'New York' },
  { match: 'Seattle', cc: 'US', label: 'Seattle' },
  { match: 'Portland', cc: 'US', label: 'Portland OR' },
  { match: 'San Francisco', cc: 'US', label: 'San Francisco' },
  { match: 'Denver', cc: 'US', label: 'Denver' },
  { match: 'Boston', cc: 'US', label: 'Boston' },
  { match: 'Chicago', cc: 'US', label: 'Chicago' },
  { match: 'Miami', cc: 'US', label: 'Miami' },
  { match: 'Austin', cc: 'US', label: 'Austin' },
  { match: 'Honolulu', cc: 'US', label: 'Honolulu' },
  { match: 'Vancouver', cc: 'CA', label: 'Vancouver' },
  { match: 'Toronto', cc: 'CA', label: 'Toronto' },
  { match: 'Montreal', cc: 'CA', label: 'Montreal' },
  { match: 'Mexico City', cc: 'MX', label: 'Mexico City' },
  { match: 'Guadalajara', cc: 'MX', label: 'Guadalajara' },
  { match: 'Merida', cc: 'MX', label: 'Merida' },
  { match: 'Bogota', cc: 'CO', label: 'Bogota' },
  { match: 'Medellin', cc: 'CO', label: 'Medellin' },
  { match: 'Quito', cc: 'EC', label: 'Quito' },
  { match: 'Cuenca', cc: 'EC', label: 'Cuenca' },
  { match: 'Lima', cc: 'PE', label: 'Lima' },
  { match: 'Santiago', cc: 'CL', label: 'Santiago' },
  { match: 'Valdivia', cc: 'CL', label: 'Valdivia' },
  { match: 'Buenos Aires', cc: 'AR', label: 'Buenos Aires' },
  { match: 'San Carlos de Bariloche', cc: 'AR', label: 'Bariloche' },
  { match: 'Mendoza', cc: 'AR', label: 'Mendoza' },
  { match: 'Montevideo', cc: 'UY', label: 'Montevideo' },
  { match: 'Sao Paulo', cc: 'BR', label: 'Sao Paulo' },
  { match: 'Rio de Janeiro', cc: 'BR', label: 'Rio de Janeiro' },
  { match: 'Curitiba', cc: 'BR', label: 'Curitiba' },
  { match: 'Florianopolis', cc: 'BR', label: 'Florianopolis' },
  { match: 'San Jose', cc: 'CR', label: 'San Jose CR' },
  { match: 'Panama City', cc: 'PA', label: 'Panama City' },
  // Europe outside the EU, now that it is in the dataset.
  { match: 'London', cc: 'GB', label: 'London' },
  { match: 'Edinburgh', cc: 'GB', label: 'Edinburgh' },
  { match: 'Manchester', cc: 'GB', label: 'Manchester' },
  { match: 'Bristol', cc: 'GB', label: 'Bristol' },
  { match: 'Belgrade', cc: 'RS', label: 'Belgrade' },
  { match: 'Podgorica', cc: 'ME', label: 'Podgorica' },
  // Oceania and Africa.
  { match: 'Sydney', cc: 'AU', label: 'Sydney' },
  { match: 'Melbourne', cc: 'AU', label: 'Melbourne' },
  { match: 'Brisbane', cc: 'AU', label: 'Brisbane' },
  { match: 'Perth', cc: 'AU', label: 'Perth' },
  { match: 'Hobart', cc: 'AU', label: 'Hobart' },
  { match: 'Auckland', cc: 'NZ', label: 'Auckland' },
  { match: 'Wellington', cc: 'NZ', label: 'Wellington' },
  { match: 'Christchurch', cc: 'NZ', label: 'Christchurch' },
  { match: 'Cape Town', cc: 'ZA', label: 'Cape Town' },
  { match: 'Johannesburg', cc: 'ZA', label: 'Johannesburg' },
  { match: 'Marrakesh', cc: 'MA', label: 'Marrakesh' },
  { match: 'Casablanca', cc: 'MA', label: 'Casablanca' },
  { match: 'Nairobi', cc: 'KE', label: 'Nairobi' },
  { match: 'Addis Ababa', cc: 'ET', label: 'Addis Ababa' },
  { match: 'Cairo', cc: 'EG', label: 'Cairo' },
];

const fold = (v: string) =>
  v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Resolve the reference list against the loaded dataset, largest match wins. */
export function resolveReferences(
  towns: Town[],
  home?: string | null,
): Array<{ id: string; label: string }> {
  const byKey = new Map<string, Town>();
  for (const t of towns) {
    const k = `${t.country}|${fold(t.name)}`;
    const prev = byKey.get(k);
    if (!prev || t.pop > prev.pop) byKey.set(k, t);
  }
  const out: Array<{ id: string; label: string; cc: string }> = [];
  for (const r of REFERENCE_CITIES) {
    const t = byKey.get(`${r.cc}|${fold(r.match)}`);
    if (t) out.push({ id: t.id, label: r.label, cc: r.cc });
  }
  // The user's own country first. The whole questionnaire rests on naming
  // places you have actually experienced, and those are overwhelmingly near
  // home: a list that opens with Madrid and Barcelona is asking a Dutch user
  // about cities they have never spent a summer in.
  if (home) {
    out.sort((a, b) => Number(b.cc === home) - Number(a.cc === home));
  }
  return out.map(({ id, label }) => ({ id, label }));
}

/** How far below the strictest rejected city each level aims. */
const RATIO: Record<Strictness, number> = { clearly: 0.6, much: 0.4, max: 0.25 };
/** Degrees C shaved off the hottest month's high. A ratio makes no sense for a temperature. */
const AUG_DROP: Record<Strictness, number> = { clearly: 1.5, much: 3, max: 4.5 };

export interface Profile {
  filters: Filters;
  weights: Weights;
  /** Plain-English account of what was set and why. Shown to the user. */
  notes: string[];
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export function buildProfile(answers: Answers, towns: Town[]): Profile {
  const byId = new Map(towns.map((t) => [t.id, t]));
  const hot = answers.ruledOut.map((i) => byId.get(i)).filter(Boolean) as Town[];
  const good = answers.feltRight.map((i) => byId.get(i)).filter(Boolean) as Town[];

  // Both lists carry through in full. The wizard has always collected several
  // places for each; until now everything after the first was thrown away.
  const filters: Filters = {
    ...DEFAULT_FILTERS,
    budget: answers.budget,
    minM2: answers.minM2,
    favourites: [...answers.feltRight],
    avoid: [...answers.ruledOut],
  };
  const weights: Weights = { ...DEFAULT_WEIGHTS };
  const notes: string[] = [];

  // --- summer thresholds, derived from the rejected cities --------------------
  if (hot.length && answers.want === 'warmer') {
    // The places you ruled out were too COLD, so they set floors rather than
    // ceilings. Everything below mirrors the cooler branch; the tool used to
    // have only that branch, which meant it silently could not serve anyone
    // looking for warmth.
    const floorAug = Math.max(...hot.map((t) => t.hottestTmax));
    const floorWinter = Math.max(...hot.map((t) => t.winterTmin));
    filters.minHotTmax = round1(floorAug + AUG_DROP[answers.strictness]);
    filters.minWinterTmin = round1(floorWinter + AUG_DROP[answers.strictness]);

    const coldest = hot.reduce((a, b) => (a.hottestTmax > b.hottestTmax ? a : b));
    notes.push(
      `Hottest-month highs floored at ${filters.minHotTmax} C. ${coldest.name} reaches ` +
        `${round1(coldest.hottestTmax)} and was still too cool, so that is the bar to clear.`,
    );
    notes.push(
      `Winter nights floored at ${filters.minWinterTmin} C, from the mildest winter ` +
        `you still rejected.`,
    );
  } else if (hot.length) {
    const r = RATIO[answers.strictness];
    const ceilDays = Math.min(...hot.map((t) => t.daysOver30));
    const ceilNights = Math.min(...hot.map((t) => t.tropicalNights));
    const ceilAug = Math.min(...hot.map((t) => t.hottestTmax));

    filters.maxDaysOver30 = Math.max(0, round1(ceilDays * r));
    filters.maxTropicalNights = Math.max(0, round1(ceilNights * r));
    filters.maxHotTmax = round1(ceilAug - AUG_DROP[answers.strictness]);

    const worstDays = hot.reduce((a, b) => (a.daysOver30 < b.daysOver30 ? a : b));
    const worstNights = hot.reduce((a, b) => (a.tropicalNights < b.tropicalNights ? a : b));
    notes.push(
      `Hot days capped at ${filters.maxDaysOver30}/yr, ${worstDays.name} has ` +
        `${round1(worstDays.daysOver30)}, and that is the tightest limit among the places you rejected.`,
    );
    notes.push(
      `Warm nights capped at ${filters.maxTropicalNights}/yr, from ${worstNights.name}, ` +
        `which has ${round1(worstNights.tropicalNights)}.`,
    );
    if (hot.length > 1 && worstDays.id !== worstNights.id) {
      notes.push(
        `${worstDays.name} and ${worstNights.name} fail you for different reasons, one by day, ` +
          `the other at night, so each sets its own limit rather than being averaged together.`,
      );
    }
  }

  // --- the summer actually wanted --------------------------------------------
  // Preferring the places you named over an inference from the ones you did
  // not: a favourite states a target directly, a rejection only bounds it.
  if (good.length) {
    const augs = good.map((t) => t.hottestTmax).sort((a, b) => a - b);
    filters.summerTarget = round1(augs[Math.floor(augs.length / 2)]);
    notes.push(
      `Summers scored against ${filters.summerTarget} C in the hottest month, the middle of the ` +
        `places you said felt right. Warmer and cooler than that are penalised equally, ` +
        `so this does not assume you are chasing a cool climate.`,
    );
  } else if (hot.length) {
    filters.summerTarget =
      answers.want === 'warmer'
        ? round1(Math.max(...hot.map((t) => t.hottestTmax)) + AUG_DROP[answers.strictness] + 2)
        : round1(Math.min(...hot.map((t) => t.hottestTmax)) - AUG_DROP[answers.strictness] - 2);
    notes.push(
      `Summers scored against ${filters.summerTarget} C in the hottest month, inferred from the ` +
        `places you ruled out. Naming somewhere that felt right would pin this down better.`,
    );
  }

  // --- never exclude a place they said felt right -----------------------------
  if (good.length) {
    const relaxDays = Math.max(...good.map((t) => t.daysOver30));
    const relaxNights = Math.max(...good.map((t) => t.tropicalNights));
    const relaxAug = Math.max(...good.map((t) => t.hottestTmax));
    const before = { ...filters };
    filters.maxDaysOver30 = Math.max(filters.maxDaysOver30, round1(relaxDays * 1.15 + 1));
    filters.maxTropicalNights = Math.max(filters.maxTropicalNights, round1(relaxNights * 1.15 + 1));
    filters.maxHotTmax = Math.max(filters.maxHotTmax, round1(relaxAug + 0.5));
    // Same guarantee in the other direction: a floor must never exclude a
    // place the user said they liked.
    const lowAug = Math.min(...good.map((t) => t.hottestTmax));
    const lowWinter = Math.min(...good.map((t) => t.winterTmin));
    filters.minHotTmax = Math.min(filters.minHotTmax, round1(lowAug - 0.5));
    filters.minWinterTmin = Math.min(filters.minWinterTmin, round1(lowWinter - 0.5));
    if (
      before.maxDaysOver30 !== filters.maxDaysOver30 ||
      before.maxTropicalNights !== filters.maxTropicalNights ||
      before.maxHotTmax !== filters.maxHotTmax
    ) {
      notes.push(
        `Loosened slightly so ${good.map((t) => t.name).join(' and ')} still appear, ` +
          `a profile that filters out the places you liked would be useless.`,
      );
    }
  }

  // --- how the day is spent ---------------------------------------------------
  if (answers.day === 'wfh') {
    weights.summerFit = 10;
    weights.city = 3;
    weights.amenities = 5;
    filters.maxCityKm = 120;
    notes.push(
      'Working from home all day makes summer heat the dominant factor: you are inside it ' +
        'for months, not commuting through it. Cool summers weighted highest, and distance ' +
        'to a city relaxed since you are not making that trip daily.',
    );
  } else if (answers.day === 'commute') {
    weights.city = 9;
    filters.maxCityKm = 45;
    notes.push('Daily commuting weights city access heavily and caps the distance at 45 km.');
  } else {
    weights.city = 6;
    filters.maxCityKm = 75;
  }

  // --- size of place ----------------------------------------------------------
  if (answers.placeSize === 'city') {
    filters.minPop = 50_000;
    notes.push('Restricted to towns of 50,000 or more.');
  } else if (answers.placeSize === 'edge') {
    filters.minPop = 3_000;
    filters.maxCityKm = Math.min(filters.maxCityKm, 30);
    weights.city = Math.max(weights.city, 7);
    notes.push('Looking for the edge of a city: at least 3,000 people and within 30 km of one.');
  } else if (answers.placeSize === 'town') {
    filters.minPop = 2_000;
    filters.maxPop = 60_000;
    weights.amenities = Math.max(weights.amenities, 6);
    notes.push('Small towns only (2,000–60,000), with local services weighted up.');
  } else {
    filters.minPop = 1_500;
  }

  // --- flying -----------------------------------------------------------------
  if (answers.flying === 'often') {
    weights.airport = 9;
    filters.maxHubMin = 45;
    filters.maxAirportMin = 35;
    notes.push(
      'Flying often: a 2M+ passenger airport within a 45-minute drive. Stated as time '
      + 'rather than distance because that is the thing you actually feel, and because '
      + '50 km across the meseta and 50 km over a mountain pass are not the same trip.',
    );
  } else if (answers.flying === 'sometimes') {
    weights.airport = 6;
    filters.maxHubMin = 90;
    filters.maxAirportMin = 60;
    notes.push('A well-connected airport within a 90-minute drive.');
  } else {
    weights.airport = 3;
    filters.maxHubMin = 180;
    filters.maxAirportMin = 120;
  }

  // --- winter and rain --------------------------------------------------------
  if (answers.winter === 'love-cold') {
    weights.winterMild = 0;
    weights.drier = 0;
    weights.sunny = 0;
    weights.mountains = 6;
    notes.push(
      'Cold, rain and grey treated as neutral rather than as penalties, and mountains ' +
        'weighted up. This is what opens up the Atlantic north and the high interior, ' +
        'the places most buyers avoid and you do not.',
    );
  } else if (answers.winter === 'prefer-mild') {
    weights.winterMild = 6;
    weights.drier = 5;
    weights.sunny = 5;
    filters.maxTropicalNights = Math.max(filters.maxTropicalNights, 5);
    notes.push(
      'Mild winters and sunshine weighted up. Note the tension: across most of Europe, cool summers ' +
        'and dry sunny winters rarely coexist, so expect this to fight the summer limits.',
    );
  } else {
    weights.winterMild = 2;
    weights.drier = 1;
  }

  // --- essentials -------------------------------------------------------------
  for (const e of answers.essentials) {
    if (e === 'train') {
      filters.maxTrainKm = 15;
      notes.push('A train station within 15 km is required.');
    } else if (e === 'coast') {
      weights.coast = 8;
      notes.push('Coast weighted up.');
    } else if (e === 'mountains') {
      weights.mountains = 8;
      notes.push('Mountains weighted up.');
    } else if (e === 'bike') {
      weights.amenities = Math.max(weights.amenities, 6);
    } else if (e === 'observed-price') {
      filters.requireObservedPrice = true;
      notes.push(
        'Restricted to towns with an officially measured price. Far fewer results, but ' +
          'no estimated figures.',
      );
    }
  }

  return { filters, weights, notes };
}

/** Count how many towns survive a profile, used for live feedback in the wizard. */
export function countMatches(
  towns: Town[],
  filters: Filters,
  reject: (t: Town, f: Filters) => string | null,
): number {
  let n = 0;
  for (const t of towns) if (!reject(t, filters)) n++;
  return n;
}
