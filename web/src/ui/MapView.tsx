import { useEffect, useRef } from 'react';
import L from 'leaflet';
// Bundled rather than pulled from a CDN at runtime: an app someone else
// hosts should not break when unpkg is unreachable, and should not report its
// visitors to a third party.
import 'leaflet/dist/leaflet.css';
import type { Ranked } from '../scoring';
import type { Mode } from '../App';
import type { Listing, BuildStatus } from '../listings';

/**
 * Drawing every match becomes the bottleneck once the dataset covers a
 * continent, so only the best MAX_MARKERS are plotted. The table is the
 * authoritative list; the map is for seeing where the good ones cluster.
 */
const MAX_MARKERS = 2500;

interface Props {
  ranked: Ranked[];
  mode: Mode;
  selected: string | null;
  onSelect: (ine: string) => void;
  /** Imported developments, drawn as their own layer. */
  listings?: Listing[];
  /** Which layers are on. Independent on purpose: the interesting view is
   *  often developments alone, without the ranking colouring the map. */
  showPlaces: boolean;
  showBuilds: boolean;
}

/**
 * A development's colour is its stage, not its score. Blue for something you
 * could buy now, through amber and orange as it gets earlier, so the map reads
 * as a timeline rather than as a ranking.
 */
const STAGE_COLOUR: Record<BuildStatus, string> = {
  ready: '#2d7dd2',
  building: '#e8a33a',
  waiting: '#b06fd0',
  pipeline: '#8b95a1',
};
const STAGE_TEXT: Record<BuildStatus, string> = {
  ready: 'built or selling now',
  building: 'under construction',
  waiting: 'waiting list open',
  pipeline: 'announced, not launched',
};

/** Cool blue -> warm orange -> hot red. Higher value = better = cooler colour. */
function colour(v: number): string {
  const stops: Array<[number, [number, number, number]]> = [
    [0.0, [190, 76, 91]],
    [0.4, [232, 131, 58]],
    [0.7, [214, 190, 76]],
    [0.85, [79, 158, 111]],
    [1.0, [45, 125, 210]],
  ];
  const x = Math.max(0, Math.min(1, v));
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [x0, c0] = stops[i - 1];
      const [x1, c1] = stops[i];
      const t = (x - x0) / (x1 - x0);
      const c = c0.map((a, j) => Math.round(a + t * (c1[j] - a)));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
  }
  return 'rgb(45,125,210)';
}

