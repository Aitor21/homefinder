import { describe, expect, it } from 'vitest';
import {
  activeVibes, applyIntent, applySummer, applyWhere, buildQuickSearch, DEFAULT_QUICK, flag, quickBase,
  summaryChips, summerOf, tasteSample, toggleVibe, vibe, VIBES, whereOf,
} from './quickstart';
import { DEFAULT_FILTERS, DEFAULT_WEIGHTS, POP_ANY } from './types';
import { town } from './fixtures';

describe('where', () => {
  it('round-trips every tile through the filters', () => {
    for (const w of ['world', 'europe', 'nofuss', 'home'] as const) {
      expect(whereOf(applyWhere(DEFAULT_FILTERS, w, 'FR'), 'FR')).toBe(w);
    }
  });

  it('reads hand-picked countries as custom, not as a tile', () => {
    expect(whereOf({ ...DEFAULT_FILTERS, countries: ['ES', 'PT'] }, 'FR')).toBeNull();
  });
});

describe('summer', () => {
  it('sets a target and a band, and is recognised again', () => {
    const f = applySummer(DEFAULT_FILTERS, 'warm');
    expect(f.summerTarget).toBe(30);
    expect(f.minHotTmax).toBeLessThan(30);
    expect(f.maxHotTmax).toBeGreaterThan(30);
    expect(summerOf(f)).toBe('warm');
  });

  it('clears an old day-count ceiling rather than letting it fight the band', () => {
    const f = applySummer({ ...DEFAULT_FILTERS, maxDaysOver30: 3 }, 'hot');
    expect(f.maxDaysOver30).toBe(DEFAULT_FILTERS.maxDaysOver30);
  });

  it('"no preference" drops summer from the score entirely', () => {
    const f = applySummer(applySummer(DEFAULT_FILTERS, 'fresh'), 'any');
    expect(f.summerTarget).toBeNull();
    expect(summerOf(f)).toBe('any');
  });
});

describe('vibes', () => {
  it('every vibe switches on and off cleanly from the quick base', () => {
    for (const v of VIBES) {
      const on = toggleVibe(quickBase(), v.key);
      expect(v.isOn(on)).toBe(true);
      const off = toggleVibe(on, v.key);
      expect(v.isOn(off)).toBe(false);
    }
  });

  it('no vibe is lit on a fresh search', () => {
    expect(activeVibes(quickBase())).toEqual([]);
    expect(activeVibes({ filters: DEFAULT_FILTERS, weights: DEFAULT_WEIGHTS })).toEqual([]);
  });

  it('city and quiet are mutually exclusive', () => {
    let s = toggleVibe(quickBase(), 'city');
    s = toggleVibe(s, 'quiet');
    expect(vibe('quiet').isOn(s)).toBe(true);
    expect(vibe('city').isOn(s)).toBe(false);
    expect(s.filters.minPop).toBeLessThan(100_000);
    s = toggleVibe(s, 'quiet');
    expect(s.filters.maxPop).toBe(POP_ANY);
  });

  it('culture and festivals turn up their own weights', () => {
    const s = buildQuickSearch({ ...DEFAULT_QUICK, vibes: ['culture', 'festivals'] }, null);
    expect(s.weights.culture).toBeGreaterThan(DEFAULT_WEIGHTS.culture);
    expect(s.weights.events).toBeGreaterThan(DEFAULT_WEIGHTS.events);
  });
});

describe('quick search', () => {
  it('is wider on access than the defaults until "fly often" is picked', () => {
    const s = buildQuickSearch(DEFAULT_QUICK, null);
    expect(s.filters.maxHubMin).toBeGreaterThan(DEFAULT_FILTERS.maxHubMin);
    const fly = buildQuickSearch({ ...DEFAULT_QUICK, vibes: ['fly'] }, null);
    expect(fly.filters.maxHubMin).toBeLessThanOrEqual(60);
  });

  it('summarises itself as removable chips', () => {
    const s = buildQuickSearch(
      { intent: 'buy', months: [], where: 'europe', summer: 'mild', vibes: ['beach'], budget: 300_000, minM2: 80 }, null,
    );
    const chips = summaryChips(s, null, null);
    expect(chips.map((c) => c.key)).toEqual(['intent', 'where', 'summer', 'beach', 'budget']);
    const noBeach = chips.find((c) => c.key === 'beach')!.remove!(s);
    expect(vibe('beach').isOn(noBeach)).toBe(false);
    const anywhere = chips.find((c) => c.key === 'where')!.remove!(s);
    expect(anywhere.filters.continents).toEqual([]);
  });
});

