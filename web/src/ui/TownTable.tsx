import { useMemo, useState } from 'react';
import type { Town } from '../types';
import type { HeldBack, Ranked } from '../scoring';
import { bestMatch, hubDriveMin } from '../scoring';
import { formatDrive } from '../travel';
import { affinityScore, type Affinity, type Distribution } from '../affinity';
import type { GemModel } from '../gems';
import { discountPct } from '../gems';
import { acIndexVs } from '../climate';
import { rebaseCost } from '../home';
import { tzGap } from '../clock';
import { severity, wouldRank } from '../nearmiss';
import { OWNERSHIP_LABEL } from '../types';
import type { Mode } from '../App';
import { heldLabel } from './labels';

interface Props {
  /** The rows to show: the ranking, the near misses or the gems. */
  ranked: Ranked[];
  /** The ordinary ranking, for "would rank #n". */
  base: Ranked[];
  /** Every town, filtered or not, so a search miss can explain itself. */
  all: Town[];
  /** Why a town was excluded, for the same reason. */
  reject: (t: Town) => string | null;
  mode: Mode;
  gemModel: GemModel;
  /** The city the user is escaping; every comparison is drawn against it. */
  compare: Town | null;
  /** Places the user said they liked; drives the "most like" column. */
  refs: Town[];
  affinity: Affinity | null;
  dist: Distribution | null;
  /** Home country's cost index, so the cost column reads home = 100. */
  homeIndex: number | null;
  /** The user's working clock, for the time-difference column. */
  workTz: string | null;
  /** Show the dog column: only once someone has said they care. */
  showPets: boolean;
  selected: string | null;
  onSelect: (ine: string) => void;
}

interface Ctx {
  gem: GemModel;
  compare: Town | null;
  refs: Town[];
  affinity: Affinity | null;
  dist: Distribution | null;
  homeIndex: number | null;
  workTz: string | null;
  base: Ranked[];
}

type Col = {
  key: string;
  label: string;
  title?: string;
  get: (r: Ranked, c: Ctx) => number | string | null;
  render?: (r: Ranked, c: Ctx) => React.ReactNode;
};

const n0 = (v: number) => Math.round(v).toLocaleString();

function Bar({ v, gem }: { v: number; gem?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
      <span className="bar">
        <i style={{ width: `${Math.max(0, Math.min(100, v))}%`, ...(gem ? { background: 'var(--gem)' } : {}) }} />
      </span>
      <span>{v.toFixed(0)}</span>
    </div>
  );
}

function HeldChips({ held, town }: { held?: HeldBack[]; town: Town }) {
  if (!held?.length) return null;
  // When the nearest airport is also the hub, failing both limits is one fact
  // about one drive, and two chips saying "1 h 42 to SCL" read as a glitch.
  const air = held.find((h) => h.failure?.key === 'airport');
  const hub = held.find((h) => h.failure?.key === 'hub');
  const merge = air && hub && town.airportName === town.hubName;
  const shown = merge ? held.filter((h) => h !== hub) : held;
  return (
    <span className="held">
      {shown.map((h, i) => (
        <span
          key={i}
          className={`chip ${h.failure ? severity(h === air && merge ? hub!.failure! : h.failure) : 'far'}`}
          title={h.failure ? h.failure.reason : 'A dimension you weight, scoring far below the rest'}
        >
          {h === air && merge
            ? `${air!.failure!.value} (limits ${air!.failure!.limit} and ${hub!.failure!.limit})`
            : heldLabel(h)}
        </span>
      ))}
    </span>
  );
}

