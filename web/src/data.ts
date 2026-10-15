/**
 * Loading and rehydrating the columnar dataset.
 *
 * The pipeline ships columns rather than row objects because repeating ~50 keys
 * across 18k places costs more than the values do. Everything downstream still
 * wants objects, so this turns them back into objects once, on load.
 */
import type { Dataset, Town } from './types';

interface Columnar {
  format: string;
  meta: Dataset['meta'];
  n: number;
  dict: Record<string, string[]>;
  cols: Record<string, Array<number | string | null | number[]>>;
}

const foldName = (v: string | undefined) =>
  String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    // Words GeoNames appends to the same place under a second entry.
    .replace(/\b(city|town|gemeinde|stadt|municipality)\b/g, '')
    .replace(/[^a-z]/g, '');

/** Edit distance, capped: anything past `cap` is simply "different". */
function editDistance(a: string, b: string, cap = 3): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Two entries closer than this, with near-identical names, are one place. */
const SAME_PLACE_KM = 1.5;

/**
 * Drop the second copy of places GeoNames lists twice.
 *
 * "Costa de Caparica" and "Costa da Caparica" 300 m apart are one town, and
 * showing both in a top ten wastes a slot and reads as a bug. Deliberately
 * narrow: the names must match up to a couple of letters AND sit within
 * 1.5 km. Plenty of genuinely separate towns are that close (Nancy and
 * Villers-lès-Nancy, Mödling and Maria Enzersdorf) and none of them has a
 * near-identical name. The larger entry is kept.
 */
export function mergeDuplicates(towns: Town[]): Town[] {
  const cell = (lat: number, lon: number) => `${Math.floor(lat * 50)}|${Math.floor(lon * 50)}`;
  const grid = new Map<string, number[]>();
  // Rows without coordinates cannot be compared, and are left alone.
  const placed = (t: Town) => Number.isFinite(t.lat) && Number.isFinite(t.lon);
  towns.forEach((t, i) => {
    if (!placed(t)) return;
    const k = cell(t.lat, t.lon);
    const list = grid.get(k);
    if (list) list.push(i);
    else grid.set(k, [i]);
  });
  const drop = new Set<number>();
  const names = towns.map((t) => foldName(t.name));
  towns.forEach((t, i) => {
    if (drop.has(i) || !placed(t) || !names[i]) return;
    const cy = Math.floor(t.lat * 50);
    const cx = Math.floor(t.lon * 50);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const j of grid.get(`${cy + dy}|${cx + dx}`) ?? []) {
          if (j <= i || drop.has(j)) continue;
          const u = towns[j];
          if (u.country !== t.country) continue;
          const km = Math.hypot((t.lat - u.lat) * 111, (t.lon - u.lon) * 111 * Math.cos((t.lat * Math.PI) / 180));
          if (km > SAME_PLACE_KM) continue;
          if (editDistance(names[i], names[j], 2) > 2) continue;
          drop.add(u.pop > t.pop ? i : j);
        }
      }
    }
  });
  return drop.size ? towns.filter((_, i) => !drop.has(i)) : towns;
}

export function hydrate(doc: Columnar | Dataset): Dataset {
  // Older row-based files still load unchanged.
  if (!('format' in doc) || !String(doc.format).startsWith('columnar')) {
    return doc as Dataset;
  }
  const { n, dict, cols, meta } = doc as Columnar;
  const keys = Object.keys(cols);
  const towns: Town[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const t: Record<string, unknown> = {};
    for (const k of keys) {
      const v = cols[k][i];
      const table = dict[k];
      t[k] = table && typeof v === 'number' ? table[v] : v;
    }
    towns[i] = t as unknown as Town;
  }
  return { meta, towns: mergeDuplicates(towns) };
}

/** A gzip member always begins with these two bytes. */
const GZIP_MAGIC = [0x1f, 0x8b];

/**
 * Parse a response body that may or may not still be compressed.
 *
 * Hosts disagree about .gz files. Some send the bytes as-is; some set
 * `Content-Encoding: gzip`, in which case the browser has already decompressed
 * it and doing so again throws. Checking the magic bytes settles it by
 * observation rather than by assuming a particular host's configuration.
 */
async function parseMaybeGzipped(buf: ArrayBuffer): Promise<unknown> {
  const head = new Uint8Array(buf.slice(0, 2));
  const looksGzipped = head[0] === GZIP_MAGIC[0] && head[1] === GZIP_MAGIC[1];

  if (!looksGzipped) {
    return JSON.parse(new TextDecoder().decode(buf));
  }
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('compressed dataset, but this browser cannot decompress it');
  }
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).json();
}

/**
 * Relative, not absolute.
 *
 * `/data/towns.json` only works when the app is served from the root of a
 * domain. Hosted in a subdirectory, which is what GitHub Pages project sites
 * and most "drop this folder on a server" setups do, it asks the wrong origin
 * for the file and the app never loads. `import.meta.env.BASE_URL` is whatever
 * the build was configured with, so this follows it.
 *
 * The compressed copy is tried first because it is a quarter of the size and
 * does not depend on the host being set up to compress. The plain file remains
 * as a fallback for a browser without DecompressionStream, which in practice
 * means something very old.
 */
export async function loadDataset(url?: string): Promise<Dataset> {
  const base = url ?? `${import.meta.env.BASE_URL}data/towns.json`;

  if (typeof DecompressionStream !== 'undefined') {
    try {
      const r = await fetch(`${base}.gz`);
      if (r.ok) {
        return hydrate((await parseMaybeGzipped(await r.arrayBuffer())) as never);
      }
    } catch {
      // Fall through to the uncompressed copy rather than failing outright.
    }
  }

  const r = await fetch(base);
  if (!r.ok) throw new Error(`${base} returned ${r.status}`);
  return hydrate(await r.json());
}
