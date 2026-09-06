import { describe, it, expect } from 'vitest';
import { buildProfile, DEFAULT_ANSWERS, type Answers } from './profile';
import { rejectReason } from './scoring';
import { DEFAULT_FILTERS } from './types';
import { coolingDegreeDays, acIndexVs, hotMonths } from './climate';
import type { Town } from './types';

/** Real measured values, so the tests exercise the actual trade-offs. */
function town(over: Partial<Town> = {}): Town {
  return {
    id: 'ES-00001', name: 'Test', country: 'ES', countryName: 'Spain',
    continent: 'Europe', ownership: 'freehold', residence: 'free',
    province: 'Testland', ccaa: 'Testregion',
    lat: 43, lon: -3, pop: 20000, elev: 100,
    hottestTmax: 26, hottestMonth: 7, hottestTmin: 15, summerTmax: 24, peakTmax: 26, winterTmin: 6,
    summerAppTmax: 27, daysOver30: 5, daysOver35: 0, tropicalNights: 4,
    appDaysOver32: 3, annualRain: 1200, summerRain: 180, humidity: 16,
    solarAnnual: 13500, solarSummer: 21000,
    monthlyTmax: [14, 16, 16, 18, 22, 23, 26, 26, 24, 22, 17, 15],
    monthlyTmin: [7, 7, 8, 10, 13, 16, 18, 19, 17, 14, 10, 8],
    monthlyPrec: Array(12).fill(100), source: 'modelled',
    airportKm: 40, airportName: 'BIO', hubKm: 40, hubName: 'BIO', airportScore: 0.03,
    city50kKm: 15, city100kKm: 30, city100kName: 'Somewhere', city250kKm: 60,
    trainKm: 5, metroKm: 3, busKm: 3, supermarketKm: 1, supermarket5km: 4,
    pharmacyKm: 1, pharmacy5km: 3, hospitalKm: 12, schoolKm: 1, school5km: 5,
    mallKm: 20, cyclewayKm: 2, cycleSegments5km: 30, amenitiesSurveyed: true, transitSurveyed: true,
    coastKm: 10, beachKm: 12, parkKm: 20, skiKm: 90,
    maxElev25km: 900, relief25km: 800, terrainPoisSurveyed: true,
    pm25: 9, pm25VsWho: 1.8, netDownMbps: 300, netUpMbps: 250, netTests: 500,
    costIndex: 100, hdd: 900, cdd: 100, energyKwh: 2700, energyEurYear: 675,
    electricityEurKwh: 0.25, incomeTaxTop: 47, vat: 21,
    eurM2: 1800, priceSource: 'observed', priceBand: 0, priceQuarter: 'T1A2026',
    valuations: 200, provincialEurM2: 2000,
    ...over,
  };
}

// Measured values from the shipped dataset.
const MADRID = town({
  id: 'ES-28079', name: 'Madrid', daysOver30: 66.6, daysOver35: 19.8, tropicalNights: 23.4,
  hottestTmax: 31.2, hottestTmin: 19.9, humidity: 12.5, eurM2: 5466,
  monthlyTmax: [10, 13, 15, 18, 22, 27, 32, 31, 25, 20, 14, 11],
  monthlyTmin: [1, 2, 4, 6, 10, 15, 19, 19, 15, 10, 5, 2],
});
const BARCELONA = town({
  id: 'ES-08019', name: 'Barcelona', daysOver30: 18.0, daysOver35: 0.2, tropicalNights: 68.2,
  hottestTmax: 28.8, hottestTmin: 22.2, humidity: 18.6, eurM2: 4400,
  monthlyTmax: [13, 16, 16, 18, 22, 25, 29, 29, 24, 22, 17, 15],
  monthlyTmin: [5, 6, 8, 10, 14, 18, 21, 22, 19, 15, 10, 7],
});
const BILBAO = town({
  id: 'ES-48020', name: 'Bilbao', daysOver30: 3.6, tropicalNights: 12.6, hottestTmax: 26.5,
  hottestTmin: 18.6, eurM2: 3402,
});

const CORPUS = [MADRID, BARCELONA, BILBAO, town({ id: 'ES-99999', name: 'Cool', daysOver30: 1, tropicalNights: 2 })];

const answers = (over: Partial<Answers> = {}): Answers => ({ ...DEFAULT_ANSWERS, ...over });