export default function MapView({
  ranked, mode, selected, onSelect, listings, showPlaces, showBuilds,
}: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const buildLayer = useRef<L.LayerGroup | null>(null);
  const renderer = useRef<L.Canvas | null>(null);

  useEffect(() => {
    if (!el.current || map.current) return;
    renderer.current = L.canvas({ padding: 0.4 });
    const m = L.map(el.current, {
      center: [48.5, 9.0],
      zoom: 4,
      preferCanvas: true,
      renderer: renderer.current,
      worldCopyJump: false,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 18,
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    // Added after, so development pins sit above the town dots.
    buildLayer.current = L.layerGroup().addTo(m);
    map.current = m;

    const legend = new L.Control({ position: 'bottomright' });
    legend.onAdd = () => {
      const d = L.DomUtil.create('div', 'legend');
      d.innerHTML =
        '<div class="row"><i class="dot" style="background:rgb(45,125,210)"></i>best</div>' +
        '<div class="row"><i class="dot" style="background:rgb(214,190,76)"></i>middling</div>' +
        '<div class="row"><i class="dot" style="background:rgb(190,76,91)"></i>weakest</div>';
      return d;
    };
    legend.addTo(m);

    // Leaflet caches the container size at init and does not notice later
    // changes, which leaves the tile grid drawn for the old dimensions. Watch
    // the element instead of guessing when that happens.
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);

    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const lg = layer.current;
    if (!lg) return;
    lg.clearLayers();
    if (!showPlaces || !ranked.length) return;

    const key = (r: Ranked) => (mode === 'gems' ? (r.gem ?? 0) : r.score);
    const vals = ranked.map(key);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const span = hi - lo || 1;

    // Keep the best, then draw worst-first so the best land on top and stay
    // clickable. Anything already selected is kept regardless of rank.
    const capped =
      ranked.length <= MAX_MARKERS
        ? ranked
        : [
            ...ranked.slice(0, MAX_MARKERS),
            ...ranked.slice(MAX_MARKERS).filter((r) => r.town.id === selected),
          ];
    const order = [...capped].sort((a, b) => key(a) - key(b));
    for (const r of order) {
      const t = r.town;
      const v = (key(r) - lo) / span;
      const isSel = t.id === selected;
      L.circleMarker([t.lat, t.lon], {
        radius: isSel ? 9 : 3 + Math.min(6, Math.log10(Math.max(t.pop, 100)) - 1.6),
        fillColor: colour(v),
        fillOpacity: 0.85,
        color: isSel ? '#111' : '#fff',
        weight: isSel ? 2.5 : 0.6,
        renderer: renderer.current ?? undefined,
      })
        .bindTooltip(
          `<b>${t.name}</b> <span style="opacity:.6">${t.countryName}</span><br>` +
            `${Math.round(t.eurM2).toLocaleString()} €/m² · ` +
            `${t.daysOver30.toFixed(0)}d >30°C · ${t.tropicalNights.toFixed(0)} warm nights`,
          { direction: 'top' },
        )
        .on('click', () => onSelect(t.id))
        .addTo(lg);
    }
  }, [ranked, mode, selected, onSelect, showPlaces]);

  // --- developments -------------------------------------------------------
  useEffect(() => {
    const bl = buildLayer.current;
    if (!bl) return;
    bl.clearLayers();
    if (!showBuilds || !listings?.length) return;

    const byId = new Map(ranked.map((r) => [r.town.id, r.town]));
    // Several developments in one municipality would stack exactly on top of
    // each other at the centroid, so fan them out by a few hundred metres.
    const seen = new Map<string, number>();

    for (const l of listings) {
      const t = l.id ? byId.get(l.id) : undefined;
      if (!t) continue;
      const n = seen.get(t.id) ?? 0;
      seen.set(t.id, n + 1);
      const angle = n * 2.399;            // golden angle, so they spread evenly
      const r = n === 0 ? 0 : 0.004 * Math.sqrt(n);
      const lat = t.lat + r * Math.cos(angle);
      const lon = t.lon + r * Math.sin(angle) * 1.4;

      const stage = l.status ?? 'pipeline';
      const price = l.price ? `€${Math.round(l.price).toLocaleString()}` : 'no price yet';
      const vs =
        l.vsTownPct == null
          ? ''
          : ` · ${l.vsTownPct > 0 ? '+' : ''}${l.vsTownPct.toFixed(0)}% vs town`;

      L.circleMarker([lat, lon], {
        radius: 7,
        fillColor: STAGE_COLOUR[stage],
        fillOpacity: 0.95,
        color: '#fff',
        weight: 2,
        renderer: renderer.current ?? undefined,
      })
        .bindTooltip(
          `<b>${l.title}</b><br>${t.name}<br>` +
            `${STAGE_TEXT[stage]}<br>${price}${vs}` +
            `<br><span style="opacity:.6">pinned at the town centre, not the address</span>`,
          { direction: 'top' },
        )
        .on('click', () => onSelect(t.id))
        .addTo(bl);
    }
  }, [listings, ranked, showBuilds, onSelect]);

  // Pan to a town chosen from the table.
  useEffect(() => {
    if (!selected || !map.current) return;
    const t = ranked.find((r) => r.town.id === selected)?.town;
    if (t) map.current.panTo([t.lat, t.lon], { animate: true });
  }, [selected, ranked]);

  return <div id="map" ref={el} />;
}
