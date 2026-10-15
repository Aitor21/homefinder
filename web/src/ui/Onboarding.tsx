import { useEffect, useMemo, useState } from 'react';
import type { Town } from '../types';
import { rejectReason, type FilterEnv } from '../scoring';
import { MONTHS } from '../climate';
import {
  BUDGETS, buildQuickSearch, DEFAULT_QUICK, INTENTS, nextMonth, SIZES, SUMMERS, summerExamples,
  TRAVEL_HINT, VIBES, whereOptions, type QuickAnswers, type Search, type Summer, type Vibe,
  type Where,
} from '../quickstart';

interface Props {
  towns: Town[];
  home: string | null;
  homeName: string | null;
  homeList: Array<{ cc: string; name: string }>;
  onHome: (cc: string | null) => void;
  env: FilterEnv;
  initial?: QuickAnswers;
  onDone: (s: Search, a: QuickAnswers) => void;
  /** Close without answering: the full, unfiltered list. */
  onSkip: () => void;
  /** The precise questionnaire, for anyone who would rather name cities. */
  onAdvanced: () => void;
}

/** Contradictory pairs; the newer pick wins. Mirrors toggleVibe in quickstart.ts. */
const OPPOSITE: Partial<Record<Vibe, Vibe>> = {
  city: 'quiet', quiet: 'city', mountains: 'flat', flat: 'mountains',
};

/**
 * The first thing a new visitor sees. What brings you here, where, what
 * weather, what you would love around you, and only for buyers, a budget.
 * Single-choice screens advance on their own: a Next button after a tap is a
 * second tap that carries no information.
 */
