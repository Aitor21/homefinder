import { describe, it, expect } from 'vitest';
import { portalLinks, slug } from './listings';
import { DEFAULT_FILTERS } from './types';
import type { Town } from './types';

// portalLinks only reads name, province and country, so the cast is honest here.
const town = (over: Partial<Town>): Town =>
  ({
    id: 'X-1',
    name: 'Somewhere',
    country: 'ES',
    countryName: 'Spain',
    province: 'Bizkaia',
    ...over,
  } as Town);

const f = { ...DEFAULT_FILTERS, budget: 400_000, minM2: 80 };

describe('slug', () => {
  it('strips accents and punctuation the way the portals do', () => {
    expect(slug('A Coruña')).toBe('a-coruna');
    expect(slug('Sant Cugat del Vallès')).toBe('sant-cugat-del-valles');
  });
});

describe('portal links follow the country', () => {
  it('keeps the filtered Spanish deep links for Spain', () => {
    const links = portalLinks(town({ name: 'Lugo', province: 'Lugo' }), f);
    expect(links.map((l) => l.portal)).toContain('Idealista');
    // The budget and size go through, which is the whole point of a deep link.
    expect(links[0].url).toContain('400000');
    expect(links[0].url).toContain('80');
  });

  it('does not send a Japanese town to a Spanish portal', () => {
    // The bug this replaces: every town in the world linked to Idealista, so a
    // shortlisted place in Hokkaido led to a Spanish site with nothing in it.
    const links = portalLinks(
      town({ name: 'Obihiro', country: 'JP', countryName: 'Japan', province: 'Hokkaido' }),
      f,
    );
    expect(links.length).toBeGreaterThan(0);
    for (const l of links) expect(l.url).not.toContain('idealista.com');
    expect(links.map((l) => l.portal)).toContain('SUUMO');
  });

  it('uses a path slug where the portal wants one and an encoded query otherwise', () => {
    const za = portalLinks(
      town({ name: 'Cape Town', country: 'ZA', countryName: 'South Africa', province: 'Western Cape' }),
      f,
    );
    // Property24 takes the town in the path.
    expect(za.find((l) => l.portal === 'Property24')!.url).toContain('/for-sale/cape-town');
    const us = portalLinks(
      town({ name: 'Bellingham', country: 'US', countryName: 'United States', province: 'Washington' }),
      f,
    );
    expect(us.find((l) => l.portal === 'Zillow')!.url).toContain('bellingham');
  });

  it('falls back to a plain web search rather than a dead link', () => {
    const links = portalLinks(
      town({ name: 'Nowhere', country: 'ZZ', countryName: 'Atlantis', province: 'Deep' }),
      f,
    );
    expect(links).toHaveLength(1);
    expect(links[0].url).toContain('Atlantis');
    expect(links[0].exact).toBe(true);
  });
});