describe('anti-reference thresholds', () => {
  it('takes the strictest complaint on each axis, not an average', () => {
    // Madrid is the day problem (66.6 days); Barcelona is the night problem (68.2 nights).
    const p = buildProfile(answers({ ruledOut: ['ES-28079', 'ES-08019'], strictness: 'clearly' }), CORPUS);
    // Days ceiling must come from Barcelona (18), not Madrid (66.6) and not their mean.
    expect(p.filters.maxDaysOver30).toBeLessThanOrEqual(18 * 0.6 + 0.05);
    // Nights ceiling must come from Madrid (23.4), not Barcelona (68.2).
    expect(p.filters.maxTropicalNights).toBeLessThanOrEqual(23.4 * 0.6 + 0.05);
  });

  it('excludes both rejected cities from their own results', () => {
    const p = buildProfile(answers({ ruledOut: ['ES-28079', 'ES-08019'] }), CORPUS);
    expect(rejectReason(MADRID, p.filters)).not.toBeNull();
    expect(rejectReason(BARCELONA, p.filters)).not.toBeNull();
  });

  it('gets stricter monotonically', () => {
    const base = { ruledOut: ['ES-28079', 'ES-08019'] };
    const a = buildProfile(answers({ ...base, strictness: 'clearly' }), CORPUS).filters;
    const b = buildProfile(answers({ ...base, strictness: 'much' }), CORPUS).filters;
    const c = buildProfile(answers({ ...base, strictness: 'max' }), CORPUS).filters;
    expect(b.maxDaysOver30).toBeLessThan(a.maxDaysOver30);
    expect(c.maxDaysOver30).toBeLessThan(b.maxDaysOver30);
    expect(c.maxTropicalNights).toBeLessThan(b.maxTropicalNights);
    expect(c.maxHotTmax).toBeLessThan(a.maxHotTmax);
  });

  it('never filters out a place the user said felt right', () => {
    // "max" strictness would normally exclude Bilbao's 12.6 tropical nights.
    const strict = buildProfile(answers({ ruledOut: ['ES-28079', 'ES-08019'], strictness: 'max' }), CORPUS);
    expect(rejectReason(BILBAO, strict.filters)).not.toBeNull();

    const withLike = buildProfile(
      answers({ ruledOut: ['ES-28079', 'ES-08019'], strictness: 'max', feltRight: ['ES-48020'] }),
      CORPUS,
    );
    expect(rejectReason(BILBAO, withLike.filters)).toBeNull();
    expect(withLike.notes.join(' ')).toMatch(/Loosened/);
  });

  it('holds no opinion until something has been said', () => {
    // With no places named, every summer bound stays wide open and no target
    // is set. The app used to ship a cool-climate preference as its default.
    const p = buildProfile(answers(), CORPUS);
    expect(p.filters.maxDaysOver30).toBeGreaterThan(100);
    expect(p.filters.minHotTmax).toBe(0);
    expect(p.filters.summerTarget).toBeNull();
  });

  it('sets floors, not ceilings, for somebody who wants it warmer', () => {
    // Bilbao ruled out for being too COOL. That must raise a floor; the old
    // code could only ever lower a ceiling.
    const p = buildProfile(
      answers({ ruledOut: ['ES-48020'], want: 'warmer', strictness: 'clearly' }),
      CORPUS,
    );
    expect(p.filters.minHotTmax).toBeGreaterThan(BILBAO.hottestTmax);
    expect(p.filters.maxHotTmax).toBeGreaterThan(40);
    expect(rejectReason(BILBAO, p.filters)).toBe('hottest month too cool');
    expect(p.notes.join(' ')).toMatch(/floored/);
  });

  it('takes the summer target from the places that felt right', () => {
    const p = buildProfile(
      answers({ ruledOut: ['ES-28079'], feltRight: ['ES-48020'] }),
      CORPUS,
    );
    expect(p.filters.summerTarget).toBeCloseTo(BILBAO.hottestTmax, 1);
  });

  it('never lets a floor exclude a place the user liked', () => {
    const p = buildProfile(
      answers({ ruledOut: ['ES-48020'], want: 'warmer', feltRight: ['ES-08019'] }),
      CORPUS,
    );
    expect(rejectReason(BARCELONA, p.filters)).toBeNull();
  });
});

