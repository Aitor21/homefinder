import { describe, it, expect } from 'vitest';
import {
  amenityScore, failures, petScore, rank, rejectReason, safetyScore, natureScore, skiScore,
  type FilterEnv,
} from './scoring';
import { forgivable, nearMisses, relaxFor, wouldRank, MAX_FORGIVE } from './nearmiss';
import { DEFAULT_FILTERS, DEFAULT_WEIGHTS, type Filters, type Town, type Weights } from './types';

function town(over: Partial<Town> = {}): Town {
  return {
    id: 'ES-00001', name: 'Test', country: 'ES', countryName: 'Spain',
    continent: 'Europe', ownership: 'freehold', residence: 'free',
    province: 'Testland', ccaa: 'Testregion',
    lat: 43, lon: -3, pop: 20000, elev: 100, tz: 'Europe/Madrid',
    hottestTmax: 26, hottestMonth: 7, hottestTmin: 15, summerTmax: 24, peakTmax: 26, winterTmin: 6,
    summerAppTmax: 27, daysOver30: 5, daysOver35: 0, tropicalNights: 4,
    appDaysOver32: 3, annualRain: 1200, summerRain: 180, humidity: 16,
    solarAnnual: 13500, solarSummer: 21000, monthlyTmax: Array(12).fill(20), monthlyTmin: Array(12).fill(10),
    monthlyPrec: Array(12).fill(100), source: 'modelled',
    airportKm: 20, airportName: 'BIO', hubKm: 20, hubName: 'BIO', airportScore: 0.2,
    city50kKm: 5, city100kKm: 10, city100kName: 'Somewhere', city250kKm: 30,
    trainKm: 2, metroKm: 1, busKm: 1, supermarketKm: 0.5, supermarket5km: 8,
    pharmacyKm: 0.5, pharmacy5km: 6, hospitalKm: 3, schoolKm: 1, school5km: 5,
    mallKm: 5, cyclewayKm: 1, cycleSegments5km: 30, amenitiesSurveyed: true, transitSurveyed: true,
    vetKm: 2, vet10km: 6, dogParkKm: 3, petsSurveyed: true,
    coastKm: 5, beachKm: 3, parkKm: 5, skiKm: 40,
    maxElev25km: 1500, relief25km: 1200, terrainPoisSurveyed: true,
    pm25: 6, pm25VsWho: 1.2, netDownMbps: 300, netUpMbps: 250, netTests: 500,
    costIndex: 80, hdd: 900, cdd: 100, energyKwh: 2700, energyEurYear: 500,
    electricityEurKwh: 0.25, incomeTaxTop: 47, vat: 21, homicideRate: 0.7, homicideYear: 2023,
    eurM2: 1500, priceSource: 'observed', priceBand: 0, priceQuarter: 'T1A2026',
    valuations: 200, provincialEurM2: 2000,
    ...over,
  };
}

const W: Weights = { ...DEFAULT_WEIGHTS, affinity: 0 };
const CTX = { refs: [] };

/** A field of ordinary places for the excellent ones to be measured against. */
function field(n = 12): Town[] {
  return Array.from({ length: n }, (_, i) =>
    town({
      id: `F${i}`, name: `Ordinary ${i}`, eurM2: 3200, costIndex: 120, pm25: 14,
      netDownMbps: 60, parkKm: 40, relief25km: 300, maxElev25km: 500, coastKm: 60,
      hospitalKm: 15, supermarket5km: 2,
    }),
  );
}

describe('every failure, not just the first', () => {
  it('reports all of them with numbers, where rejectReason stops at one', () => {
    const f: Filters = { ...DEFAULT_FILTERS, maxAirportMin: 30, maxCityKm: 20 };
    const far = town({ airportKm: 200, hubKm: 200, city100kKm: 90 });
    const all = failures(far, f);
    expect(all.map((x) => x.key)).toEqual(['airport', 'hub', 'city']);
    expect(all[0].value).toMatch(/BIO/);
    expect(all[0].miss).toBeGreaterThan(1); // far more than double the limit
  });

  it('agrees with rejectReason on which failure comes first', () => {
    // Two code paths, one fast and one thorough. If they ever disagree the
    // table would say one reason and the town panel another.
    const f: Filters = { ...DEFAULT_FILTERS, maxTropicalNights: 10, maxPm25: 10, minPop: 50_000 };
    const cases = [
      town({ tropicalNights: 30 }),
      town({ pm25: 30, pop: 1_000 }),
      town({ eurM2: 9_000, tropicalNights: 30 }),
      town({ country: 'NZ', ownership: 'prohibited', pop: 1_000 }),
    ];
    for (const t of cases) expect(rejectReason(t, f)).toBe(failures(t, f)[0]?.reason ?? null);
  });

  it('separates thresholds from where you are willing to live', () => {
    const f: Filters = { ...DEFAULT_FILTERS, countries: ['PT'], maxAirportMin: 30 };
    const all = failures(town({ airportKm: 200 }), f);
    expect(all.find((x) => x.key === 'airport')!.relaxable).toBe(true);
    expect(all.find((x) => x.key === 'country')!.relaxable).toBe(false);
  });
});

