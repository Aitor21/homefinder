/**
 * Why a place is suggested, in words.
 *
 * A score of 83 says nothing on its own, and the top fifty of a search tend to
 * sit within three points of each other, so the number cannot tell you why one
 * place rather than the next. What can is the handful of dimensions where this
 * place does markedly better (or worse) than the TYPICAL place in your own
 * results, weighted by how much you said each one matters. "8 km from the sea"
 * is only worth saying if the rest of your list is not also by the sea.
 *
 * So every phrase is measured against a reference: the median of each
 * dimension across the top of the current ranking. Strengths are where a place
 * beats it on something you weight; trade-offs are where it falls well short,
 * or is simply poor, on something you weight. Each comes with the real number,
 * because "good airport access" is a claim and "25 min to Lisbon" is a fact.
 */
import type { Town, Weights } from './types';
import { DEFAULT_WEIGHTS } from './types';
import type { Breakdown, Ranked } from './scoring';
import { affordableM2, hubDriveMin, transitKm } from './scoring';
import { formatDrive } from './travel';
import { eventsNear, venuesSurveyed } from './culture';

export type Typical = Partial<Record<keyof Breakdown, number>>;

/** The median of each dimension across the top of a ranking. */
export function typicalOf(ranked: Ranked[], n = 300): Typical {
  const out: Typical = {};
  const rows = ranked.slice(0, n);
  if (!rows.length) return out;
  for (const k of Object.keys(rows[0].breakdown) as Array<keyof Breakdown>) {
    const vals: number[] = [];
    for (const r of rows) {
      const v = r.breakdown[k];
      if (v != null && Number.isFinite(v)) vals.push(v);
    }
    if (!vals.length) continue;
    vals.sort((a, b) => a - b);
    out[k] = vals[Math.floor(vals.length / 2)];
  }
  return out;
}

export interface Reason {
  dim: keyof Breakdown;
  kind: 'strength' | 'tradeoff';
  text: string;
}

export interface ExplainCtx {
  weights: Weights;
  typical: Typical;
  budget: number;
  summerTarget: number | null;
  /** Home country's cost index, so living costs read against home. */
  homeIndex?: number | null;
  homeName?: string | null;
}

const r0 = (v: number) => Math.round(v).toLocaleString();

/** The fact behind a dimension, for this place, in a few words. */
export function fact(dim: keyof Breakdown, t: Town, c: ExplainCtx, good: boolean): string | null {
  switch (dim) {
    case 'summerFit': {
      const h = Math.round(t.hottestTmax);
      if (c.summerTarget == null) return `${h}° summer highs`;
      const d = t.hottestTmax - c.summerTarget;
      if (Math.abs(d) <= 1.5) return `${h}° summers, right on your ${c.summerTarget}°`;
      return `${h}° summers, ${Math.round(Math.abs(d))}° ${d > 0 ? 'hotter' : 'cooler'} than you asked`;
    }
    case 'affordability':
      return `~€${r0(t.eurM2)}/m², your budget buys ${r0(affordableM2(t, c.budget))} m²`;
    case 'airport': {
      const m = hubDriveMin(t);
      return m == null ? null : `${formatDrive(m)} to ${t.hubName} airport`;
    }
    case 'city':
      return t.city100kKm < 3 ? 'In a city of 100,000+' : `${r0(t.city100kKm)} km to ${t.city100kName}`;
    case 'amenities': {
      const tr = transitKm(t);
      if (good) return tr != null && tr <= 2 ? 'Shops, health and transit close by' : 'Shops and health close by';
      return t.supermarketKm != null && t.supermarketKm > 5
        ? `${r0(t.supermarketKm)} km to a supermarket`
        : 'Few everyday services nearby';
    }
    case 'mountains':
      return t.relief25km == null ? null
        : good ? `Mountains, peaks to ${r0(t.maxElev25km ?? 0)} m` : 'Flat surroundings';
    case 'coast':
      return t.coastKm == null ? null : t.coastKm < 3 ? 'On the coast' : `${r0(t.coastKm)} km from the sea`;
    case 'winterMild':
      return `${Math.round(t.winterTmin)}° winter nights`;
    case 'drier':
      return `${r0(t.annualRain)} mm of rain a year`;
    case 'sunny':
      return good ? 'Bright, sunny climate' : 'Often overcast';
    case 'cleanAir':
      return t.pm25 == null ? null : `PM2.5 ${t.pm25.toFixed(1)} µg/m³${good ? ', clean air' : ''}`;
    case 'internet':
      return t.netDownMbps == null ? null : `${r0(t.netDownMbps)} Mbps broadband`;
    case 'livingCost': {
      if (t.costIndex == null) return null;
      if (c.homeIndex) {
        const pct = Math.round((t.costIndex / c.homeIndex - 1) * 100);
        if (Math.abs(pct) < 4) return `Everyday costs like ${c.homeName ?? 'home'}`;
        return `Everyday costs ${Math.abs(pct)}% ${pct < 0 ? 'below' : 'above'} ${c.homeName ?? 'home'}`;
      }
      return good ? 'Cheap everyday costs' : 'Expensive everyday costs';
    }
    case 'energyBill':
      return t.energyEurYear == null ? null : `~€${r0(t.energyEurYear)}/yr to heat and cool`;
    case 'affinity':
      return good ? 'Like the places you liked' : 'Unlike the places you liked';
    case 'nature':
      return t.parkKm == null ? null : t.parkKm < 1 ? 'Protected nature on the doorstep' : `${r0(t.parkKm)} km to protected nature`;
    case 'ski':
      return t.skiKm == null ? null : `${r0(t.skiKm)} km to ski slopes`;
    case 'pets':
      return t.vetKm == null ? (good ? 'Good for a dog' : null) : good ? `Dog-friendly, vet ${r0(t.vetKm)} km` : `${r0(t.vetKm)} km to a vet`;
    case 'safety':
      return t.homicideRate == null ? null : good ? `Very safe country (${t.homicideRate.toFixed(1)} per 100k)` : `Higher crime country (${t.homicideRate.toFixed(1)} per 100k)`;
    case 'culture':
      if (venuesSurveyed(t)) return `${t.museum15km} museums, ${t.theatre15km} theatres within 15 km`;
      return good ? 'Big-city culture within reach' : 'Little culture nearby';
    case 'events': {
      const ev = eventsNear(t);
      if (!ev.length) return 'No big festivals nearby';
      const names = ev.slice(0, 2).map((e) => e.event.name).join(', ');
      return ev.length > 2 ? `${names} +${ev.length - 2} more` : names;
    }
    default:
      return null;
  }
}

