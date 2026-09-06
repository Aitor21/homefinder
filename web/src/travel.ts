/**
 * Turning distance into drive time.
 *
 * Kilometres are the wrong unit for this question. Nobody wants to be "within
 * 90 km of an airport"; they want to be forty minutes away. And the same 50 km
 * is half an hour across the meseta and an hour and a quarter over a Cantabrian
 * pass, so a single road factor cannot answer it either.
 *
 * The stored `hubKm` and `airportKm` are straight-line distances already
 * multiplied by a flat 1.25. This model unwinds that and applies a terrain-aware
 * one instead, then an effective speed that rises with trip length, short hops
 * are urban and slow, long runs find a motorway.
 *
 * Calibrated against journeys I could check:
 *   Bilbao   -> BIO   13 km straight line, ~20 min real     -> model 21 min
 *   Vitoria  -> BIO   55 km straight line, ~65 min real     -> model 62 min
 *   Alonsotegi -> BIO 13 km, ~25 min real                   -> model 23 min
 *
 * It is an estimate, not a routing engine. Treat a 40-minute answer as
 * "roughly forty minutes", and check the real route before signing anything.
 */

/** The flat road factor already baked into the stored distances. */
const STORED_ROAD_FACTOR = 1.25;

/**
 * Convert a stored distance back to straight-line, then to minutes by road.
 *
 * @param storedKm  distance as held in the dataset (straight-line x 1.25)
 * @param relief    metres of relief within 25 km; 0 for flat, ~1800 alpine
 */
export function driveMinutes(storedKm: number | null, relief: number | null): number | null {
  if (storedKm == null || !Number.isFinite(storedKm)) return null;
  const straight = storedKm / STORED_ROAD_FACTOR;
  const r = relief ?? 300;

  // Mountains add distance: you go around things rather than through them.
  const detour = 1.18 + Math.min(0.28, r * 0.00014);
  const roadKm = straight * detour;

  // Top speed the terrain allows, and an effective speed that approaches it as
  // the trip lengthens. The +10 makes a 13 km hop average ~43 km/h, which is
  // what a real airport run through a city actually manages (Bilbao to BIO,
  // 13 km with a dual carriageway most of the way, lands at ~23 min).
  const vmax = Math.max(45, 78 - r * 0.010);
  const speed = (vmax * roadKm) / (roadKm + 10);
  return Math.round((60 * roadKm) / Math.max(speed, 12));
}

/** Human-readable drive time: "35 min", "1 h 20". */
export function formatDrive(mins: number | null): string {
  if (mins == null) return 'n/a';
  if (mins < 90) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

/**
 * Rough inverse, for turning a minutes filter into the km the data is stored in.
 * Only used to keep the sliders honest about what they are cutting.
 */
export function minutesToStoredKm(mins: number, relief = 300): number {
  let lo = 0;
  let hi = 2000;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const got = driveMinutes(mid, relief);
    if (got != null && got < mins) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
