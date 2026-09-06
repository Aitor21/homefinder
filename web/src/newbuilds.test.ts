import { describe, it, expect } from 'vitest';
import { parseListingsCsv, normaliseStatus } from './listings';
import type { Town } from './types';

/**
 * Rows shaped like a real developer list: mixed English and Spanish headings,
 * a superscript in the area column, thousands separators in the English style,
 * a dozen spellings of one construction stage, and several rows that have no
 * price because they have not launched. Each case here is one that silently
 * broke the importer before.
 */
const CSV = [
  'Priority,Municipality,Development / Property,Developer / Promoter,m²,Price (€),' +
    'Construction Status,Expected Completion,VPO / VPT?,Notes',
  '⭐⭐⭐⭐⭐,Bilbao,Torre Uno,Some Promotor,"91.00","499,000",New build / selling,Q1 2027,,central',
  '⭐⭐⭐⭐,Gijon,Playa Dos,Otra Promotora,"142.00","459,000",Construction started June 2026,2027,,',
  '⭐⭐⭐⭐,Somo,Tres Olas,Tercera,"80.00","395,000",New launch 2026,,,coastal',
  '⭐⭐⭐⭐⭐,Berango,Cuatro Vientos,Cuarta,,,Future / Pre-launch,,YES,not launched yet',
  '⭐⭐⭐⭐,Igorre,Cinco Robles,Quinta,,,Second phase / Waiting list,,,waiting list open',
].join('\n');

const town = (over: Partial<Town>): Town =>
  ({ id: 'X', name: 'X', country: 'ES', pop: 1000, eurM2: 3000, ...over } as Town);

const TOWNS: Town[] = [
  town({ id: 'ES-48020', name: 'Bilbao', pop: 345_000, eurM2: 3400 }),
  // GeoNames writes the bilingual form; a human writes one half of it.
  town({ id: 'ES-33024', name: 'Gijón/Xixón', pop: 271_000, eurM2: 2340 }),
  town({ id: 'ES-39060', name: 'Ribamontán al Mar', pop: 4_400, eurM2: 1450 }),
  town({ id: 'ES-48016', name: 'Berango', pop: 6_900, eurM2: 3100 }),
  town({ id: 'ES-48044', name: 'Igorre', pop: 4_200, eurM2: 1900 }),
];

describe('new-build list import', () => {
  const { listings, errors } = parseListingsCsv(CSV, TOWNS);

  it('keeps rows that have no price yet', () => {
    // These are the developments worth tracking early. Requiring a price threw
    // away exactly them: on a real 33-row list it kept 11.
    expect(listings).toHaveLength(5);
    expect(listings.filter((l) => l.price == null)).toHaveLength(2);
    expect(errors).toEqual([]);
  });

  it('reads an area column headed with a superscript two', () => {
    // "m²" is not "m2" to a string comparison, so this column was never found
    // and no listing could be priced per metre.
    expect(listings[0].m2).toBe(91);
  });

  it('reads thousands separators in the English convention', () => {
    // "499,000" was parsed as 499 by a reader that assumed Spanish notation,
    // and a EUR 499 flat then looked like the bargain of the century.
    expect(listings[0].price).toBe(499_000);
    expect(listings[0].eurM2).toBeCloseTo(499_000 / 91, 4);
  });

  it('still reads the Spanish convention', () => {
    const es = parseListingsCsv(
      ['municipio,precio,m2', 'Bilbao,"499.000","91,5"'].join('\n'),
      TOWNS,
    );
    expect(es.listings[0].price).toBe(499_000);
    expect(es.listings[0].m2).toBeCloseTo(91.5, 4);
  });

  it('resolves bilingual names and localities that are not municipalities', () => {
    expect(listings[1].townName).toBe('Gijón/Xixón');
    // Somo is a village in Ribamontán al Mar. Its nearest municipal centroid
    // belongs to a different municipality, so resolving by distance would be
    // wrong here.
    expect(listings[2].townName).toBe('Ribamontán al Mar');
  });

  it('collapses the free-text stages into four ordered ones', () => {
    expect(listings.map((l) => l.status)).toEqual([
      'ready', 'building', 'ready', 'pipeline', 'waiting',
    ]);
    // "Pre-launch" and "New launch" have to land on opposite sides.
    expect(normaliseStatus('Future / Pre-launch')).toBe('pipeline');
    expect(normaliseStatus('New launch 2026')).toBe('ready');
    expect(normaliseStatus('En construcción')).toBe('building');
    expect(normaliseStatus('')).toBeUndefined();
  });

  it('compares each price with what its municipality costs', () => {
    // Bilbao at 499k over 91 m2 is 5,484/m2 against a town figure of 3,400.
    expect(listings[0].vsTownPct).toBeCloseTo((499_000 / 91 / 3400 - 1) * 100, 4);
    expect(listings[3].vsTownPct).toBeUndefined();
  });

  it('reads a star rating and a protected-housing flag as they are written', () => {
    expect(listings[0].priority).toBe(5);
    expect(listings[1].priority).toBe(4);
    expect(listings[3].official).toBe(true);
    expect(listings[0].official).toBeUndefined();
  });

  it('refuses a file it cannot place on the map', () => {
    const { errors: e } = parseListingsCsv('a,b\n1,2', TOWNS);
    expect(e[0]).toMatch(/municipality/);
  });
});
