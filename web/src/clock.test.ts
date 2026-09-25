import { describe, it, expect } from 'vitest';
import {
  daylightHours, flightHours, formatHours, formatTzGap, greatCircleKm, homeAnchor,
  longestDay, shortestDay, tzGap, utcOffsetHours,
} from './clock';
import type { Town } from './types';

describe('daylight', () => {
  it('matches published sunrise tables', () => {
    // Madrid, 21 December: 9 h 17 m of daylight.
    expect(shortestDay(40.42)).toBeGreaterThan(9.1);
    expect(shortestDay(40.42)).toBeLessThan(9.45);
    // Oslo: under six hours.
    expect(shortestDay(59.91)).toBeGreaterThan(5.6);
    expect(shortestDay(59.91)).toBeLessThan(6.1);
  });

  it('knows polar night and midnight sun', () => {
    expect(shortestDay(69.65)).toBe(0); // Tromso
    expect(longestDay(69.65)).toBe(24);
    expect(formatHours(0)).toMatch(/polar night/);
  });

  it('puts the shortest day in June south of the equator', () => {
    // Punta Arenas has its short day at the June solstice, not December.
    expect(daylightHours(-53.2, 172)).toBeLessThan(daylightHours(-53.2, 355));
    expect(shortestDay(-53.2)).toBeCloseTo(daylightHours(-53.2, 172), 6);
  });

  it('is about twelve hours at the equator all year', () => {
    expect(shortestDay(0)).toBeGreaterThan(11.9);
    expect(longestDay(0)).toBeLessThan(12.3);
  });
});

describe('time differences', () => {
  it('reads real offsets, half hours included', () => {
    expect(utcOffsetHours('Asia/Kolkata', new Date(Date.UTC(2026, 0, 15, 12)))).toBe(5.5);
    expect(utcOffsetHours('Not/AZone', new Date())).toBeNull();
  });

  it('measures both solstices, because daylight saving disagrees', () => {
    // Chile runs daylight saving in the southern summer, Spain in the
    // northern one, so the gap is four hours in January and six in July.
    const g = tzGap('America/Santiago', 'Europe/Madrid')!;
    expect(g.jan).toBe(-4);
    expect(g.jul).toBe(-6);
    expect(g.worst).toBe(6);
    expect(formatTzGap(g)).toMatch(/-4 h in January, -6 h in July/);
  });

  it('says so when two places share a clock', () => {
    const g = tzGap('Europe/Paris', 'Europe/Madrid')!;
    expect(g.worst).toBe(0);
    expect(formatTzGap(g)).toBe('same time as you');
  });

  it('returns null rather than guessing when a zone is missing', () => {
    expect(tzGap(null, 'Europe/Madrid')).toBeNull();
    expect(tzGap('Europe/Madrid', null)).toBeNull();
  });
});

describe('distance from home', () => {
  const t = (over: Partial<Town>) => ({ country: 'ES', pop: 1, lat: 0, lon: 0, ...over } as Town);

  it('measures from the largest place in the home country, and says which', () => {
    const towns = [t({ id: 'a', name: 'Small', pop: 10 }), t({ id: 'b', name: 'Madrid', pop: 3_000_000 }),
      t({ id: 'c', name: 'Paris', country: 'FR', pop: 2_000_000 })];
    expect(homeAnchor(towns, 'ES')!.name).toBe('Madrid');
    expect(homeAnchor(towns, null)).toBeNull();
  });

  it('turns distance into a plausible direct flight', () => {
    // Madrid to Paris is about 1,050 km and two hours gate to gate.
    const km = greatCircleKm(40.42, -3.7, 48.86, 2.35);
    expect(km).toBeGreaterThan(1_000);
    expect(km).toBeLessThan(1_100);
    expect(flightHours(km)).toBeGreaterThan(1.7);
    expect(flightHours(km)).toBeLessThan(2.2);
  });
});
