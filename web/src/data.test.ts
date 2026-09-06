import { describe, it, expect } from 'vitest';
import { hydrate } from './data';

const meta = {
  built: '2026-09-03 00:00',
  count: 3,
  priceQuarter: 'T1A2026',
  sources: {},
};

describe('columnar hydration', () => {
  it('rebuilds rows and expands the string dictionaries', () => {
    const doc = {
      format: 'columnar-1',
      meta,
      n: 3,
      dict: {
        country: ['ES', 'FR'],
        priceSource: ['country', 'observed'],
      },
      cols: {
        id: ['ES-48020', 'FR-123', 'ES-27028'],
        name: ['Bilbao', 'Rennes', 'Lugo'],
        country: [0, 1, 0],
        priceSource: [1, 0, 1],
        eurM2: [3402, 3100, 1360],
        monthlyTmax: [[1, 2], [3, 4], [5, 6]],
      },
    };
    const { towns } = hydrate(doc as never);
    expect(towns).toHaveLength(3);
    expect(towns[0].name).toBe('Bilbao');
    expect(towns[0].country).toBe('ES');
    expect(towns[0].priceSource).toBe('observed');
    expect(towns[1].country).toBe('FR');
    expect(towns[1].priceSource).toBe('country');
    expect(towns[2].eurM2).toBe(1360);
    expect(towns[1].monthlyTmax).toEqual([3, 4]);
  });

  it('keeps nulls null rather than turning them into dictionary lookups', () => {
    const doc = {
      format: 'columnar-1',
      meta: { ...meta, count: 1 },
      n: 1,
      dict: { airportName: ['BIO'] },
      cols: { id: ['ES-1'], airportName: [null], supermarketKm: [null] },
    };
    const { towns } = hydrate(doc as never);
    expect(towns[0].airportName).toBeNull();
    expect(towns[0].supermarketKm).toBeNull();
  });

  it('passes an old row-based file straight through', () => {
    const doc = { meta, towns: [{ id: 'ES-1', name: 'Old' }] };
    const out = hydrate(doc as never);
    expect(out.towns[0].name).toBe('Old');
  });
});