/** Below this weight a dimension is a nudge, not a stated preference. */
const MIN_WEIGHT = 2;

/**
 * Up to `max` strengths and `maxOff` trade-offs for one place, most telling
 * first. A strength must be good in absolute terms AND better than your list's
 * typical place; a trade-off must be poor in absolute terms OR well below it.
 */
export function reasons(r: Ranked, c: ExplainCtx, max = 3, maxOff = 2): Reason[] {
  const pros: Array<{ dim: keyof Breakdown; score: number }> = [];
  const cons: Array<{ dim: keyof Breakdown; score: number }> = [];
  for (const k of Object.keys(r.breakdown) as Array<keyof Breakdown>) {
    const v = r.breakdown[k];
    const w = c.weights[k] ?? 0;
    if (v == null || w < MIN_WEIGHT) continue;
    const ref = c.typical[k] ?? 0.5;
    const edge = v - ref;
    if (v >= 0.6 && edge > 0.08) pros.push({ dim: k, score: w * edge + w * 0.05 * v });
    // A trade-off is only worth naming on something you actually care about:
    // raised above its default, or weighted heavily anyway. Mountains carry a
    // small default weight, and "flat surroundings" on every seaside card was
    // noise to someone who never asked for mountains.
    else if ((v < 0.35 || edge < -0.25) && (w > (DEFAULT_WEIGHTS[k] ?? 0) || w >= 6)) {
      cons.push({ dim: k, score: w * Math.max(-edge, 0.35 - v) });
    }
  }
  // Nothing stands out from a list of similar places: then say what is
  // simply good about it, so the card is never blank.
  if (!pros.length) {
    for (const k of Object.keys(r.breakdown) as Array<keyof Breakdown>) {
      const v = r.breakdown[k];
      const w = c.weights[k] ?? 0;
      if (v != null && w >= MIN_WEIGHT && v >= 0.75) pros.push({ dim: k, score: w * v });
    }
  }
  pros.sort((a, b) => b.score - a.score);
  cons.sort((a, b) => b.score - a.score);
  const out: Reason[] = [];
  for (const p of pros) {
    if (out.length >= max) break;
    const text = fact(p.dim, r.town, c, true);
    if (text) out.push({ dim: p.dim, kind: 'strength', text });
  }
  let n = 0;
  for (const p of cons) {
    if (n >= maxOff) break;
    const text = fact(p.dim, r.town, c, false);
    if (text) {
      out.push({ dim: p.dim, kind: 'tradeoff', text });
      n++;
    }
  }
  return out;
}

/** "Top 1%", "Top 15%": where a rank sits in the list, for a score that cannot say it. */
export function topShare(rank: number, total: number): string {
  if (total <= 0) return '';
  const pct = (rank / total) * 100;
  if (pct <= 1) return 'Top 1%';
  if (pct <= 5) return `Top ${Math.ceil(pct)}%`;
  return `Top ${Math.ceil(pct / 5) * 5}%`;
}