describe('near misses', () => {
  const f: Filters = { ...DEFAULT_FILTERS, maxAirportMin: 45, maxHubMin: 60 };

  it('finds the place that is perfect except for a distant airport', () => {
    // The case that started this: everything right, two hours from a runway,
    // and invisible because the airport filter removed it outright.
    const remote = town({ id: 'REMOTE', name: 'Perfect but remote', airportKm: 220, hubKm: 230,
      airportScore: 0.005 });
    const towns = [...field(), remote];
    const ranked = rank(towns, f, W, CTX);
    expect(ranked.some((r) => r.town.id === 'REMOTE')).toBe(false);
    const near = nearMisses(towns, ranked, f, W, CTX);
    const hit = near.find((r) => r.town.id === 'REMOTE');
    expect(hit).toBeDefined();
    expect(hit!.held!.map((h) => h.failure?.key)).toEqual(['airport', 'hub']);
    // Forgiven, it beats every ordinary place in the list.
    expect(hit!.forgiven!).toBeGreaterThan(ranked[0].score);
    expect(wouldRank(ranked, hit!.forgiven!)).toBe(1);
  });

  it('never forgives where you are willing to live', () => {
    // A town outside the countries you picked is not nearly inside them.
    const g: Filters = { ...f, countries: ['ES'] };
    const pt = town({ id: 'PT1', country: 'PT', countryName: 'Portugal', airportKm: 220, hubKm: 230 });
    const towns = [...field(), pt];
    const near = nearMisses(towns, rank(towns, g, W, CTX), g, W, CTX);
    expect(near.some((r) => r.town.id === 'PT1')).toBe(false);
  });

  it('stops at two things forgiven', () => {
    const g: Filters = { ...f, maxCityKm: 20, minNetMbps: 100 };
    const three = town({ id: 'THREE', airportKm: 220, hubKm: 20, city100kKm: 90, netDownMbps: 30 });
    const towns = [...field(), three];
    expect(failures(three, g)).toHaveLength(3);
    const near = nearMisses(towns, rank(towns, g, W, CTX), g, W, CTX);
    expect(near.some((r) => r.town.id === 'THREE')).toBe(false);
    expect(MAX_FORGIVE).toBe(2);
  });

  it('forgives a budget only when it is a stretch, not a different search', () => {
    const at = (eurM2: number) => failures(town({ eurM2 }), f).find((x) => x.key === 'budget')!;
    // 400k for 80 m2 is 5,000/m2. 5,800 is 16% over; 9,000 is 80% over.
    expect(forgivable(at(5_800))).toBe(true);
    expect(forgivable(at(9_000))).toBe(false);
  });

  it('forgives a summer only when it is just over the line', () => {
    const g: Filters = { ...f, maxHotTmax: 27 };
    const at = (hottestTmax: number) =>
      failures(town({ hottestTmax }), g).find((x) => x.key === 'hotMax')!;
    expect(forgivable(at(28))).toBe(true);
    // Nine degrees hotter than asked is not a near miss for a climate search.
    expect(forgivable(at(36))).toBe(false);
  });

  it('also surfaces a passing place that remoteness alone drags down', () => {
    // Passes every filter (they are loose here), but its airport access is
    // dreadful and you weight airports heavily.
    const g: Filters = { ...DEFAULT_FILTERS, maxAirportMin: 600, maxHubMin: 600 };
    const w: Weights = { ...W, airport: 30 };
    const remote = town({ id: 'REMOTE', airportKm: 400, hubKm: 450, airportScore: 0.0001 });
    const towns = [...field(20), remote];
    const ranked = rank(towns, g, w, CTX);
    expect(ranked.findIndex((r) => r.town.id === 'REMOTE')).toBeGreaterThanOrEqual(10);
    const near = nearMisses(towns, ranked, g, w, CTX);
    const hit = near.find((r) => r.town.id === 'REMOTE');
    expect(hit).toBeDefined();
    expect(hit!.held![0].dim).toBe('airport');
    expect(hit!.forgiven!).toBeGreaterThan(ranked[0].score);
  });

  it('never forgives what a place is, only how far it is from things', () => {
    // Dreadful broadband, dear living costs, no sea: those are the place, not
    // a near miss, however well it does otherwise.
    const g: Filters = { ...DEFAULT_FILTERS, minNetMbps: 0 };
    const w: Weights = { ...W, internet: 30, livingCost: 30 };
    const flawed = town({ id: 'FLAWED', netDownMbps: 26, costIndex: 200 });
    const towns = [...field(20).map((t) => ({ ...t, netDownMbps: 300 })), flawed];
    const near = nearMisses(towns, rank(towns, g, w, CTX), g, w, CTX);
    expect(near.some((r) => r.town.id === 'FLAWED')).toBe(false);
  });

  it('offers the exact filter change that would let the place in', () => {
    const remote = town({ airportKm: 220, hubKm: 230 });
    for (const x of failures(remote, f)) {
      const patch = relaxFor(x, remote, f)!;
      expect(patch).not.toBeNull();
      const g = { ...f, ...patch };
      expect(failures(remote, g).some((y) => y.key === x.key)).toBe(false);
    }
  });
});

