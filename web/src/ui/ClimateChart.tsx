import type { Town } from '../types';

/**
 * Monthly temperature band with the two thresholds that matter drawn on top:
 * 30 C for days, 20 C for nights. Seeing where the band crosses those lines
 * tells you more in one glance than any table of averages.
 */
export default function ClimateChart({ town }: { town: Town }) {
  const W = 308;
  const H = 132;
  const P = { l: 24, r: 8, t: 8, b: 16 };
  const iw = W - P.l - P.r;
  const ih = H - P.t - P.b;

  const hi = town.monthlyTmax;
  const lo = town.monthlyTmin;
  if (!hi?.length || !lo?.length) return null;

  const yMin = Math.min(-2, Math.floor(Math.min(...lo) - 2));
  const yMax = Math.max(36, Math.ceil(Math.max(...hi) + 2));
  const y = (v: number) => P.t + ih - ((v - yMin) / (yMax - yMin)) * ih;
  const x = (i: number) => P.l + (i + 0.5) * (iw / 12);

  const band =
    hi.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ') +
    ' ' +
    [...lo]
      .map((v, i) => [v, i] as const)
      .reverse()
      .map(([v, i]) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .join(' ') +
    ' Z';

  const line = (arr: number[]) =>
    arr.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  const M = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

  return (
    <svg width={W} height={H} style={{ display: 'block', margin: '4px 0 10px' }}>
      {[0, 10, 20, 30].map((v) =>
        v >= yMin && v <= yMax ? (
          <g key={v}>
            <line
              x1={P.l}
              x2={W - P.r}
              y1={y(v)}
              y2={y(v)}
              stroke={v === 30 || v === 20 ? '#d1495b' : '#eef0f3'}
              strokeDasharray={v === 30 || v === 20 ? '3 3' : undefined}
              strokeOpacity={v === 30 || v === 20 ? 0.55 : 1}
            />
            <text x={2} y={y(v) + 3} fontSize={9} fill="#8b95a1">
              {v}°
            </text>
          </g>
        ) : null,
      )}
      <path d={band} fill="#2d7dd2" fillOpacity={0.17} />
      <path d={line(hi)} fill="none" stroke="#e8833a" strokeWidth={1.6} />
      <path d={line(lo)} fill="none" stroke="#2d7dd2" strokeWidth={1.6} />
      {M.map((m, i) => (
        <text key={i} x={x(i)} y={H - 4} fontSize={9} fill="#8b95a1" textAnchor="middle">
          {m}
        </text>
      ))}
    </svg>
  );
}
