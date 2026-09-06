/**
 * Which developers are worth checking in a given place.
 *
 * A property portal answers "what is on sale today". It does not answer "who is
 * building here", and new construction sells off-plan, often through the
 * developer's own waiting list before it reaches a portal at all.
 */
import type { Developer, Town } from './types';

export interface DeveloperHit extends Developer {
  code: string;
  /** True when this company builds specifically in this province, rather than
   *  being a national that may or may not. */
  local: boolean;
}

/**
 * Spanish province slugs as the new-build portals write them, keyed by INE
 * code. Only the ones this tool actually points at: filling in all 52 from
 * guesses would mostly produce links that 404.
 */
const PROVINCE_SLUG: Record<string, string> = {
  '48': 'vizcaya', '20': 'guipuzcoa', '01': 'alava', '39': 'cantabria',
  '33': 'asturias', '15': 'la-coruna', '27': 'lugo', '32': 'orense',
  '36': 'pontevedra', '31': 'navarra', '09': 'burgos', '24': 'leon',
  '26': 'la-rioja', '34': 'palencia', '49': 'zamora', '05': 'avila',
  '40': 'segovia', '42': 'soria', '47': 'valladolid', '28': 'madrid',
  '08': 'barcelona', '46': 'valencia', '41': 'sevilla', '29': 'malaga',
  '03': 'alicante', '50': 'zaragoza',
};

/**
 * A live listing of what is actually on sale, which the registry cannot give.
 *
 * There is no open feed of individual new-build promotions: the portals forbid
 * harvesting and the ministry publishes construction data as province-level
 * PDFs. So this links out instead of storing anything. The portal stays current
 * by itself and nothing here can go stale.
 */
export function newBuildSearch(t: Town): { label: string; url: string } | null {
  const prov = provinceCode(t);
  const slug = prov ? PROVINCE_SLUG[prov] : undefined;
  if (!slug) return null;
  return {
    label: `New builds on sale in ${t.province}`,
    url: `https://viviendasnuevas.com/${slug}/promociones`,
  };
}

const SCALE_ORDER: Record<Developer['scale'], number> = {
  'very large': 0,
  large: 1,
  medium: 2,
  small: 3,
};

/**
 * The province code for a Spanish place. The id carries the INE code and its
 * first two digits are the province, which is why the id format is worth
 * keeping stable.
 */
export function provinceCode(t: Town): string | null {
  if (t.country !== 'ES') return null;
  const m = /^ES-(\d{2})\d{3}$/.exec(t.id);
  return m ? m[1] : null;
}

/**
 * Regionals first, then nationals, each by size.
 *
 * The order is the point. In the Basque Country the regional firms build more
 * homes than the listed majors do between them, so a list that put the famous
 * names on top would bury the ones actually pouring concrete there.
 */
export function developersFor(
  t: Town,
  all: Record<string, Developer> | undefined,
): DeveloperHit[] {
  if (!all) return [];
  const prov = provinceCode(t);
  if (!prov) return [];
  const out: DeveloperHit[] = [];
  for (const [code, d] of Object.entries(all)) {
    // Country gates everything: a Spanish promoter is no use in Finland.
    if (!d.countries.includes(t.country)) continue;
    // `public` matches like `regional`: both are tied to named provinces, and
    // a public agency is often the only route into protected housing there.
    const local = d.scope === 'regional' || d.scope === 'public';
    if (local && !d.provinces.includes(prov)) continue;
    out.push({ ...d, code, local });
  }
  out.sort(
    (a, b) =>
      // Public agencies first of all. They allocate by ballot from a registry
      // you have to join before anything is announced, so meeting them late is
      // meeting them too late.
      Number(b.scope === 'public') - Number(a.scope === 'public') ||
      Number(b.local) - Number(a.local) ||
      SCALE_ORDER[a.scale] - SCALE_ORDER[b.scale] ||
      a.name.localeCompare(b.name),
  );
  return out;
}
