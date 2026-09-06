/**
 * Where the user is starting from.
 *
 * The app was built for one person in Spain and quietly assumed it everywhere:
 * the cost of living was indexed to Spain, the questionnaire offered Spanish
 * cities first, and the ownership rules talked about "a Spanish passport". None
 * of that is true for someone in Lyon or Utrecht, and all of it was fixable
 * because the underlying data was never Spanish, only its presentation.
 *
 * One setting drives the lot. It is deliberately not a filter: it does not
 * remove any place from the results, it changes what the numbers are measured
 * against.
 */
import type { Town } from './types';

export const HOME_KEY = 'homefinder.home.v1';

/**
 * The EU and EFTA. Anyone holding one of these passports gets the same answer
 * from the residence and ownership fields, which is why the app can generalise
 * from one country to all of them without re-deriving anything.
 */
export const FREE_MOVEMENT = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES',
  'SE', 'IS', 'LI', 'NO', 'CH',
]);

/**
 * A first guess from the browser, so the app is not wrong by default for
 * everyone who is not Spanish. Only a guess: the picker is always visible and
 * a language tag is not a residence.
 */
export function guessHome(countriesPresent: Set<string>): string | null {
  const tags = typeof navigator === 'undefined' ? [] : [navigator.language, ...(navigator.languages ?? [])];
  for (const tag of tags) {
    if (!tag) continue;
    // "nl-NL" -> NL. A bare "de" carries no region and is not usable.
    const region = tag.split('-')[1]?.toUpperCase();
    if (region && countriesPresent.has(region)) return region;
  }
  return null;
}

export function loadHome(countriesPresent: Set<string>): string | null {
  try {
    const saved = localStorage.getItem(HOME_KEY);
    if (saved && countriesPresent.has(saved)) return saved;
  } catch {
    /* private mode: fall through to the guess */
  }
  return guessHome(countriesPresent);
}

export function saveHome(cc: string | null) {
  try {
    if (cc) localStorage.setItem(HOME_KEY, cc);
    else localStorage.removeItem(HOME_KEY);
  } catch {
    /* nothing to do; the setting is a convenience, not state we depend on */
  }
}

/**
 * The cost-of-living index of a country, read off the dataset.
 *
 * The pipeline rebases every country to Spain = 100 because Spain is where the
 * price series it is calibrated against lives. That is an implementation
 * detail, and showing it to a Dutch user as though the Netherlands being "126"
 * were a fact about the Netherlands is just confusing. Every place in a country
 * carries the same index, so the country's own value is simply the first one.
 */
export function countryCostIndex(towns: Town[], cc: string | null): number | null {
  if (!cc) return null;
  for (const t of towns) {
    if (t.country === cc && t.costIndex != null) return t.costIndex;
  }
  return null;
}

/**
 * Rebase a cost index so the user's own country reads 100.
 *
 * "20% cheaper than where I live now" is a thought someone can act on.
 * "97 on a scale anchored to Spain" is not, unless you live in Spain.
 */
export function rebaseCost(value: number | null, homeIndex: number | null): number | null {
  if (value == null) return null;
  if (!homeIndex) return value;
  return Math.round((value / homeIndex) * 100);
}

/** Country name for display, taken from the data rather than a second list. */
export function countryName(towns: Town[], cc: string | null): string | null {
  if (!cc) return null;
  const hit = towns.find((t) => t.country === cc);
  return hit?.countryName ?? null;
}

/**
 * Countries the user can pick as home, in name order.
 *
 * Drawn from the dataset rather than hardcoded, so it cannot drift out of step
 * with what the app actually knows about.
 */
export function homeOptions(towns: Town[]): Array<{ cc: string; name: string }> {
  const seen = new Map<string, string>();
  for (const t of towns) if (!seen.has(t.country)) seen.set(t.country, t.countryName);
  return [...seen].map(([cc, name]) => ({ cc, name })).sort((a, b) => a.name.localeCompare(b.name));
}