describe('reference lists', () => {
  it('carries every favourite and every rejection into the filters', () => {
    const p = buildProfile(
      answers({ ruledOut: ['ES-28079', 'ES-08019'], feltRight: ['ES-48020'] }),
      CORPUS,
    );
    // The wizard has always collected several of each; the app used to keep
    // only the first of both, silently discarding the rest.
    expect(p.filters.avoid).toEqual(['ES-28079', 'ES-08019']);
    expect(p.filters.favourites).toEqual(['ES-48020']);
  });
});

describe('lifestyle mapping', () => {
  it('working from home makes summer dominant and relaxes city distance', () => {
    const wfh = buildProfile(answers({ day: 'wfh' }), CORPUS);
    const commute = buildProfile(answers({ day: 'commute' }), CORPUS);
    expect(wfh.weights.summerFit).toBeGreaterThan(wfh.weights.city);
    expect(wfh.filters.maxCityKm).toBeGreaterThan(commute.filters.maxCityKm);
    expect(commute.weights.city).toBeGreaterThan(wfh.weights.city);
  });

  it('flying often tightens the hub requirement', () => {
    const often = buildProfile(answers({ flying: 'often' }), CORPUS).filters;
    const rarely = buildProfile(answers({ flying: 'rarely' }), CORPUS).filters;
    expect(often.maxHubMin).toBeLessThan(rarely.maxHubMin);
  });

  it('liking cold zeroes the winter and rain penalties', () => {
    const w = buildProfile(answers({ winter: 'love-cold' }), CORPUS).weights;
    expect(w.winterMild).toBe(0);
    expect(w.drier).toBe(0);
    expect(w.mountains).toBeGreaterThan(0);
  });

  it('turns essentials into hard filters', () => {
    const p = buildProfile(answers({ essentials: ['train', 'observed-price'] }), CORPUS);
    expect(p.filters.maxTrainKm).toBe(15);
    expect(p.filters.requireObservedPrice).toBe(true);
  });

  it('explains itself', () => {
    const p = buildProfile(answers({ ruledOut: ['ES-28079'], day: 'wfh' }), CORPUS);
    expect(p.notes.length).toBeGreaterThan(2);
    expect(p.notes.join(' ')).toContain('Madrid');
  });
});

describe('ownership gating', () => {
  it('hides places a Spanish passport cannot buy in, by default', () => {
    const closed = town({ id: 'CN-1', country: 'CN', countryName: 'China',
      continent: 'Asia', ownership: 'prohibited' });
    expect(rejectReason(closed, DEFAULT_FILTERS)).toBe('cannot buy there');
  });

  it('allows freehold, conditional and leasehold by default', () => {
    for (const own of ['freehold', 'restricted', 'leasehold'] as const) {
      const t = town({ id: `X-${own}`, country: 'JP', countryName: 'Japan',
        continent: 'Asia', ownership: own });
      expect(rejectReason(t, DEFAULT_FILTERS)).toBeNull();
    }
  });

  it('can be opened up explicitly', () => {
    const closed = town({ id: 'CN-1', country: 'CN', continent: 'Asia',
      ownership: 'prohibited' });
    const f = { ...DEFAULT_FILTERS, ownership: ['prohibited' as const] };
    expect(rejectReason(closed, f)).toBeNull();
  });

  it('filters by continent', () => {
    const jp = town({ id: 'JP-1', country: 'JP', continent: 'Asia', ownership: 'freehold' });
    const f = { ...DEFAULT_FILTERS, continents: ['Europe'] };
    expect(rejectReason(jp, f)).toBe('outside chosen continents');
  });
});

describe('cooling load', () => {
  it('ranks a hot inland city far above a cool Atlantic one', () => {
    expect(coolingDegreeDays(MADRID)).toBeGreaterThan(coolingDegreeDays(BILBAO) * 2);
  });

  it('expresses a town as a percentage of the reference', () => {
    const pct = acIndexVs(BILBAO, MADRID);
    expect(pct).not.toBeNull();
    expect(pct!).toBeGreaterThan(0);
    expect(pct!).toBeLessThan(60);
    expect(acIndexVs(MADRID, MADRID)).toBeCloseTo(100, 5);
  });

  it('returns null without a reference', () => {
    expect(acIndexVs(BILBAO, null)).toBeNull();
  });

  it('counts the length of the hot season', () => {
    expect(hotMonths(MADRID)).toBeGreaterThan(hotMonths(BILBAO));
  });
});
