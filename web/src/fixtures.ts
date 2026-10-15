/** A complete, plausible town for tests: an Atlantic Spanish town of 20,000. */
import type { Town } from './types';


export function town(over: Partial<Town> = {}): Town {
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

