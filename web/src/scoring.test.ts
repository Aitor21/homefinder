import { describe, it, expect } from 'vitest';
import { driveMinutes, formatDrive } from './travel';
import {
  norm,
  inv,
  score,
  summerFit,
  amenityScore,
  transitKm,
  bestMatch,
  airScore,
  internetScore,
  livingCostScore,
  energyScore,
  summerComfort,
  climateMatch,
  affordableM2,
  priceFor,
  rejectReason,
  rank,
} from './scoring';
import { fitGems, discountPct } from './gems';
import { slug, parseListingsCsv, portalLinks } from './listings';
import { DEFAULT_FILTERS, DEFAULT_WEIGHTS, type Town } from './types';

function town(over: Partial<Town> = {}): Town {
  return {
    id: 'ES-00001', name: 'Test', country: 'ES', countryName: 'Spain',
    continent: 'Europe', ownership: 'freehold', residence: 'free',
    province: 'Testland', ccaa: 'Testregion',
    lat: 43, lon: -3, pop: 20000, elev: 100,
    hottestTmax: 26, hottestMonth: 7, hottestTmin: 15, summerTmax: 24, peakTmax: 26, winterTmin: 6,
    summerAppTmax: 27, daysOver30: 5, daysOver35: 0, tropicalNights: 4,
    appDaysOver32: 3, annualRain: 1200, summerRain: 180, humidity: 16,
    solarAnnual: 13500, solarSummer: 21000, monthlyTmax: Array(12).fill(20), monthlyTmin: Array(12).fill(10),
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

describe('normalisation', () => {
  it('clamps at both ends', () => {
    expect(norm(-5, 0, 10)).toBe(0);
    expect(norm(15, 0, 10)).toBe(1);
    expect(norm(5, 0, 10)).toBe(0.5);
    expect(inv(0, 0, 10)).toBe(1);
  });
});

describe('summerComfort', () => {
  it('ranks a cool Atlantic town far above a hot inland one', () => {
    const bilbao = town({ daysOver30: 4, tropicalNights: 12, hottestTmax: 26, appDaysOver32: 6 });
    const sevilla = town({ daysOver30: 116, tropicalNights: 77, hottestTmax: 35, appDaysOver32: 80 });
    expect(summerComfort(bilbao)).toBeGreaterThan(summerComfort(sevilla) + 0.4);
  });

  it('penalises warm nights even when days are identical', () => {
    const dryHeat = town({ daysOver30: 40, tropicalNights: 2 });
    const humidHeat = town({ daysOver30: 40, tropicalNights: 60 });
    expect(summerComfort(dryHeat)).toBeGreaterThan(summerComfort(humidHeat));
  });
});

describe('climateMatch', () => {
  it('scores a town against itself as a perfect match', () => {
    const t = town();
    expect(climateMatch(t, [t])).toBeCloseTo(1, 6);
  });

  it('scores a very different climate well below a similar one', () => {
    const ref = town({ hottestTmax: 26, hottestTmin: 15, daysOver30: 4, tropicalNights: 10, annualRain: 1200 });
    const near = town({ hottestTmax: 27, hottestTmin: 16, daysOver30: 8, tropicalNights: 12, annualRain: 1100 });
    const far = town({ hottestTmax: 36, hottestTmin: 22, daysOver30: 110, tropicalNights: 80, annualRain: 400 });
    expect(climateMatch(near, [ref])).toBeGreaterThan(climateMatch(far, [ref]));
  });
});

describe('budget arithmetic', () => {
  it('converts between price, size and budget consistently', () => {
    const t = town({ eurM2: 2000 });
    expect(priceFor(t, 80)).toBe(160_000);
    expect(affordableM2(t, 400_000)).toBe(200);
  });
});

describe('rejectReason', () => {
  it('accepts a town inside every limit', () => {
    expect(rejectReason(town(), DEFAULT_FILTERS)).toBeNull();
  });

  it('rejects on budget when the minimum size will not fit', () => {
    const t = town({ eurM2: 9000 }); // 80 m2 = 720k, over the 400k default
    expect(rejectReason(t, DEFAULT_FILTERS)).toBe('over budget');
  });

  it('rejects on warm nights once a limit is actually set', () => {
    // The defaults are deliberately wide open now: before you have said
    // anything, the app has no opinion about what a good summer is.
    expect(rejectReason(town({ tropicalNights: 90 }), DEFAULT_FILTERS)).toBeNull();
    const f = { ...DEFAULT_FILTERS, maxTropicalNights: 25 };
    expect(rejectReason(town({ tropicalNights: 90 }), f)).toBe('too many warm nights');
  });

  it('rejects a place for being too COOL, not only too hot', () => {
    const f = { ...DEFAULT_FILTERS, minHotTmax: 30 };
    expect(rejectReason(town({ hottestTmax: 24 }), f)).toBe('hottest month too cool');
    expect(rejectReason(town({ hottestTmax: 33 }), f)).toBeNull();
  });

  it('rejects a place for cold winters when a floor is set', () => {
    const f = { ...DEFAULT_FILTERS, minWinterTmin: 5 };
    expect(rejectReason(town({ winterTmin: -3 }), f)).toBe('winters too cold');
  });

  it('honours the observed-price-only switch', () => {
    const f = { ...DEFAULT_FILTERS, requireObservedPrice: true };
    expect(rejectReason(town({ priceSource: 'modelled' }), f)).toBe('price is estimated');
    expect(rejectReason(town({ priceSource: 'observed' }), f)).toBeNull();
  });

  it('filters by region', () => {
    const f = { ...DEFAULT_FILTERS, regions: ['Galicia'] };
    expect(rejectReason(town({ ccaa: 'Cantabria' }), f)).toBe('outside chosen regions');
  });
});

describe('rank', () => {
  it('orders a cheap cool town above an expensive hot one', () => {
    const good = town({ id: 'A', name: 'Cool', eurM2: 1200, daysOver30: 3, tropicalNights: 2 });
    const bad = town({ id: 'B', name: 'Hot', eurM2: 4200, daysOver30: 39, tropicalNights: 24 });
    const out = rank([bad, good], DEFAULT_FILTERS, DEFAULT_WEIGHTS, { refs: [] });
    expect(out[0].town.id).toBe('A');
  });

  it('drops towns that fail a hard filter', () => {
    const f = { ...DEFAULT_FILTERS, maxTropicalNights: 25 };
    const out = rank([town({ tropicalNights: 99 })], f, DEFAULT_WEIGHTS, { refs: [] });
    expect(out).toHaveLength(0);
  });
});

describe('gems', () => {
  it('flags the cheap end of an otherwise identical set as underpriced', () => {
    // Same quality of life, prices varying only with population.
    const towns: Town[] = [];
    for (let i = 0; i < 40; i++) {
      towns.push(
        town({
          id: `T${i}`,
          pop: 20_000 + i * 5_000,
          eurM2: 1000 + i * 40,
          priceSource: 'observed',
        }),
      );
    }
    // One town priced far below what its size implies.
    towns.push(town({ id: 'GEM', pop: 200_000, eurM2: 900, priceSource: 'observed' }));

    const model = fitGems(towns);
    expect(model.ok).toBe(true);
    const d = discountPct(model, towns[towns.length - 1]);
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(20);
  });

  it('reports not-ok rather than throwing when there is nothing to fit on', () => {
    const model = fitGems([town({ priceSource: 'modelled' })]);
    expect(model.ok).toBe(false);
  });
});

describe('cost of living and quality of life', () => {
  it('scores clean air above dirty air', () => {
    expect(airScore(town({ pm25: 6 }))!).toBeGreaterThan(airScore(town({ pm25: 28 }))!);
  });

  it('returns null rather than zero when a dimension was never measured', () => {
    expect(airScore(town({ pm25: null }))).toBeNull();
    expect(livingCostScore(town({ costIndex: null }))).toBeNull();
    expect(energyScore(town({ energyEurYear: null }))).toBeNull();
  });

  it('refuses to score broadband from a handful of tests', () => {
    // A single fast test in a village is not evidence about the village.
    expect(internetScore(town({ netDownMbps: 900, netTests: 3 }))).toBeNull();
    expect(internetScore(town({ netDownMbps: 900, netTests: 500 }))).not.toBeNull();
  });

  it('drops unmeasured dimensions from the score instead of penalising them', () => {
    const measured = town({ pm25: 9, costIndex: 100 });
    const unmeasured = town({ pm25: null, costIndex: null, netDownMbps: null, netTests: 0,
      energyEurYear: null });
    // Identical in every other respect, so an absent measurement must not drag
    // the score down -- it should simply not participate.
    const a = score(measured, DEFAULT_FILTERS, DEFAULT_WEIGHTS, { refs: [] });
    const b = score(unmeasured, DEFAULT_FILTERS, DEFAULT_WEIGHTS, { refs: [] });
    expect(Math.abs(a - b)).toBeLessThan(12);
    expect(b).toBeGreaterThan(0);
  });

  it('rejects on measured broadband but never on a missing measurement', () => {
    const f = { ...DEFAULT_FILTERS, minNetMbps: 100 };
    expect(rejectReason(town({ netDownMbps: 40, netTests: 200 }), f)).toBe('broadband too slow');
    expect(rejectReason(town({ netDownMbps: null, netTests: 0 }), f)).toBeNull();
    expect(rejectReason(town({ netDownMbps: 40, netTests: 2 }), f)).toBeNull();
  });

  it('rejects on air and cost limits', () => {
    expect(rejectReason(town({ pm25: 40 }), DEFAULT_FILTERS)).toBe('air too polluted');
    const f = { ...DEFAULT_FILTERS, maxCostIndex: 110 };
    expect(rejectReason(town({ costIndex: 190 }), f)).toBe('too expensive to live in');
  });

  it('prefers the cheaper energy bill', () => {
    expect(energyScore(town({ energyEurYear: 450 }))!)
      .toBeGreaterThan(energyScore(town({ energyEurYear: 2350 }))!);
  });
});

describe('summer means summer, not August', () => {
  // The pipeline picks each place's own hottest month, so hottestTmax is the
  // real peak everywhere. These check the consumer honours that: a Chilean town
  // whose August is 14 C but whose February is 31 C must be judged on February.
  const santiago = town({
    id: 'CL-1', country: 'CL', continent: 'Americas',
    hottestTmax: 31, hottestTmin: 13, winterTmin: 3,
    daysOver30: 62, tropicalNights: 2,
  });

  it('rejects a southern town on its actual summer', () => {
    const f = { ...DEFAULT_FILTERS, maxHotTmax: 27 };
    expect(rejectReason(santiago, f)).toBe('hottest month too hot');
  });

  it('scores it against the summer asked for, not the calendar', () => {
    // Someone wanting a 22 C peak should find Santiago a poor fit even though
    // its August is a chilly 14.
    const fit = summerFit(santiago, 22)!;
    expect(fit).toBeLessThan(0.1);
    expect(summerFit(santiago, 31)).toBeCloseTo(1, 6);
  });
});

describe('population bounds', () => {
  it('treats the top of the slider as no limit at all', () => {
    // The label reads "any" there. It used to still exclude anything over five
    // million, so Tokyo and Sao Paulo vanished from an unbounded search.
    const tokyo = town({ pop: 8_336_000 });
    expect(rejectReason(tokyo, DEFAULT_FILTERS)).toBeNull();
    expect(rejectReason(tokyo, { ...DEFAULT_FILTERS, maxPop: 1_000_000 })).toBe('too large');
  });
});

describe('public transport', () => {
  it('takes the nearest of any mode, because the question is one question', () => {
    // No mainline station, but a tram two stops away is still a way out.
    const tram = town({ trainKm: 40, metroKm: 0.6, busKm: 12 });
    expect(transitKm(tram)).toBeCloseTo(0.6, 6);
  });

  it('ignores modes that are absent rather than treating them as far away', () => {
    const railOnly = town({ trainKm: 4, metroKm: null, busKm: null });
    expect(transitKm(railOnly)).toBeCloseTo(4, 6);
  });

  it('returns null where nothing was surveyed, so the filter cannot lie', () => {
    const unsurveyed = town({
      transitSurveyed: false, trainKm: null, metroKm: null, busKm: null,
    });
    expect(transitKm(unsurveyed)).toBeNull();
    // And a place with no known transport must not silently pass a filter
    // that demands some.
    const f = { ...DEFAULT_FILTERS, maxTransitKm: 5 };
    expect(rejectReason(unsurveyed, f)).toBe('no public transport nearby');
  });

  it('filters on any mode, not just rail', () => {
    const f = { ...DEFAULT_FILTERS, maxTransitKm: 2 };
    expect(rejectReason(town({ trainKm: 40, metroKm: 1, busKm: 30 }), f)).toBeNull();
    expect(rejectReason(town({ trainKm: 40, metroKm: 9, busKm: 30 }), f))
      .toBe('no public transport nearby');
  });

  it('rewards a close metro more than a close mainline station', () => {
    // A metro at 6 km is nearly useless for daily life; a mainline station at
    // 6 km is fine, because it is about reaching other cities.
    const metroFar = town({ amenitiesSurveyed: false, trainKm: 6, metroKm: 6, busKm: null,
      supermarketKm: null, pharmacyKm: null, hospitalKm: null, supermarket5km: null });
    const metroNear = town({ amenitiesSurveyed: false, trainKm: 6, metroKm: 0.5, busKm: null,
      supermarketKm: null, pharmacyKm: null, hospitalKm: null, supermarket5km: null });
    expect(amenityScore(metroNear)!).toBeGreaterThan(amenityScore(metroFar)!);
  });
});

describe('amenity layers score independently', () => {
  // Shops/health are Spain only; rail covers Europe and much of Asia. Scoring
  // used to bail on the Spanish flag alone, so measured rail access outside
  // Spain was collected and then ignored.
  it('scores a European town on its rail even with no Spanish layers', () => {
    const ro = town({
      amenitiesSurveyed: false, transitSurveyed: true, trainKm: 2,
      supermarketKm: null, pharmacyKm: null, hospitalKm: null, supermarket5km: null,
    });
    const far = town({
      amenitiesSurveyed: false, transitSurveyed: true, trainKm: 44,
      supermarketKm: null, pharmacyKm: null, hospitalKm: null, supermarket5km: null,
    });
    expect(amenityScore(ro)).not.toBeNull();
    expect(amenityScore(ro)!).toBeGreaterThan(amenityScore(far)!);
  });

  it('returns null only when nothing at all was surveyed', () => {
    const nowhere = town({
      amenitiesSurveyed: false, transitSurveyed: false, trainKm: null,
      supermarketKm: null, pharmacyKm: null, hospitalKm: null, supermarket5km: null,
    });
    expect(amenityScore(nowhere)).toBeNull();
  });

  it('still uses the full Spanish set where it exists', () => {
    const es = town({ amenitiesSurveyed: true, transitSurveyed: true });
    expect(amenityScore(es)).not.toBeNull();
  });
});

describe('ownership and residence are separate questions', () => {
  it('keeps a place you can buy in but would need a visa for', () => {
    // Japan sells freehold to anyone and grants residency to almost nobody.
    // Collapsing the two into one field would lose exactly that distinction.
    const jp = town({ country: 'JP', continent: 'Asia', ownership: 'freehold', residence: 'visa' });
    expect(rejectReason(jp, DEFAULT_FILTERS)).toBeNull();
  });

  it('drops it once the user says they only want free movement', () => {
    const jp = town({ country: 'JP', continent: 'Asia', ownership: 'freehold', residence: 'visa' });
    const f = { ...DEFAULT_FILTERS, freeMovementOnly: true };
    expect(rejectReason(jp, f)).toBe('would need a visa');
    expect(rejectReason(town({ residence: 'free' }), f)).toBeNull();
  });

  it('still hides places nobody can buy in, by default', () => {
    // New Zealand: right to live is irrelevant when you cannot own the house.
    const nz = town({ country: 'NZ', continent: 'Oceania', ownership: 'prohibited', residence: 'visa' });
    expect(rejectReason(nz, DEFAULT_FILTERS)).toBe('cannot buy there');
  });
});

describe('summer preference is symmetric', () => {
  it('scores nothing when no summer has been asked for', () => {
    // Silence is not a preference for cool weather.
    expect(summerFit(town({ hottestTmax: 22 }), null)).toBeNull();
    expect(summerFit(town({ hottestTmax: 34 }), null)).toBeNull();
  });

  it('rewards hitting the target from either side', () => {
    const cool = town({ hottestTmax: 24 });
    const warm = town({ hottestTmax: 32 });
    // Someone who wants 32 is not expressing a worse preference than someone
    // who wants 24, and the model must not favour one of them by default.
    expect(summerFit(warm, 32)!).toBeGreaterThan(summerFit(cool, 32)!);
    expect(summerFit(cool, 24)!).toBeGreaterThan(summerFit(warm, 24)!);
    expect(summerFit(warm, 32)).toBeCloseTo(summerFit(cool, 24)!, 6);
  });

  it('penalises overshooting a warm target as much as undershooting it', () => {
    expect(summerFit(town({ hottestTmax: 26 }), 30)).toBeCloseTo(
      summerFit(town({ hottestTmax: 34 }), 30)!,
      6,
    );
  });

  it('ranks a hot place top for someone who asked for heat', () => {
    const hot = town({ id: 'hot', hottestTmax: 33, daysOver30: 90, tropicalNights: 60 });
    const cool = town({ id: 'cool', hottestTmax: 23, daysOver30: 2, tropicalNights: 1 });
    const f = { ...DEFAULT_FILTERS, summerTarget: 33 };
    const w = { ...DEFAULT_WEIGHTS, summerFit: 10, affinity: 0 };
    const out = rank([cool, hot], f, w, { refs: [] });
    expect(out[0].town.id).toBe('hot');
  });
});

describe('drive time', () => {
  it('turns distance into minutes, not kilometres', () => {
    // Bilbao to BIO is ~13 km straight line and about 20 minutes in reality.
    expect(driveMinutes(13 * 1.25, 900)).toBeGreaterThan(14);
    expect(driveMinutes(13 * 1.25, 900)).toBeLessThan(30);
  });

  it('makes the same distance slower across mountains', () => {
    const flat = driveMinutes(50, 100)!;
    const alpine = driveMinutes(50, 1800)!;
    expect(alpine).toBeGreaterThan(flat * 1.2);
  });

  it('averages a higher speed on longer runs', () => {
    const short = driveMinutes(20, 300)! / 20;
    const long = driveMinutes(200, 300)! / 200;
    expect(long).toBeLessThan(short);
  });

  it('formats hours past ninety minutes', () => {
    expect(formatDrive(45)).toBe('45 min');
    expect(formatDrive(140)).toBe('2 h 20');
    expect(formatDrive(null)).toBe('n/a');
  });

  it('is what the airport filters actually cut on', () => {
    // 250 km used to pass almost everything; an hour is a real constraint.
    const near = town({ hubKm: 30, relief25km: 200 });
    const far = town({ hubKm: 220, relief25km: 200 });
    const f = { ...DEFAULT_FILTERS, maxHubMin: 60 };
    expect(rejectReason(near, f)).toBeNull();
    expect(rejectReason(far, f)).toBe('hub airport too far');
  });
});

describe('favourite climates', () => {
  const bilbao = town({ id: 'A', name: 'Bilbao', hottestTmax: 26.5, hottestTmin: 18.6,
    daysOver30: 3.6, tropicalNights: 12.6, annualRain: 1183, winterTmin: 7.7 });
  const sapporo = town({ id: 'B', name: 'Sapporo', hottestTmax: 26.4, hottestTmin: 19.3,
    daysOver30: 8, tropicalNights: 20, annualRain: 1100, winterTmin: -5.1 });

  it('matches the closest favourite, never their average', () => {
    // A place just like Sapporo must not be dragged down by Bilbao being in
    // the list -- averaging two references describes a climate that may not
    // exist anywhere.
    const likeSapporo = town({ ...sapporo, id: 'C' });
    const both = climateMatch(likeSapporo, [bilbao, sapporo]);
    const onlyBilbao = climateMatch(likeSapporo, [bilbao]);
    expect(both).toBeGreaterThan(onlyBilbao);
    expect(both).toBeCloseTo(1, 5);
  });

  it('adding a favourite can only help a candidate, never hurt it', () => {
    const t = town({ id: 'D', hottestTmax: 30, tropicalNights: 40 });
    const one = climateMatch(t, [bilbao]);
    const two = climateMatch(t, [bilbao, sapporo]);
    expect(two).toBeGreaterThanOrEqual(one);
  });

  it('names which favourite a place resembles', () => {
    expect(bestMatch(town({ ...sapporo, id: 'E' }), [bilbao, sapporo])!.town.name)
      .toBe('Sapporo');
  });

  it('falls back to neutral with no favourites at all', () => {
    expect(climateMatch(town(), [])).toBe(0.5);
    expect(bestMatch(town(), [])).toBeNull();
  });
});

describe('listings', () => {
  it('slugifies Spanish names the way the portals do', () => {
    expect(slug('A Coruña')).toBe('a-coruna');
    expect(slug('Donostia/San Sebastián')).toBe('donostia-san-sebastian');
    expect(slug('Vitoria-Gasteiz')).toBe('vitoria-gasteiz');
  });

  it('moves a trailing article to the front for portal URLs', () => {
    const t = town({ name: 'Ejido, El', province: 'Almeria' });
    const url = portalLinks(t, DEFAULT_FILTERS)[0].url;
    expect(url).toContain('el-ejido-almeria');
  });

  it('carries the budget and size filters into the deep link', () => {
    const links = portalLinks(town(), { ...DEFAULT_FILTERS, budget: 350_000, minM2: 90 });
    expect(links[0].url).toContain('con-precio-hasta_350000');
    expect(links[0].url).toContain('metros-cuadrados-mas-de_90');
  });

  it('parses a listings CSV and compares each row with its town', () => {
    const towns = [town({ id: 'ES-48020', name: 'Bilbao', eurM2: 4000 })];
    const csv = [
      'title,url,price,m2,town',
      'Nice flat,http://x,320000,80,Bilbao',
      'Bad row,http://y,,90,Bilbao',
    ].join('\n');
    const { listings, errors } = parseListingsCsv(csv, towns);
    // Both rows are kept. A row with no price is not a bad row: for a list of
    // developments it is the normal state of the ones not yet launched, and
    // dropping it throws away the thing you were tracking.
    expect(listings).toHaveLength(2);
    expect(errors).toHaveLength(0);
    expect(listings[0].eurM2).toBe(4000);
    expect(listings[0].vsTownPct).toBeCloseTo(0, 5);
    expect(listings[0].id).toBe('ES-48020');
    expect(listings[1].price).toBeUndefined();
    expect(listings[1].eurM2).toBeUndefined();
    expect(listings[1].id).toBe('ES-48020');
  });

  it('rejects a CSV it cannot place on the map', () => {
    const { errors } = parseListingsCsv('a,b\n1,2', []);
    // Price is optional now, so the one column it cannot do without is the
    // one that ties a row to somewhere.
    expect(errors[0]).toMatch(/municipality/);
  });
});