const BASE_COLUMNS: Col[] = [
  { key: 'name', label: 'Town', get: (r) => r.town.name },
  { key: 'country', label: 'Country', get: (r) => r.town.countryName },
  {
    key: 'own',
    label: 'Buy',
    title: 'Whether an EU or EFTA passport holder can acquire property here',
    get: (r) => r.town.ownership,
    render: (r) => (
      <span className={`pill own-${r.town.ownership}`} title={OWNERSHIP_LABEL[r.town.ownership]}>
        {r.town.ownership === 'freehold'
          ? 'free'
          : r.town.ownership === 'restricted'
            ? 'cond'
            : r.town.ownership === 'leasehold'
              ? 'lease'
              : 'no'}
      </span>
    ),
  },
  { key: 'province', label: 'Region', get: (r) => r.town.province },
  {
    key: 'score',
    label: 'Score',
    get: (r) => r.score,
    render: (r) => <Bar v={r.score} />,
  },
  {
    key: 'gem',
    label: 'vs fair',
    title: 'Price against the modelled fair price for a town of this quality. '
      + 'Negative means cheaper than its climate, connections and services imply.',
    get: (r, c) => discountPct(c.gem, r.town) ?? -999,
    render: (r, c) => {
      const d = discountPct(c.gem, r.town);
      if (d == null) return 'n/a';
      return <span className={d > 0 ? 'discount' : ''}>{d > 0 ? `−${d.toFixed(0)}%` : `+${(-d).toFixed(0)}%`}</span>;
    },
  },
  {
    key: 'eurM2',
    label: '€/m²',
    get: (r) => r.town.eurM2,
    render: (r) => (
      <span>
        {n0(r.town.eurM2)}{' '}
        <span className={`pill ${r.town.priceSource}`}>{r.town.priceSource[0].toUpperCase()}</span>
      </span>
    ),
  },
  {
    key: 'ac',
    label: 'AC',
    title: 'Cooling load as a percentage of your reference city. '
      + 'The measure that matters when you are indoors all summer: it counts the whole '
      + 'season, not the worst day.',
    get: (r, c) => acIndexVs(r.town, c.compare) ?? 999,
    render: (r, c) => {
      const v = acIndexVs(r.town, c.compare);
      if (v == null) return 'n/a';
      return <span className={v <= 40 ? 'discount' : ''}>{v.toFixed(0)}%</span>;
    },
  },
  {
    key: 'net',
    label: 'Mbps',
    title: 'Median download speed from Ookla Speedtest tiles within 6 km, weighted by test count',
    get: (r) => r.town.netDownMbps ?? -1,
    render: (r) =>
      r.town.netDownMbps == null ? (
        'n/a'
      ) : (
        <span className={r.town.netDownMbps >= 100 ? 'discount' : ''}>
          {r.town.netDownMbps.toFixed(0)}
        </span>
      ),
  },
  {
    key: 'clock',
    label: 'Clock',
    title: 'Hours between local time here and your working clock (the larger of January and July)',
    get: (r, c) => tzGap(r.town.tz, c.workTz)?.worst ?? 99,
    render: (r, c) => {
      const g = tzGap(r.town.tz, c.workTz);
      if (!g) return 'n/a';
      const h = Math.abs(g.jan) >= Math.abs(g.jul) ? g.jan : g.jul;
      return (
        <span className={g.worst <= 2 ? 'discount' : ''}>
          {h === 0 ? '0' : `${h > 0 ? '+' : '−'}${Math.abs(h)}`}
        </span>
      );
    },
  },
  {
    key: 'pm25',
    label: 'PM2.5',
    title: 'Annual mean fine particulates, µg/m³. WHO guideline 5, EU limit 25',
    get: (r) => r.town.pm25 ?? 999,
    render: (r) =>
      r.town.pm25 == null ? (
        'n/a'
      ) : (
        <span className={r.town.pm25 <= 10 ? 'discount' : ''}>{r.town.pm25.toFixed(1)}</span>
      ),
  },
  {
    key: 'cost',
    label: 'Cost',
    title: 'World Bank price level for household consumption, 100 = where you say you are',
    get: (r) => r.town.costIndex ?? 999,
    render: (r, c) => {
      const v = rebaseCost(r.town.costIndex, c.homeIndex);
      return v == null ? 'n/a' : <span className={v <= 90 ? 'discount' : ''}>{v}</span>;
    },
  },
  { key: 'over30', label: 'd>30°', title: 'Days per year above 30°C', get: (r) => r.town.daysOver30 },
  {
    key: 'trop',
    label: 'n>20°',
    title: 'Nights per year that never drop below 20°C',
    get: (r) => r.town.tropicalNights,
  },
  {
    key: 'peak',
    label: 'Peak °C',
    title: 'Mean daily high of the hottest month, whichever month that is locally',
    get: (r) => r.town.hottestTmax,
  },
  {
    key: 'hub',
    label: 'To hub',
    title: 'Estimated drive time to an airport with 2M+ passengers a year',
    get: (r) => hubDriveMin(r.town) ?? 9999,
    render: (r) => {
      const m = hubDriveMin(r.town);
      return <span className={m != null && m <= 45 ? 'discount' : ''}>{formatDrive(m)}</span>;
    },
  },
  {
    key: 'fit',
    label: 'Fit',
    title: 'How closely this matches what your picked places have in common',
    get: (r, c) =>
      c.affinity && c.dist ? (affinityScore(r.town, c.affinity, c.dist) ?? -1) : -1,
    render: (r, c) => {
      const v = c.affinity && c.dist ? affinityScore(r.town, c.affinity, c.dist) : null;
      if (v == null) return 'n/a';
      return <Bar v={v * 100} gem />;
    },
  },
  {
    key: 'like',
    label: 'Most like',
    title: 'Which of your favourite climates this one resembles most',
    get: (r, c) => bestMatch(r.town, c.refs)?.town.name ?? '',
    render: (r, c) => {
      const b = bestMatch(r.town, c.refs);
      if (!b) return 'n/a';
      return (
        <span title={(b.score * 100).toFixed(0) + '% match'}>
          {b.town.name} <span className="prov">{(b.score * 100).toFixed(0)}%</span>
        </span>
      );
    },
  },
  { key: 'city', label: 'City km', get: (r) => r.town.city100kKm },
  { key: 'pop', label: 'Pop', get: (r) => r.town.pop, render: (r) => n0(r.town.pop) },
];

