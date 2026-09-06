import { describe, it, expect } from 'vitest';
import {
  buildDistribution,
  learnAffinity,
  affinityScore,
  percentile,
  explain,
  MIN_PICKS,
} from './affinity';
import type { Town } from './types';

function town(over: Partial<Town> = {}): Town {
  return {
    id: 'X', name: 'Test', country: 'ES', countryName: 'Spain',
    continent: 'Europe', ownership: 'freehold', residence: 'free',
    province: 'P', ccaa: 'R', lat: 43, lon: -3, pop: 20000, elev: 100,
    hottestTmax: 26, hottestMonth: 7, hottestTmin: 15, summerTmax: 24, peakTmax: 26, winterTmin: 6,
    summerAppTmax: 27, daysOver30: 5, daysOver35: 0, tropicalNights: 4,
    appDaysOver32: 3, annualRain: 1200, summerRain: 180, humidity: 16,
    solarAnnual: 13500, solarSummer: 21000,
    monthlyTmax: Array(12).fill(20), monthlyTmin: Array(12).fill(10),
    monthlyPrec: Array(12).fill(100), source: 'modelled',
    pm25: 9, pm25VsWho: 1.8, netDownMbps: 300, netUpMbps: 250, netTests: 500,
    costIndex: 100, hdd: 900, cdd: 100, energyKwh: 2700, energyEurYear: 675,
    electricityEurKwh: 0.25, incomeTaxTop: 47, vat: 21,
    airportKm: 40, airportName: 'BIO', hubKm: 40, hubName: 'BIO', airportScore: 0.03,
    city50kKm: 15, city100kKm: 30, city100kName: 'S', city250kKm: 60,
    trainKm: 5, metroKm: 3, busKm: 3, supermarketKm: 1, supermarket5km: 4,
    pharmacyKm: 1, pharmacy5km: 3, hospitalKm: 12, schoolKm: 1, school5km: 5,
    mallKm: 20, cyclewayKm: 2, cycleSegments5km: 30, amenitiesSurveyed: true, transitSurveyed: true,
    coastKm: 10, beachKm: 12, parkKm: 20, skiKm: 90,
    maxElev25km: 900, relief25km: 800, terrainPoisSurveyed: true,
    eurM2: 1800, priceSource: 'observed', priceBand: 0, priceQuarter: 'T1A2026',
    valuations: 200, provincialEurM2: 2000,
    ...over,
  };
}

/** A population spanning coast-to-interior and village-to-city. */
function corpus(): Town[] {
  const out: Town[] = [];
  for (let i = 0; i < 200; i++) {
    out.push(
      town({
        id: `T${i}`,
        coastKm: i * 2,                    // 0 .. 400 km
        pop: 1000 + i * 3000,              // 1k .. 600k
        relief25km: (i % 20) * 100,        // uncorrelated with the rest
      }),
    );
  }
  return out;
}

describe('percentiles', () => {
  it('places a value in the population', () => {
    const d = buildDistribution(corpus());
    expect(percentile(d, 'coastKm', 0)).toBeCloseTo(0, 2);
    expect(percentile(d, 'coastKm', 400)).toBeCloseTo(1, 1);
    expect(percentile(d, 'coastKm', 200)).toBeCloseTo(0.5, 1);
  });

  it('returns null for a value that is not there', () => {
    const d = buildDistribution(corpus());
    expect(percentile(d, 'coastKm', null)).toBeNull();
  });
});

describe('learning what the picks have in common', () => {
  const towns = corpus();
  const dist = buildDistribution(towns);

  // All strongly coastal, but of wildly different sizes.
  const picks = [
    town({ id: 'A', coastKm: 2, pop: 5_000 }),
    town({ id: 'B', coastKm: 6, pop: 200_000 }),
    town({ id: 'C', coastKm: 4, pop: 350_000 }),
    town({ id: 'D', coastKm: 9, pop: 550_000 }),
  ];

  it('refuses to guess from too few picks', () => {
    const a = learnAffinity(picks.slice(0, MIN_PICKS - 1), dist, towns);
    expect(a.ok).toBe(false);
    expect(explain(a)[0]).toMatch(/at least/);
  });

  it('finds the thing they agree on', () => {
    const a = learnAffinity(picks, dist, towns);
    const coast = a.learned.find((l) => l.feature.key === 'coastKm')!;
    expect(coast.importance).toBeGreaterThan(0.5);
    expect(coast.phrase).toBe('near the coast');
  });

  it('discounts the thing they disagree on', () => {
    const a = learnAffinity(picks, dist, towns);
    const coast = a.learned.find((l) => l.feature.key === 'coastKm')!;
    const size = a.learned.find((l) => l.feature.key === 'pop')!;
    // Picking four coastal towns of 3k, 15k, 90k and 400k says you care about
    // the coast and not about size. The model must say the same.
    expect(size.consistent).toBeLessThan(coast.consistent);
    expect(size.importance).toBeLessThan(coast.importance * 0.4);
    expect(size.importance).toBeLessThan(0.15);
  });

  it('ranks a place like the picks above one unlike them', () => {
    const a = learnAffinity(picks, dist, towns);
    const coastal = affinityScore(town({ id: 'near', coastKm: 5, pop: 40_000 }), a, dist)!;
    const inland = affinityScore(town({ id: 'far', coastKm: 350, pop: 40_000 }), a, dist)!;
    expect(coastal).toBeGreaterThan(inland);
    expect(coastal).toBeGreaterThan(0.7);
  });

  it('explains itself in words a person can check', () => {
    const a = learnAffinity(picks, dist, towns);
    const lines = explain(a);
    expect(lines.join(' ')).toMatch(/coast/);
    expect(lines.join(' ')).toMatch(/typical/);
  });

  it('treats a feature with no spread in the population as no information', () => {
    // Every town in the corpus shares the same hottestTmax. A constant tells you
    // nothing about taste, so it must not surface as a strong preference.
    const a = learnAffinity(picks, dist, towns);
    const flat = a.learned.find((l) => l.feature.key === 'hottestTmax');
    expect(flat === undefined || flat.importance < 0.05).toBe(true);
  });

  it('scores nothing when it has learned nothing', () => {
    const a = learnAffinity(picks.slice(0, 1), dist, towns);
    expect(affinityScore(town(), a, dist)).toBeNull();
  });
});
