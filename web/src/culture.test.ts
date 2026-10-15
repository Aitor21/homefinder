import { describe, expect, it } from 'vitest';
import {
  cultureEstimate, cultureScore, EVENTS, eventsNear, eventsScore, formatMonths, venueScore,
} from './culture';
import { breakdown } from './scoring';
import { DEFAULT_FILTERS } from './types';
import { town } from './fixtures';

const bilbao = () => town({ name: 'Bilbao', lat: 43.263, lon: -2.935, pop: 345_000, city100kKm: 0, city250kKm: 0 });
const nowhere = () => town({ lat: -60, lon: -30, pop: 3_000, city100kKm: 400, city250kKm: 600 });

describe('event registry', () => {
  it('is well formed', () => {
    const names = new Set<string>();
    for (const e of EVENTS) {
      expect(Math.abs(e.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(e.lon)).toBeLessThanOrEqual(180);
      expect(e.months.length).toBeGreaterThan(0);
      for (const m of e.months) expect(m >= 0 && m <= 11).toBe(true);
      expect(e.cc).toMatch(/^[A-Z]{2}$/);
      const key = `${e.name}|${e.where}`;
      expect(names.has(key)).toBe(false);
      names.add(key);
    }
  });

  it('formats months, including wrap-arounds and twice-yearly events', () => {
    expect(formatMonths([6])).toBe('Jul');
    expect(formatMonths([5, 6])).toBe('Jun–Jul');
    expect(formatMonths([11, 0])).toBe('Dec–Jan');
    expect(formatMonths([3, 9])).toBe('Apr, Oct');
  });
});

describe('events near a place', () => {
  it('finds Bilbao’s own festivals, nearest first, within the radius only', () => {
    const near = eventsNear(bilbao());
    expect(near.map((n) => n.event.name)).toContain('BBK Live');
    for (let i = 1; i < near.length; i++) expect(near[i].km).toBeGreaterThanOrEqual(near[i - 1].km);
    for (const n of near) expect(n.km).toBeLessThanOrEqual(100);
    // Pamplona is ~130 km away: out of an evening's reach.
    expect(near.map((n) => n.event.name)).not.toContain('San Fermín');
  });

  it('scores a festival city high, the middle of the ocean zero, and saturates', () => {
    expect(eventsScore(bilbao())).toBeGreaterThan(0.8);
    expect(eventsScore(nowhere())).toBe(0);
    expect(eventsScore(town({ lat: 41.39, lon: 2.17 }))).toBeLessThanOrEqual(1);
  });
});

describe('culture', () => {
  it('estimates from city size when venues were never surveyed', () => {
    const t = bilbao();
    expect(venueScore(t)).toBeNull();
    expect(cultureScore(t)).toBe(cultureEstimate(t));
    expect(cultureEstimate(t)).toBeGreaterThan(0.8);
    expect(cultureEstimate(nowhere())).toBeLessThan(0.1);
  });

  it('credits being near a big city, not just being one', () => {
    const suburb = town({ pop: 8_000, city250kKm: 12, city100kKm: 12 });
    const remote = town({ pop: 8_000, city250kKm: 150, city100kKm: 90 });
    expect(cultureEstimate(suburb)).toBeGreaterThan(cultureEstimate(remote) + 0.4);
  });

  it('uses counted venues once the culture stage has run', () => {
    const lively = town({
      cultureSurveyed: true, museum15km: 20, theatre15km: 10, music15km: 15, arts15km: 8, cinemaKm: 1,
      pop: 8_000, city250kKm: 200, city100kKm: 200,
    });
    const quiet = town({
      cultureSurveyed: true, museum15km: 0, theatre15km: 0, music15km: 0, arts15km: 0, cinemaKm: 30,
    });
    expect(venueScore(lively)!).toBeGreaterThan(0.85);
    expect(venueScore(quiet)!).toBeLessThan(0.05);
    // The measurement wins over the estimate, in both directions.
    expect(cultureScore(lively)).toBeGreaterThan(cultureEstimate(lively));
  });

  it('falls back to the estimate where the country is barely mapped', () => {
    const t = town({ cultureSurveyed: true, cultureMapped: 0.1, museum15km: 0, theatre15km: 0 });
    expect(venueScore(t)).toBeNull();
  });

  it('feeds both dimensions into the score breakdown', () => {
    const b = breakdown(bilbao(), DEFAULT_FILTERS, { refs: [] });
    expect(b.culture).toBeGreaterThan(0);
    expect(b.events).toBeGreaterThan(0);
  });
});