describe('the new dimensions', () => {
  it('scores a dog-friendly place above one with no vet and hot summers', () => {
    const good = town({ vetKm: 1, parkKm: 2, daysOver30: 3, dogParkKm: 2 });
    const bad = town({ vetKm: 30, parkKm: 60, daysOver30: 100, dogParkKm: 40 });
    expect(petScore(good)!).toBeGreaterThan(0.85);
    expect(petScore(bad)!).toBeLessThan(0.15);
  });

  it('leaves unsurveyed pet layers out instead of scoring them as absent', () => {
    const unsurveyed = town({ petsSurveyed: false, vetKm: null, dogParkKm: null, parkKm: 2, daysOver30: 3 });
    // Judged on nature and heat alone, both excellent: not dragged down.
    expect(petScore(unsurveyed)!).toBeGreaterThan(0.9);
  });

  it('never lets a missing dog park count against a place', () => {
    // Whether a country fences off dog areas is cultural and whether it maps
    // them is luck: a nearby one is a bonus, a missing one proves nothing.
    const without = petScore(town({ dogParkKm: 200 }))!;
    const none = petScore(town({ dogParkKm: null }))!;
    const near = petScore(town({ dogParkKm: 1 }))!;
    expect(without).toBeCloseTo(none, 6);
    expect(near).toBeGreaterThan(without);
  });

  it('leaves out layers a country has barely mapped, instead of blaming the town', () => {
    // China shows essentially no shops or vets on OpenStreetMap. Scoring those
    // distances would rank every Chinese town as remote, which says nothing
    // true about any of them.
    const mapped = town({ supermarketKm: 30, pharmacyKm: 30, hospitalKm: 60, supermarket5km: 0 });
    const unmapped = { ...mapped, servicesMapped: 0 };
    expect(amenityScore(unmapped)!).toBeGreaterThan(amenityScore(mapped)!);
    const farVet = town({ vetKm: 120 });
    expect(petScore({ ...farVet, vetsMapped: 0 })!).toBeGreaterThan(petScore(farVet)!);
  });

  it('reads homicide on a log scale, so a tenfold gap is a big one', () => {
    expect(safetyScore(town({ homicideRate: 0.5 }))).toBeCloseTo(1, 6);
    expect(safetyScore(town({ homicideRate: 20 }))).toBeCloseTo(0, 6);
    const spain = safetyScore(town({ homicideRate: 0.7 }))!;
    const us = safetyScore(town({ homicideRate: 5.8 }))!;
    expect(spain - us).toBeGreaterThan(0.5);
    expect(safetyScore(town({ homicideRate: null }))).toBeNull();
  });

  it('returns null for nature and ski where they were not surveyed', () => {
    expect(natureScore(town({ parkKm: null }))).toBeNull();
    expect(skiScore(town({ skiKm: null }))).toBeNull();
    expect(skiScore(town({ skiKm: 20 }))!).toBeGreaterThan(skiScore(town({ skiKm: 140 }))!);
  });
});

describe('filters that need to know about the user', () => {
  const env: FilterEnv = {
    tzGap: (t) => (t.tz === 'America/Santiago' ? 6 : 0),
    winterDaylight: (t) => (t.lat > 66 ? 0 : 9),
    homeFlightH: (t) => (t.country === 'JP' ? 15 : 2),
  };

  it('applies the time-difference limit only when it is set', () => {
    const cl = town({ tz: 'America/Santiago' });
    expect(rejectReason(cl, DEFAULT_FILTERS, env)).toBeNull();
    expect(rejectReason(cl, { ...DEFAULT_FILTERS, maxTzDiff: 3 }, env)).toBe('too many hours from your clock');
  });

  it('knows polar night when it sees it', () => {
    const f = { ...DEFAULT_FILTERS, minWinterDaylight: 5 };
    expect(rejectReason(town({ lat: 69.6 }), f, env)).toBe('winter days too short');
    expect(rejectReason(town({ lat: 43 }), f, env)).toBeNull();
  });

  it('skips a filter whose context is missing rather than failing everything', () => {
    // The questionnaire's live count has no clock or home; it must not
    // report zero matches because of filters it cannot evaluate.
    const f = { ...DEFAULT_FILTERS, maxTzDiff: 1, maxHomeFlightH: 3 };
    expect(rejectReason(town({ tz: 'America/Santiago' }), f)).toBeNull();
  });

  it('can leave out countries that quarantine pets', () => {
    const rules = { AU: { name: 'Australia', continent: 'Oceania', residence: 'visa' as const,
      ownership: 'restricted' as const, note: '', pets: 'quarantine' as const } };
    const au = town({ country: 'AU', ownership: 'restricted' });
    const f = { ...DEFAULT_FILTERS, noPetQuarantine: true };
    expect(rejectReason(au, f, { rules })).toBe('quarantines arriving pets');
    expect(rejectReason(au, DEFAULT_FILTERS, { rules })).toBeNull();
  });
});
