/**
 * Suggestions by AREA rather than by town.
 *
 * The top of a ranking is rarely fifty different answers. It is usually one
 * or two metropolitan fringes several times over: sixteen Lisbon suburbs,
 * fourteen around Bilbao, each a point apart, because neighbours share a
 * climate, an airport and a coastline. Read as a list that is noise; read as
 * areas it is the actual finding ("the Lisbon area, sixteen ways") and the
 * places further down get a look in.
 *
 * An area is a first-level region within a country (a Spanish province, a
 * Portuguese district, a Romanian county), which is the grain people think in
 * when they say where they might move.
 */
import type { Ranked } from './scoring';

export interface Area {
  key: string;
  name: string;
  country: string;
  countryName: string;
  /** Matching places in this area, best first. */
  places: Ranked[];
  /** The best place's score: an area is as good as the best you could live in. */
  score: number;
  /** Median price and summer across its matches, to tell areas apart at a glance. */
  medianEurM2: number;
  medianSummer: number;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

export function groupAreas(ranked: Ranked[], scoreOf: (r: Ranked) => number = (r) => r.score): Area[] {
  const by = new Map<string, Ranked[]>();
  for (const r of ranked) {
    const key = `${r.town.country}|${r.town.province}`;
    const list = by.get(key);
    if (list) list.push(r);
    else by.set(key, [r]);
  }
  const out: Area[] = [];
  for (const [key, places] of by) {
    // `ranked` arrives sorted, but gems and near misses sort by their own key.
    places.sort((a, b) => scoreOf(b) - scoreOf(a));
    const t = places[0].town;
    out.push({
      key,
      name: t.province,
      country: t.country,
      countryName: t.countryName,
      places,
      score: scoreOf(places[0]),
      medianEurM2: median(places.map((p) => p.town.eurM2)),
      medianSummer: median(places.map((p) => p.town.hottestTmax)),
    });
  }
  // Best first; between equals, the area with more choice.
  out.sort((a, b) => b.score - a.score || b.places.length - a.places.length);
  return out;
}
