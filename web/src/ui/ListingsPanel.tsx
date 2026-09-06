import { useMemo, useState } from 'react';
import type { Filters, Town, Weights } from '../types';
import { parseListingsCsv, BUILD_STATUS_LABEL, type Listing } from '../listings';
import { score, priceFor, type ScoreContext } from '../scoring';

interface Props {
  towns: Town[];
  filters: Filters;
  weights: Weights;
  refs: Town[];
  scoreCtx: ScoreContext;
  onClose: () => void;
  onSelectTown: (ine: string) => void;
  /** Imports are held by App so the map can draw them as their own layer. */
  listings: Listing[];
  onListings: (l: Listing[]) => void;
}

const SAMPLE = `municipality,development,price,m2,construction status,expected completion,developer
Lugo,Residencial Norte,285000,95,Under construction,Q3 2027,Some Promotor
Ribadeo,Vista Mar,,,Future / Pre-launch,,Otra Promotora`;

/**
 * Score listings you have gathered yourself against the same model as the towns.
 * Two numbers matter: whether the listing is cheap *for its town*, and whether
 * the town is any good in the first place. A bargain in a place you would hate
 * is not a bargain.
 */
export default function ListingsPanel(p: Props) {
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<string[] | null>(null);
  const parsed = errors == null ? null : { listings: p.listings, errors };

  const byId = useMemo(() => new Map(p.towns.map((t) => [t.id, t])), [p.towns]);

  const rows = useMemo(() => {
    if (!parsed) return [];
    return parsed.listings
      .map((l) => {
        const town = l.id ? byId.get(l.id) : undefined;
        return {
          l,
          town,
          townScore: town ? score(town, p.filters, p.weights, p.scoreCtx) : null,
        };
      })
      .sort((a, b) => (b.townScore ?? -1) - (a.townScore ?? -1));
  }, [parsed, byId, p.filters, p.weights, p.scoreCtx]);

  const run = (t: string) => {
    setText(t);
    if (!t.trim()) {
      setErrors(null);
      p.onListings([]);
      return;
    }
    const out = parseListingsCsv(t, p.towns);
    setErrors(out.errors);
    p.onListings(out.listings);
  };

  return (
    <div className="overlay" onClick={p.onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Score your own listings</h2>
          <button className="link" onClick={p.onClose}>
            close
          </button>
        </div>
        <p style={{ color: 'var(--ink-2)', fontSize: 12, margin: '6px 0 10px' }}>
          Paste a CSV, or drop a file. The only column it cannot do without is{' '}
          <b>municipality</b> (or an <b>INE</b> code), which is what ties a row to everything
          this app knows about the place. Price, m2, construction status, expected
          completion, developer, VPO and a star rating are all read when present and left
          empty when not, so a development that has not launched yet still belongs in the
          list. Column names are matched loosely, in English or Spanish, so a sheet does not
          have to be rewritten first. Everything is matched in your browser and nothing is
          uploaded.
          <br />
          From a Google Sheet: <b>File, Download, CSV</b>, then paste. If your source links
          live inside the cells as hyperlinks rather than as text, add a plain{' '}
          <b>url</b> column: a CSV export drops the link and keeps only the words.
        </p>

        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) f.text().then(run);
          }}
          style={{ fontSize: 12, marginBottom: 8 }}
        />
        <textarea
          value={text}
          placeholder={SAMPLE}
          onChange={(e) => run(e.target.value)}
          spellCheck={false}
          style={{
            width: '100%', height: 90, font: '11px var(--mono)', padding: 8,
            border: '1px solid var(--line)', borderRadius: 6, resize: 'vertical',
          }}
        />

        {parsed?.errors.length ? (
          <div className="note">
            {parsed.errors.length} row{parsed.errors.length > 1 ? 's' : ''} skipped:{' '}
            {parsed.errors.slice(0, 3).join('; ')}
            {parsed.errors.length > 3 ? ' …' : ''}
          </div>
        ) : null}

        {rows.length > 0 && (
          <div style={{ maxHeight: 320, overflow: 'auto', marginTop: 10 }}>
            <table>
              <thead>
                <tr>
                  <th>Listing</th>
                  <th>Town</th>
                  <th title="How far along the development is">Stage</th>
                  <th>Due</th>
                  <th>Price</th>
                  <th>m²</th>
                  <th>€/m²</th>
                  <th title="Compared with what this municipality typically costs">vs town</th>
                  <th>Town score</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ l, town, townScore }, i) => (
                  <tr
                    key={i}
                    onClick={() => l.id && p.onSelectTown(l.id)}
                    style={{ cursor: l.id ? 'pointer' : 'default' }}
                  >
                    <td className="town">
                      {l.url ? (
                        <a href={l.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                          {l.title}
                        </a>
                      ) : (
                        l.title
                      )}
                    </td>
                    <td className="prov">
                      {town?.name ?? l.townName ?? 'n/a'}
                      {!town && l.townName ? ' (no match)' : ''}
                    </td>
                    <td className="prov">
                      {l.status ? (
                        <span className={`pill stage-${l.status}`}>
                          {BUILD_STATUS_LABEL[l.status]}
                        </span>
                      ) : (
                        ''
                      )}
                      {l.official && <span className="pill vpo" title="Protected housing: income ceilings to qualify, capped resale price">VPO</span>}
                    </td>
                    <td className="prov">{l.completion ?? ''}</td>
                    {/* A development that has not launched has no price yet, and
                        that is the normal state for the rows worth watching. */}
                    <td>{l.price == null ? '' : `€${Math.round(l.price).toLocaleString()}`}</td>
                    <td>{l.m2 == null ? '' : Math.round(l.m2)}</td>
                    <td>{l.eurM2 == null ? '' : Math.round(l.eurM2).toLocaleString()}</td>
                    <td>
                      {l.vsTownPct == null ? (
                        ''
                      ) : (
                        <span className={l.vsTownPct < 0 ? 'discount' : ''}>
                          {l.vsTownPct > 0 ? '+' : ''}
                          {l.vsTownPct.toFixed(0)}%
                        </span>
                      )}
                    </td>
                    <td>{townScore == null ? 'n/a' : townScore.toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {parsed && !rows.length && !parsed.errors.length && (
          <div className="empty">Nothing parsed from that.</div>
        )}

        {rows.length > 0 && (
          <div className="note">
            <b>vs town</b> compares each price with what its municipality typically costs.
            Read it with one thing in mind: the town figure is the price of the{' '}
            <i>existing</i> stock, most of it decades old, and a new build is expected to
            sit above that simply for being new. In Spain that premium usually runs
            somewhere around 15 to 30%.
            <br />
            So a new build at <b>+20%</b> is roughly par, not a markup. <b>+200%</b> is a
            different proposition and usually means a coastal development priced for
            second-home buyers rather than for the local market. A new build coming in{' '}
            <b>below</b> its town average is the genuinely unusual case and worth a look.
            <br />
            Check the town score too: a bargain in a place that fails your filters is not a
            bargain. For reference, {p.filters.minM2} m² at the typical price of the
            best-scoring town here would be around €
            {rows[0].town ? Math.round(priceFor(rows[0].town, p.filters.minM2)).toLocaleString() : 'n/a'}.
          </div>
        )}

        {rows.some((r) => !r.l.price) && (
          <div className="note">
            Rows with no price are developments that have not launched yet. They are kept on
            purpose: an importer that requires a price throws away exactly the ones worth
            watching early. Their municipality's climate, transport and price context is
            still shown, because that is what you would be buying into.
          </div>
        )}
      </div>
    </div>
  );
}