export default function Onboarding(p: Props) {
  const [step, setStep] = useState(0);
  const [a, setA] = useState<QuickAnswers>(() => ({ ...DEFAULT_QUICK, ...p.initial }));
  // Which tile was just tapped, so it lights up for a beat before the screen moves on.
  const [flash, setFlash] = useState<string | null>(null);
  // Steps already answered, so stepping Back shows the earlier choice lit.
  const [done, setDone] = useState<Set<number>>(
    () => new Set(p.initial ? [0, 1, 2, 3, 4] : []),
  );
  const lit = (key: string, chosen: boolean) => (flash === key || (done.has(step) && chosen) ? 'on' : '');

  const buying = a.intent === 'buy';
  const travel = a.intent === 'travel';
  const steps = buying ? 5 : 4;

  const search = useMemo(() => buildQuickSearch(a, p.home), [a, p.home]);
  const count = useMemo(() => {
    let n = 0;
    for (const t of p.towns) if (!rejectReason(t, search.filters, p.env)) n++;
    return n;
  }, [p.towns, search, p.env]);

  // Keyed on a string, not the array, so the examples are not recomputed on
  // every render.
  const monthKey = travel ? a.months.join(',') : '';
  const examples = useMemo(() => {
    const months = monthKey ? monthKey.split(',').map(Number) : [];
    const out: Partial<Record<Summer, string[]>> = {};
    for (const s of SUMMERS) out[s.key] = summerExamples(p.towns, s.key, p.home, 3, months);
    return out;
  }, [p.towns, p.home, monthKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') p.onSkip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p]);

  const finish = (next: QuickAnswers) => p.onDone(buildQuickSearch(next, p.home), next);

  const choose = (patch: Partial<QuickAnswers>, tile: string, end = false) => {
    const next = { ...a, ...patch };
    setA(next);
    setFlash(tile);
    setDone((d) => new Set(d).add(step));
    window.setTimeout(() => {
      setFlash(null);
      if (end) finish(next);
      else setStep((s) => s + 1);
    }, 180);
  };

  const toggleVibe = (v: Vibe) =>
    setA((prev) => {
      let vibes = prev.vibes.includes(v) ? prev.vibes.filter((x) => x !== v) : [...prev.vibes, v];
      const other = OPPOSITE[v];
      if (other && vibes.includes(v)) vibes = vibes.filter((x) => x !== other);
      return { ...prev, vibes };
    });

  const toggleMonth = (m: number) =>
    setA((prev) => {
      const has = prev.months.includes(m);
      const ms = has ? prev.months.filter((x) => x !== m) : [...prev.months, m].sort((x, y) => x - y);
      return { ...prev, months: ms };
    });

  const where = whereOptions(p.homeName, p.home);
  const landscape = VIBES.filter((v) => v.group === 'landscape');
  const life = VIBES.filter((v) => v.group === 'life');

  const vibeTile = (v: (typeof VIBES)[number]) => (
    <button
      key={v.key}
      className={`tile small ${a.vibes.includes(v.key) ? 'on' : ''}`}
      onClick={() => toggleVibe(v.key)}
      aria-pressed={a.vibes.includes(v.key)}
      title={v.hint}
    >
      <span className="ico" aria-hidden>{v.icon}</span>
      <b>{v.label}</b>
    </button>
  );

  return (
    <div className="onboard" role="dialog" aria-modal="true" aria-label="Get started">
      <div className="onboard-card">
        <div className="onboard-top">
          <div className="progress" aria-label={`Step ${step + 1} of ${steps}`}>
            {Array.from({ length: steps }, (_, i) => (
              <i key={i} className={i <= step ? 'on' : ''} />
            ))}
          </div>
          <button className="link" onClick={p.onSkip}>
            Skip, show me everything
          </button>
        </div>

        <div className="onboard-body">
          {step === 0 && (
            <>
              <p className="eyebrow">Find where you would love to be</p>
              <h2>What brings you here?</h2>
              <p className="sub">
                {p.towns.length.toLocaleString()} places ranked on what it is like to be there: weather,
                landscape, things to do, costs and connections. Buying is optional.
              </p>
              <div className="tiles">
                {INTENTS.map((o) => (
                  <button
                    key={o.key}
                    className={`tile ${lit(o.key, a.intent === o.key)}`}
                    onClick={() =>
                      choose(
                        { intent: o.key, months: o.key === 'travel' && !a.months.length ? [nextMonth()] : a.months },
                        o.key,
                      )
                    }
                  >
                    <span className="ico" aria-hidden>{o.icon}</span>
                    <b>{o.label}</b>
                    <small>{o.hint}</small>
                  </button>
                ))}
              </div>
              <label className="homeline">
                I live in
                <select value={p.home ?? ''} onChange={(e) => p.onHome(e.target.value || null)}>
                  <option value="">choose…</option>
                  {p.homeList.map((o) => (
                    <option key={o.cc} value={o.cc}>{o.name}</option>
                  ))}
                </select>
                <span className="subtle">so costs, examples and flight times read against home</span>
              </label>
            </>
          )}

          {step === 1 && (
            <>
              <h2>{travel ? 'Where would you go?' : 'Where would you consider?'}</h2>
              <p className="sub">You can narrow this to countries or regions later.</p>
              <div className="tiles two">
                {where.map((o) => (
                  <button
                    key={o.key}
                    className={`tile ${lit(o.key, a.where === o.key)}`}
                    onClick={() => choose({ where: o.key as Where }, o.key)}
                  >
                    <span className="ico" aria-hidden>{o.icon}</span>
                    <b>{o.label}</b>
                    <small>{o.hint}</small>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2>{travel ? 'When, and what weather?' : 'What weather do you want?'}</h2>
              {travel ? (
                <>
                  <p className="sub">Pick the months you would be there, then tap the weather you want then.</p>
                  <div className="months" role="group" aria-label="Months">
                    {MONTHS.map((m, i) => (
                      <button
                        key={m}
                        className={a.months.includes(i) ? 'on' : ''}
                        aria-pressed={a.months.includes(i)}
                        onClick={() => toggleMonth(i)}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="sub">Judged on the warmest month, the one most likely to make or break a year. Hot is as good an answer as cool.</p>
              )}
              <div className="tiles">
                {SUMMERS.map((s) => (
                  <button
                    key={s.key}
                    className={`tile ${lit(s.key, a.summer === s.key)}`}
                    onClick={() => choose({ summer: s.key }, s.key)}
                  >
                    <span className="ico" aria-hidden>{s.icon}</span>
                    <b>{s.label}</b>
                    <small>{travel ? TRAVEL_HINT[s.key] : s.hint}</small>
                    {examples[s.key]?.length ? (
                      <small className="eg">like {examples[s.key]!.join(', ')}</small>
                    ) : null}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2>What would you love around you?</h2>
              <p className="sub">Pick as many as you like. Each one moves those places up the list; none of them hides anything.</p>
              <h4 className="tilegroup">Landscape</h4>
              <div className="tiles vibes">{landscape.map(vibeTile)}</div>
              <h4 className="tilegroup">Things to do &amp; way of life</h4>
              <div className="tiles vibes">{life.map(vibeTile)}</div>
            </>
          )}

          {step === 4 && buying && (
            <>
              <h2>Roughly what can you spend?</h2>
              <p className="sub">
                For a home of this size. Outside Spain prices are a national band, so treat this as
                a shortlist, not a valuation.
              </p>
              <div className="seg" role="radiogroup" aria-label="Home size">
                {SIZES.map((s) => (
                  <button
                    key={s.value}
                    role="radio"
                    aria-checked={a.minM2 === s.value}
                    className={a.minM2 === s.value ? 'on' : ''}
                    onClick={() => setA({ ...a, minM2: s.value })}
                    title={s.hint}
                  >
                    {s.label} <small>{s.value} m²</small>
                  </button>
                ))}
              </div>
              <div className="tiles two">
                {BUDGETS.map((b) => (
                  <button
                    key={b.value}
                    className={`tile ${lit(String(b.value), a.budget === b.value)}`}
                    onClick={() => choose({ budget: b.value }, String(b.value), true)}
                  >
                    <b>{b.label}</b>
                    <small>€{Math.round(b.value / a.minM2).toLocaleString()} per m² or less</small>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="onboard-foot">
          <button className="link" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            Back
          </button>
          <span className="count" aria-live="polite">
            <b>{count.toLocaleString()}</b> places so far
          </span>
          {step === 3 ? (
            <button
              className="primary"
              onClick={() => {
                setDone((d) => new Set(d).add(3));
                if (buying) setStep(4);
                else finish(a);
              }}
            >
              {buying
                ? a.vibes.length ? `Continue with ${a.vibes.length}` : 'Continue'
                : a.vibes.length ? `Show my places (${a.vibes.length})` : 'Show my places'}
            </button>
          ) : step === 0 ? (
            <button className="link" onClick={p.onAdvanced} title="The original questionnaire: name places you have lived in">
              I know exact cities
            </button>
          ) : (
            <span />
          )}
        </div>
      </div>
    </div>
  );
}
