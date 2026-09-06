import { describe, it, expect } from 'vitest';
import { developersFor, provinceCode } from './developers';
import type { Developer, Town } from './types';

const town = (over: Partial<Town>): Town =>
  ({ id: 'ES-48020', name: 'Bilbao', country: 'ES', ...over } as Town);

const dev = (over: Partial<Developer> & { name: string }): Developer =>
  ({
    site: 'https://x',
    promotions: 'https://x',
    scope: 'national',
    countries: ['ES'],
    provinces: [],
    scale: 'medium',
    note: '',
    ...over,
  } as Developer);

const REGISTRY: Record<string, Developer> = {
  bignational: dev({ name: 'Big National', scope: 'national', scale: 'very large' }),
  smallnational: dev({ name: 'Small National', scope: 'national', scale: 'small' }),
  basque: dev({ name: 'Basque Local', scope: 'regional', provinces: ['48', '20'], scale: 'medium' }),
  tinybasque: dev({ name: 'Tiny Basque', scope: 'regional', provinces: ['48'], scale: 'small' }),
  andalusian: dev({ name: 'Andalusian', scope: 'regional', provinces: ['41'], scale: 'large' }),
  agency: dev({ name: 'Public Agency', scope: 'public', provinces: ['48'], scale: 'medium' }),
  finnish: dev({ name: 'Finnish Only', scope: 'national', countries: ['FI'], scale: 'large' }),
};

describe('province code', () => {
  it('reads the province out of the INE code the id carries', () => {
    expect(provinceCode(town({ id: 'ES-48020' }))).toBe('48');
    expect(provinceCode(town({ id: 'ES-01059' }))).toBe('01');
  });

  it('is null outside Spain, where there is no INE code to read', () => {
    expect(provinceCode(town({ id: 'JP-2128441', country: 'JP' }))).toBeNull();
  });
});

describe('developers for a place', () => {
  const hits = developersFor(town({ id: 'ES-48020' }), REGISTRY);

  it('puts the public housing agency first of all', () => {
    // It allocates by ballot from a registry you must join BEFORE anything is
    // announced, so finding it late is finding it too late.
    expect(hits[0].name).toBe('Public Agency');
  });

  it('then the companies that build in this province', () => {
    // In the Basque Country the regional firms build more than the listed
    // majors do, so ranking by fame would bury the relevant ones.
    expect(hits.slice(1, 3).map((d) => d.name)).toEqual(['Basque Local', 'Tiny Basque']);
    expect(hits.slice(0, 3).every((d) => d.local)).toBe(true);
  });

  it('excludes a company that does not build in this country', () => {
    expect(hits.some((d) => d.name === 'Finnish Only')).toBe(false);
  });

  it('keeps nationals but marks them as not specific to here', () => {
    const nat = hits.find((d) => d.name === 'Big National')!;
    expect(nat.local).toBe(false);
    // Ordered by size among themselves.
    const names = hits.filter((d) => !d.local).map((d) => d.name);
    expect(names).toEqual(['Big National', 'Small National']);
  });

  it('excludes a regional that does not build in this province', () => {
    expect(hits.some((d) => d.name === 'Andalusian')).toBe(false);
  });

  it('returns nothing outside Spain rather than guessing', () => {
    // The registry is Spanish and its province codes mean nothing elsewhere.
    expect(developersFor(town({ id: 'JP-2128441', country: 'JP' }), REGISTRY)).toEqual([]);
  });

  it('survives a dataset built before the registry existed', () => {
    expect(developersFor(town({}), undefined)).toEqual([]);
  });
});