const PETS_COLUMN: Col = {
  key: 'pets',
  label: 'Dog',
  title: 'Good for a dog: a vet nearby, protected land to walk in, summers a dog can bear',
  get: (r) => r.breakdown.pets ?? -1,
  render: (r) => (r.breakdown.pets == null ? 'n/a' : <Bar v={r.breakdown.pets * 100} />),
};

const NEAR_COLUMNS: Col[] = [
  {
    key: 'forgiven',
    label: 'Would score',
    title: 'The score with the things holding it back set aside',
    get: (r) => r.forgiven ?? r.score,
    render: (r, c) => (
      <div title={`Would rank #${wouldRank(c.base, r.forgiven ?? r.score)} in your results`}>
        <Bar v={r.forgiven ?? r.score} gem />
      </div>
    ),
  },
  {
    key: 'held',
    label: 'Held back by',
    title: 'The one or two things between this place and the top of your list',
    get: (r) => r.held?.map(heldLabel).join(' ') ?? '',
    render: (r) => <HeldChips held={r.held} town={r.town} />,
  },
];

function columnsFor(mode: Mode, showPets: boolean): Col[] {
  let cols = [...BASE_COLUMNS];
  if (showPets) cols.splice(cols.findIndex((c) => c.key === 'net'), 0, PETS_COLUMN);
  if (mode === 'near') {
    const at = cols.findIndex((c) => c.key === 'score');
    cols = [...cols.slice(0, at), ...NEAR_COLUMNS, ...cols.slice(at)];
  }
  return cols;
}

