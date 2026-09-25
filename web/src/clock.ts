/**
 * Time, light and distance: three things that decide daily life abroad and
 * that no climate normal captures.
 *
 *   * The time difference from your working clock. For anyone employed
 *     remotely, a town nine hours out means working nights, however cheap it is.
 *   * Winter daylight. Someone who loves the cold may not have pictured five
 *     hours of daylight in December, or none at all above the Arctic Circle.
 *   * How far home is, for family and for the flights back.
 *
 * All computed in the browser from what the dataset already carries (an IANA
 * zone and coordinates), so none of it needs the pipeline rerun.
 */
import type { Town } from './types';

/** Mean Earth radius, the same constant the pipeline measures with. */
const EARTH_R_KM = 6371.0088;

// ------------------------------------------------------------------ clocks

/**
 * The zone this device runs on. A far better default for "your working clock"
 * than anything derived from the home country: the United States alone spans
 * six zones, and the browser already knows which one you are in.
 */
export function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

const offsetCache = new Map<string, number | null>();

/**
 * UTC offset of `tz` at instant `at`, in hours. Computed by asking Intl for the
 * wall-clock time there and differencing, which works in every browser that
 * has time zone support at all, unlike the newer `longOffset` format.
 */
export function utcOffsetHours(tz: string, at: Date): number | null {
  const key = `${tz}|${at.getTime()}`;
  if (offsetCache.has(key)) return offsetCache.get(key)!;
  let out: number | null = null;
  try {
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const p: Record<string, number> = {};
    for (const part of f.formatToParts(at)) if (part.type !== 'literal') p[part.type] = Number(part.value);
    const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
    out = Math.round(((wall - at.getTime()) / 3_600_000) * 4) / 4;
  } catch {
    out = null; // an unknown zone name: say nothing rather than guess
  }
  offsetCache.set(key, out);
  return out;
}

/**
 * The two instants the gap is measured at: midwinter and midsummer. Daylight
 * saving starts and ends on different dates in different places, and the
 * southern hemisphere runs it the other way round, so Madrid and Santiago are
 * five hours apart in January and six in July. Using both catches that.
 */
function solsticeInstants(year = new Date().getUTCFullYear()): [Date, Date] {
  return [new Date(Date.UTC(year, 0, 15, 12)), new Date(Date.UTC(year, 6, 15, 12))];
}

export interface TzGap {
  /** Their clock minus yours, in January and in July, in hours. */
  jan: number;
  jul: number;
  /** The larger of the two, unsigned. What a limit is checked against. */
  worst: number;
}

const gapCache = new Map<string, TzGap | null>();

export function tzGap(theirs: string | null | undefined, mine: string | null): TzGap | null {
  if (!theirs || !mine) return null;
  const key = `${theirs}|${mine}`;
  if (gapCache.has(key)) return gapCache.get(key)!;
  const [jan, jul] = solsticeInstants();
  const a1 = utcOffsetHours(theirs, jan);
  const b1 = utcOffsetHours(mine, jan);
  const a2 = utcOffsetHours(theirs, jul);
  const b2 = utcOffsetHours(mine, jul);
  let out: TzGap | null = null;
  if (a1 != null && b1 != null && a2 != null && b2 != null) {
    const g1 = a1 - b1;
    const g2 = a2 - b2;
    out = { jan: g1, jul: g2, worst: Math.max(Math.abs(g1), Math.abs(g2)) };
  }
  gapCache.set(key, out);
  return out;
}

const signed = (h: number) => {
  if (h === 0) return 'same time';
  const whole = Math.trunc(Math.abs(h));
  const mins = Math.round((Math.abs(h) - whole) * 60);
  const body = mins ? `${whole} h ${String(mins).padStart(2, '0')}` : `${whole} h`;
  return `${h > 0 ? '+' : '-'}${body}`;
};

/** "same time", "+1 h", "-6 h (-5 h in July)". */
export function formatTzGap(g: TzGap | null): string {
  if (!g) return 'n/a';
  if (g.jan === g.jul) return g.jan === 0 ? 'same time as you' : `${signed(g.jan)} from you`;
  return `${signed(g.jan)} in January, ${signed(g.jul)} in July`;
}

// ---------------------------------------------------------------- daylight

/**
 * Hours from sunrise to sunset on a given day of the year, at a latitude.
 * Standard solar geometry, with the sun's disc and atmospheric refraction
 * folded into the -0.83 degree horizon, so it matches published sunrise tables
 * to within a few minutes. Returns 0 in polar night and 24 in midnight sun.
 */
export function daylightHours(lat: number, dayOfYear: number): number {
  const rad = Math.PI / 180;
  const decl = -23.44 * rad * Math.cos(((2 * Math.PI) / 365) * (dayOfYear + 10));
  const phi = lat * rad;
  const cosW = (Math.sin(-0.833 * rad) - Math.sin(phi) * Math.sin(decl))
    / (Math.cos(phi) * Math.cos(decl));
  if (cosW <= -1) return 24;
  if (cosW >= 1) return 0;
  return (2 * Math.acos(cosW)) / rad / 15;
}

/** Daylight on the shortest day, whichever solstice that is where you are. */
export function shortestDay(lat: number): number {
  return Math.min(daylightHours(lat, 172), daylightHours(lat, 355));
}

/** Daylight on the longest day. */
export function longestDay(lat: number): number {
  return Math.max(daylightHours(lat, 172), daylightHours(lat, 355));
}

export function formatHours(h: number): string {
  if (h <= 0) return 'none (polar night)';
  if (h >= 24) return '24 h (midnight sun)';
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  return mins === 60 ? `${whole + 1} h` : `${whole} h ${String(mins).padStart(2, '0')}`;
}

// -------------------------------------------------------------------- home

/**
 * Where "home" is measured from: the largest place in the home country. For
 * most countries that is the capital or near enough, and the UI names it, so
 * nobody in Lyon is told Paris is where they live without seeing that it said
 * Paris.
 */
export function homeAnchor(towns: Town[], cc: string | null): Town | null {
  if (!cc) return null;
  let best: Town | null = null;
  for (const t of towns) if (t.country === cc && (!best || t.pop > best.pop)) best = t;
  return best;
}

export function greatCircleKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = Math.PI / 180;
  const dp = (bLat - aLat) * rad;
  const dl = (bLon - aLon) * rad;
  const h = Math.sin(dp / 2) ** 2
    + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * A rough door-to-door flight time, direct, in hours: cruise at about 800 km/h
 * plus most of an hour for the climb, the descent and the taxiing. Checked
 * against scheduled block times: Madrid to Paris lands at two hours, to New
 * York at eight. Connections add more, so read it as a floor.
 */
export function flightHours(km: number): number {
  return km / 800 + 0.6;
}
