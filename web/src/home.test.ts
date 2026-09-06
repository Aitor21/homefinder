import { describe, it, expect } from 'vitest';
import { countryCostIndex, rebaseCost, homeOptions, FREE_MOVEMENT } from './home';
import type { Town } from './types';

const town = (cc: string, name: string, ci: number | null): Town =>
  ({ id: `${cc}-1`, country: cc, countryName: name, costIndex: ci } as Town);

const TOWNS = [
  town('ES', 'Spain', 100),
  town('NL', 'Netherlands', 126),
  town('PL', 'Poland', 79),
  town('XX', 'Nowhere', null),
];

describe('home country', () => {
  it('reads a country index off the data rather than a second list', () => {
    expect(countryCostIndex(TOWNS, 'NL')).toBe(126);
    expect(countryCostIndex(TOWNS, 'XX')).toBeNull();
    expect(countryCostIndex(TOWNS, null)).toBeNull();
  });

  it('rebases so the user\'s own country reads 100', () => {
    // A Dutch user should read Poland as clearly cheaper than home, not as
    // "79" on a scale anchored to a country they have never lived in.
    expect(rebaseCost(126, 126)).toBe(100);
    expect(rebaseCost(79, 126)).toBe(63);
    expect(rebaseCost(100, 126)).toBe(79);
  });

  it('leaves the stored scale alone when no home is set', () => {
    expect(rebaseCost(79, null)).toBe(79);
    expect(rebaseCost(null, 126)).toBeNull();
  });

  it('offers every country in the data, in name order', () => {
    expect(homeOptions(TOWNS).map((o) => o.cc)).toEqual(['NL', 'XX', 'PL', 'ES']);
  });

  it('knows which passports the residence rules actually apply to', () => {
    // The rules were written from a Spanish passport, but every EU/EFTA
    // passport gets the same answer, which is why they generalise.
    for (const cc of ['ES', 'FR', 'NL', 'DE', 'NO', 'CH']) {
      expect(FREE_MOVEMENT.has(cc)).toBe(true);
    }
    expect(FREE_MOVEMENT.has('GB')).toBe(false);
    expect(FREE_MOVEMENT.has('US')).toBe(false);
  });
});