/** Accent-insensitive, so "Malaga" finds "Málaga" and "Brasov" finds "Brașov". */
const fold = (v: string) =>
  v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export default function TownTable({
  ranked, base, all, reject, mode, gemModel, compare, refs, affinity, dist, homeIndex,
  workTz, showPets, selected, onSelect,
}: Props) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [query, setQuery] = useState('');
  const ctx: Ctx = useMemo(
    () => ({ gem: gemModel, compare, refs, affinity, dist, homeIndex, workTz, base }),
    [gemModel, compare, refs, affinity, dist, homeIndex, workTz, base],
  );
  const columns = useMemo(() => columnsFor(mode, showPets), [mode, showPets]);

  const q = fold(query.trim());
  const hits = useMemo(() => {
    if (!q) return ranked;
    return ranked.filter(
      (r) =>
        fold(r.town.name).includes(q) ||
        fold(r.town.province).includes(q) ||
        fold(r.town.countryName).includes(q),
    );
  }, [ranked, q]);

  // Searching for somewhere your own filters exclude is the interesting case,
  // and an empty table would leave you guessing. These are the places that
  // match the text but failed a filter, with the reason.
  const excluded = useMemo(() => {
    if (!q || hits.length) return [];
    const out: Array<{ town: Town; why: string }> = [];
    for (const t of all) {
      if (
        !fold(t.name).includes(q) &&
        !fold(t.province).includes(q) &&
        !fold(t.countryName).includes(q)
      )
        continue;
      const why = reject(t);
      if (why) out.push({ town: t, why });
      if (out.length >= 8) break;
    }
    return out;
  }, [q, hits.length, all, reject]);

  const rows = useMemo(() => {
    if (!sort) return hits.slice(0, 400);
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return hits.slice(0, 400);
    return [...hits]
      .sort((a, b) => {
        const av = col.get(a, ctx);
        const bv = col.get(b, ctx);
        if (typeof av === 'string' || typeof bv === 'string')
          return String(av).localeCompare(String(bv)) * sort.dir;
        return ((bv as number) - (av as number)) * sort.dir;
      })
      .slice(0, 400);
  }, [hits, sort, ctx, columns]);

  return (
    <div className="tablewrap">
      <div className="searchbar">
        <input
          type="search"
          value={query}
          placeholder={`Search ${all.length.toLocaleString()} places by name, region or country`}
          onChange={(e) => setQuery(e.target.value)}
        />
        {q && (
          <span className="count">
            {hits.length.toLocaleString()} of {ranked.length.toLocaleString()} shown
          </span>
        )}
      </div>

      {mode === 'near' && !q && ranked.length > 0 && (
        <div className="modehint">
          Places that would be among your ten best if you forgave <b>one or two things</b>:
          a filter they miss, or a dimension so weak it drags the rest down. Budget is
          forgiven only up to 25% over and summer only when just over the line; where you
          are willing to live never is. Open one to see exactly what it would take.
        </div>
      )}

      {!ranked.length && !q && (
        <div className="empty">
          {mode === 'near' ? (
            <>
              No near misses. Nothing is within one or two forgivable things of your top ten,
              which usually means your filters already let the good places in.
            </>
          ) : mode === 'gems' ? (
            <>
              No gems to show. A gem is a place priced below what its quality predicts, and
              that needs measured prices, which only Spain publishes per town. Include Spain
              in your countries to use this view.
            </>
          ) : (
            <>
              Nothing matches. The budget and the summer limits are usually the binding pair,
              try raising one of them, or look at <b>Near misses</b> for places just outside.
              You can still search below to see why a specific place is out.
            </>
          )}
        </div>
      )}

      {q && !hits.length && (
        <div className="empty">
          {excluded.length ? (
            <>
              <p>
                Nothing matching <b>{query}</b> passes your filters. These match the name but
                were excluded:
              </p>
              <ul className="whynot">
                {excluded.map(({ town, why }) => (
                  <li key={town.id}>
                    <button className="link" onClick={() => onSelect(town.id)}>
                      <b>{town.name}</b>
                    </button>
                    , {town.countryName} {'·'} {why}
                  </li>
                ))}
              </ul>
              <p className="hintline">
                Relax the filter named above to bring them back, or clear the search.
              </p>
            </>
          ) : (
            <p>
              Nothing in the dataset matches <b>{query}</b>. Spain is carried down to 500
              people, the rest of Europe to 5,000, and most other countries to 15,000 or more.
            </p>
          )}
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th />
            {columns.map((c) => (
              <th
                key={c.key}
                title={c.key === 'ac' && compare ? `Cooling load as a percentage of ${compare.name}'s` : c.title}
                className={sort?.key === c.key ? 'on' : ''}
                onClick={() =>
                  setSort((s) =>
                    s?.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 },
                  )
                }
              >
                {c.label}
                {sort?.key === c.key ? (sort.dir === 1 ? ' ↓' : ' ↑') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.town.id}
              className={r.town.id === selected ? 'sel' : ''}
              onClick={() => onSelect(r.town.id)}
            >
              <td className="rankcol">{i + 1}</td>
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={
                    c.key === 'name'
                      ? 'town'
                      : ['province', 'country', 'like'].includes(c.key)
                        ? 'prov'
                        : c.key === 'held'
                          ? 'heldcol'
                          : ''
                  }
                >
                  {c.render
                    ? c.render(r, ctx)
                    : typeof c.get(r, ctx) === 'number'
                      ? (c.get(r, ctx) as number).toFixed(
                          ['over30', 'trop', 'peak'].includes(c.key) ? 1 : 0,
                        )
                      : c.get(r, ctx)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {/* Counts the searched set, not the whole ranking: after a search for one
          town, "top 1 of 8,235" was both true and useless. */}
      {hits.length > rows.length && (
        <div className="empty" style={{ padding: '12px' }}>
          Showing the top {rows.length} of {hits.length.toLocaleString()}
          {q ? ` matching "${query.trim()}".` : '.'}
          {mode === 'gems'
            ? ' Ranked by discount to modelled fair price.'
            : mode === 'near'
              ? ' Ranked by what they would score.'
              : ' Tighten the filters to narrow.'}
        </div>
      )}
    </div>
  );
}
