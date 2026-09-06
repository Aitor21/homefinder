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
  return { meta, towns };
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