describe('taste sample', () => {
  it('spreads across countries instead of taking the top ten of one region', () => {
    const cands = [
      ...Array.from({ length: 20 }, (_, i) => ({ town: town({ id: `PT-${i}`, country: 'PT' }), score: 90 - i * 0.1 })),
      ...['FR', 'IT', 'DE', 'JP'].map((cc, i) => ({
        town: town({ id: `${cc}-1`, country: cc, hottestTmax: 20 + i * 4, coastKm: 80 }),
        score: 70,
      })),
    ];
    const deck = tasteSample(cands, 5, new Set(), () => 0.5);
    expect(deck).toHaveLength(5);
    expect(new Set(deck.map((t) => t.country)).size).toBeGreaterThanOrEqual(4);
  });

  it('never shows a place already liked or seen', () => {
    const cands = [1, 2, 3].map((i) => ({ town: town({ id: `X-${i}` }), score: 50 }));
    expect(tasteSample(cands, 5, new Set(['X-1']), () => 0).map((t) => t.id)).not.toContain('X-1');
  });
});

it('draws flags from country codes', () => {
  expect(flag('ES')).toBe('🇪🇸');
  expect(flag('nope')).toBe('');
});

describe('intents', () => {
  it('starts new visitors on living somewhere: no purchase budget, every country', () => {
    const s = buildQuickSearch(DEFAULT_QUICK, null);
    expect(s.filters.intent).toBe('live');
    expect(s.filters.buying).toBe(false);
    expect(s.filters.ownership).toContain('prohibited');
    expect(summaryChips(s, null, null).some((c) => c.key === 'budget')).toBe(false);
  });

  it('only "buy" switches the budget and the ownership rule on', () => {
    const buy = applyIntent(quickBase(), 'buy');
    expect(buy.filters.buying).toBe(true);
    expect(buy.filters.ownership).not.toContain('prohibited');
    const back = applyIntent(buy, 'rent');
    expect(back.filters.buying).toBe(false);
    expect(back.weights.affordability).toBeGreaterThan(DEFAULT_WEIGHTS.affordability);
  });

  it('undoes the previous intent’s weights when switching', () => {
    const nomad = applyIntent(quickBase(), 'nomad');
    expect(nomad.weights.internet).toBe(9);
    expect(nomad.filters.minNetMbps).toBe(50);
    const live = applyIntent(nomad, 'live');
    expect(live.weights.internet).toBe(DEFAULT_WEIGHTS.internet);
    expect(live.filters.minNetMbps).toBe(DEFAULT_FILTERS.minNetMbps);
  });

  it('travel brings months, and nothing else keeps them', () => {
    const t = applyIntent(quickBase(), 'travel');
    expect(t.filters.months).toHaveLength(1);
    expect(applyIntent(t, 'live').filters.months).toEqual([]);
    const s = buildQuickSearch({ ...DEFAULT_QUICK, intent: 'travel', months: [9, 10] }, null);
    expect(s.filters.months).toEqual([9, 10]);
    expect(summaryChips(s, null, null).find((c) => c.key === 'months')?.label).toBe('Oct–Nov');
  });

  it('no intent lights a lifestyle tile the person did not pick', () => {
    for (const i of ['live', 'nomad', 'rent', 'travel', 'retire', 'buy'] as const) {
      const lit = activeVibes(applyIntent(quickBase(), i)).filter((v) => !(i === 'nomad' && v === 'remote'));
      expect(lit).toEqual([]);
    }
  });

  it('landscape tiles that contradict each other replace one another', () => {
    let s = toggleVibe(quickBase(), 'mountains');
    s = toggleVibe(s, 'flat');
    expect(vibe('mountains').isOn(s)).toBe(false);
    expect(vibe('flat').isOn(s)).toBe(true);
  });
});
