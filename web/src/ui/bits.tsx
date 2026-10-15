/**
 * Small pieces of display shared by the taste deck, the result cards and the
 * town panel. Each answers "what is this place like" at a glance, before
 * anyone has to read a table.
 */
import { useEffect, useState } from 'react';
import type { Town } from '../types';
import { hubDriveMin } from '../scoring';
import { formatDrive } from '../travel';
import { monthLabel, rainIn, weatherHigh } from '../climate';
import {
  cultureScore, eventsNear, EVENT_KIND_ICON, MONTH_SHORT, venuesSurveyed,
} from '../culture';

/** Cold blue through green to hot red, for a monthly high in °C. */
export function tempColour(c: number): string {
  const stops: Array<[number, [number, number, number]]> = [
    [-5, [70, 110, 200]],
    [8, [80, 160, 210]],
    [16, [90, 180, 140]],
    [23, [230, 190, 70]],
    [29, [235, 130, 60]],
    [35, [205, 70, 80]],
  ];
  if (c <= stops[0][0]) return `rgb(${stops[0][1].join(',')})`;
  for (let i = 1; i < stops.length; i++) {
    if (c <= stops[i][0]) {
      const [x0, c0] = stops[i - 1];
      const [x1, c1] = stops[i];
      const t = (c - x0) / (x1 - x0);
      return `rgb(${c0.map((a, j) => Math.round(a + t * (c1[j] - a))).join(',')})`;
    }
  }
  return `rgb(${stops[stops.length - 1][1].join(',')})`;
}

/** Twelve bars, one per month's daily high: the shape of a year in a glance. */
export function MonthStrip({ town }: { town: Town }) {
  const highs = town.monthlyTmax ?? [];
  if (highs.length !== 12) return null;
  const lo = Math.min(-5, ...highs);
  const hi = Math.max(35, ...highs);
  return (
    <div className="monthstrip" aria-label="Average daily high, month by month">
      {highs.map((v, m) => (
        <div key={m} className="mcol" title={`${MONTH_SHORT[m]}: ${v.toFixed(0)} °C`}>
          <span className="mval">{Math.round(v)}°</span>
          <i style={{ height: `${12 + (88 * (v - lo)) / (hi - lo)}%`, background: tempColour(v) }} />
          <span className="mlbl">{MONTH_SHORT[m][0]}</span>
        </div>
      ))}
    </div>
  );
}

export interface Highlight {
  icon: string;
  text: string;
  title?: string;
}

/**
 * The few facts that make a place itself, in plain words, picked so that two
 * towns side by side read differently: a sea town leads with the sea, a
 * mountain town with the mountains, a festival city with its festivals.
 */
export function highlights(t: Town, max = 6, months: readonly number[] = []): Highlight[] {
  const out: Highlight[] = [];
  out.push(months.length ? {
    icon: '☀️',
    text: `${Math.round(weatherHigh(t, months))}° in ${monthLabel(months)}`,
    title: `Mean daily high during your visit; ${Math.round(rainIn(t, months) ?? 0)} mm of rain a month`,
  } : {
    icon: '☀️',
    text: `${Math.round(t.hottestTmax)}° summer highs`,
    title: `Mean daily high of the hottest month (${MONTH_SHORT[t.hottestMonth] ?? ''}); winter nights ${Math.round(t.winterTmin)}°`,
  });
  if (t.coastKm != null && t.coastKm <= 25) {
    out.push({ icon: '🌊', text: t.coastKm < 3 ? 'By the sea' : `Sea ${Math.round(t.coastKm)} km` });
  }
  if (t.relief25km != null && t.relief25km >= 700) {
    out.push({ icon: '⛰️', text: `Mountains, ${Math.round(t.maxElev25km ?? 0).toLocaleString()} m peaks` });
  } else if (t.parkKm != null && t.parkKm <= 5) {
    out.push({ icon: '🌲', text: t.parkKm < 1 ? 'Nature on the doorstep' : `Nature ${Math.round(t.parkKm)} km` });
  }
  if (t.skiKm != null && t.skiKm <= 60) out.push({ icon: '⛷️', text: `Skiing ${Math.round(t.skiKm)} km` });
  const ev = eventsNear(t);
  if (ev.length) {
    const first = ev[0].event;
    out.push({
      icon: EVENT_KIND_ICON[first.kind],
      text: ev.length === 1 ? first.name : `${first.name} +${ev.length - 1}`,
      title: ev.slice(0, 8).map((e) => `${e.event.name} (${Math.round(e.km)} km)`).join(', '),
    });
  }
  const c = cultureScore(t);
  if (venuesSurveyed(t) && (t.museum15km ?? 0) + (t.theatre15km ?? 0) > 0) {
    out.push({ icon: '🎭', text: `${t.museum15km} museums, ${t.theatre15km} theatres` });
  } else if (c >= 0.75) {
    out.push({ icon: '🎭', text: 'Big-city culture', title: 'Estimated from city size: museums and theatres within an evening’s reach' });
  }
  const hub = hubDriveMin(t);
  if (hub != null) out.push({ icon: '✈️', text: `${formatDrive(hub)} to ${t.hubName}` });
  out.push({ icon: '🏠', text: `~€${Math.round(t.eurM2).toLocaleString()}/m²` });
  out.push({ icon: '👥', text: `${t.pop >= 1e6 ? (t.pop / 1e6).toFixed(1) + 'M' : t.pop >= 1e4 ? Math.round(t.pop / 1000) + 'k' : t.pop.toLocaleString()} people` });
  return out.slice(0, max);
}

export function Highlights({ town, max, months }: { town: Town; max?: number; months?: readonly number[] }) {
  return (
    <div className="hl">
      {highlights(town, max, months).map((h, i) => (
        <span key={i} className="hlchip" title={h.title}>
          <span aria-hidden>{h.icon}</span> {h.text}
        </span>
      ))}
    </div>
  );
}

/** Track whether a CSS media query matches, for layout that differs by more than style. */
export function useMedia(query: string): boolean {
  const get = () => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches;
  const [on, setOn] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const h = () => setOn(mq.matches);
    h();
    mq.addEventListener?.('change', h);
    return () => mq.removeEventListener?.('change', h);
  }, [query]);
  return on;
}

/**
 * A small UI preference remembered in this browser: a layout, a grouping.
 * Conveniences only, so a private window that cannot store them simply
 * starts from the default every time.
 */
export function usePref<T extends string>(key: string, initial: T, allowed: readonly T[]): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const s = localStorage.getItem(key) as T | null;
      return s && allowed.includes(s) ? s : initial;
    } catch {
      return initial;
    }
  });
  const set = (next: T) => {
    setV(next);
    try {
      localStorage.setItem(key, next);
    } catch {
      /* not remembered, still applied */
    }
  };
  return [v, set];
}
