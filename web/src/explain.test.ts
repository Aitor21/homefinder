import { describe, expect, it } from 'vitest';
import { reasons, topShare, typicalOf, type ExplainCtx } from './explain';
import { groupAreas } from './areas';
import { mergeDuplicates } from './data';
import { breakdown, weightedScore, type Ranked } from './scoring';
import { DEFAULT_FILTERS, DEFAULT_WEIGHTS, type Weights } from './types';
import { town } from './fixtures';

const W: Weights = { ...DEFAULT_WEIGHTS, coast: 8 };
const rankedOf = (over: Parameters<typeof town>[0]): Ranked => {
  const t = town(over);
  const b = breakdown(t, DEFAULT_FILTERS, { refs: [] });
  return { town: t, score: weightedScore(b, W), breakdown: b };
};

describe('reasons', () => {
  const list = [
    ...Array.from({ length: 20 }, (_, i) => rankedOf({ id: `IN-${i}`, coastKm: 90 })),
    rankedOf({ id: 'SEA', coastKm: 1 }),
  ];
  const ctx: ExplainCtx = {
    weights: W, typical: typicalOf(list), budget: 400_000, summerTarget: null,
  };

  it('names what sets a place apart from the rest of the list, with the number', () => {
    const r = reasons(list[list.length - 1], ctx);
    expect(r[0]).toMatchObject({ dim: 'coast', kind: 'strength', text: 'On the coast' });
  });

  it('calls out a weighted dimension that is poor as a trade-off', () => {
    const far = rankedOf({ id: 'FAR', coastKm: 300, hubKm: 400, airportKm: 400 });
    const r = reasons(far, { ...ctx, typical: typicalOf([...list, far]) });
    expect(r.some((x) => x.kind === 'tradeoff' && x.dim === 'airport')).toBe(true);
  });

  it('ignores dimensions weighted below a nudge', () => {
    const r = reasons(list[list.length - 1], { ...ctx, weights: { ...W, coast: 1 } });
    expect(r.find((x) => x.dim === 'coast')).toBeUndefined();
  });

  it('reads living costs against home when home is known', () => {
    const cheap = rankedOf({ id: 'C', costIndex: 50 });
    const r = reasons(cheap, {
      ...ctx, weights: { ...W, livingCost: 9 }, homeIndex: 100, homeName: 'Spain', typical: { livingCost: 0.4 },
    });
    expect(r.find((x) => x.dim === 'livingCost')?.text).toBe('Everyday costs 50% below Spain');
  });
});

it('describes a rank as a share of the list', () => {
  expect(topShare(1, 500)).toBe('Top 1%');
  expect(topShare(20, 500)).toBe('Top 4%');
  expect(topShare(120, 500)).toBe('Top 25%');
});

describe('areas', () => {
  it('groups by region, best area and best place first', () => {
    const mk = (id: string, province: string, score: number): Ranked => ({
      town: town({ id, province }), score, breakdown: {} as Ranked['breakdown'],
    });
    const areas = groupAreas([mk('a1', 'A', 90), mk('b1', 'B', 88), mk('a2', 'A', 85), mk('b2', 'B', 89)]);
    expect(areas.map((a) => a.name)).toEqual(['A', 'B']);
    expect(areas[1].places.map((p) => p.town.id)).toEqual(['b2', 'b1']);
    expect(areas[0].places).toHaveLength(2);
  });
});

describe('duplicate places', () => {
  it('merges one place listed twice under near-identical names, keeping the larger', () => {
    const out = mergeDuplicates([
      town({ id: 'PT-1', name: 'Costa de Caparica', lat: 38.64, lon: -9.235, pop: 13_000 }),
      town({ id: 'PT-2', name: 'Costa da Caparica', lat: 38.642, lon: -9.236, pop: 11_000 }),
    ]);
    expect(out.map((t) => t.id)).toEqual(['PT-1']);
  });

  it('keeps separate towns that are merely close, or merely similarly named', () => {
    const near = mergeDuplicates([
      town({ id: 'FR-1', name: 'Nancy', lat: 48.69, lon: 6.18 }),
      town({ id: 'FR-2', name: 'Villers-lès-Nancy', lat: 48.67, lon: 6.15 }),
    ]);
    expect(near).toHaveLength(2);
    const far = mergeDuplicates([
      town({ id: 'US-1', name: 'Portland', lat: 45.52, lon: -122.68 }),
      town({ id: 'US-2', name: 'Portland', lat: 43.66, lon: -70.26 }),
    ]);
    expect(far).toHaveLength(2);
  });
});
