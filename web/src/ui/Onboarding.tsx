import { useEffect, useMemo, useState } from 'react';
import type { Town } from '../types';
import { rejectReason, type FilterEnv } from '../scoring';
import {
  BUDGETS, buildQuickSearch, DEFAULT_QUICK, SIZES, SUMMERS, summerExamples, VIBES,
  whereOptions, type QuickAnswers, type Search, type Summer, type Vibe, type Where,
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

const STEPS = 4;

/**
 * The first thing a new visitor sees. Four screens, each answered with one tap
 * on a tile except the third, which takes several and a Continue. Single-choice
 * screens advance on their own: a Next button after a tap is a second tap that
 * carries no information.
 */
export default function Onboarding(p: Props) {
  const [step, setStep] = useState(0);
  const [a, setA] = useState<QuickAnswers>(p.initial ?? DEFAULT_QUICK);
  // Which tile was just tapped, so it lights up for a beat before the screen moves on.
  const [flash, setFlash] = useState<string | null>(null);
  // Steps already answered, so stepping Back shows the earlier choice lit.
  const [done, setDone] = useState<Set<number>>(
    () => new Set(p.initial ? [0, 1, 2, 3] : []),
  );
  const lit = (key: string, chosen: boolean) => (flash === key || (done.has(step) && chosen) ? 'on' : '');

  const search = useMemo(() => buildQuickSearch(a, p.home), [a, p.home]);
  const count = useMemo(() => {
    let n = 0;
    for (const t of p.towns) if (!rejectReason(t, search.filters, p.env)) n++;
    return n;
  }, [p.towns, search, p.env]);

  const examples = useMemo(() => {
    const out: Partial<Record<Summer, string[]>> = {};
    for (const s of SUMMERS) out[s.key] = summerExamples(p.towns, s.key, p.home);
    return out;
  }, [p.towns, p.home]);

  // Escape closes, as any dialog should; arrows step back and forth.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') p.onSkip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p]);

  const choose = (patch: Partial<QuickAnswers>, tile: string, finish = false) => {
    const next = { ...a, ...patch };
    setA(next);
    setFlash(tile);
    setDone((d) => new Set(d).add(step));
    window.setTimeout(() => {
      setFlash(null);
      if (finish) p.onDone(buildQuickSearch(next, p.home), next);
      else setStep((s) => Math.min(STEPS - 1, s + 1));
    }, 180);
  };

  const toggleVibe = (v: Vibe) =>
    setA((prev) => {
      let vibes = prev.vibes.includes(v) ? prev.vibes.filter((x) => x !== v) : [...prev.vibes, v];
      // The two contradict each other; the newer one wins.
      if (v === 'city' && vibes.includes('city')) vibes = vibes.filter((x) => x !== 'quiet');
      if (v === 'quiet' && vibes.includes('quiet')) vibes = vibes.filter((x) => x !== 'city');
      return { ...prev, vibes };
    });

  const where = whereOptions(p.homeName, p.home);

  return (
    <div className="onboard" role="dialog" aria-modal="true" aria-label="Get started">
      <div className="onboard-card">
        <div className="onboard-top">
          <div className="progress" aria-label={`Step ${step + 1} of ${STEPS}`}>
            {Array.from({ length: STEPS }, (_, i) => (
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
              <p className="eyebrow">Find somewhere you would love to live</p>
              <h2>Where would you consider moving?</h2>
              <p className="sub">
                Four quick taps and you get a ranked list of {p.towns.length.toLocaleString()} places.
                You can fine-tune everything afterwards.
              </p>
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
              <label className="homeline">
                I live in
                <select value={p.home ?? ''} onChange={(e) => p.onHome(e.target.value || null)}>
                  <option value="">choose…</option>
                  {p.homeList.map((o) => (
                    <option key={o.cc} value={o.cc}>{o.name}</option>
                  ))}
                </select>
                <span className="subtle">so prices and examples read against home</span>
              </label>
            </>
          )}

          {step === 1 && (
            <>
              <h2>What summer do you want?</h2>
              <p className="sub">The thing most likely to make or break a move. Hot is as good an answer as cool.</p>
              <div className="tiles">
                {SUMMERS.map((s) => (
                  <button
                    key={s.key}
                    className={`tile ${lit(s.key, a.summer === s.key)}`}
                    onClick={() => choose({ summer: s.key }, s.key)}
                  >
                    <span className="ico" aria-hidden>{s.icon}</span>
                    <b>{s.label}</b>
                    <small>{s.hint}</small>
                    {examples[s.key]?.length ? (
                      <small className="eg">like {examples[s.key]!.join(', ')}</small>
                    ) : null}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2>What would you love to have around you?</h2>
              <p className="sub">Pick as many as you like. Each one moves those places up the list; none of them hides anything.</p>
              <div className="tiles vibes">
                {VIBES.map((v) => (
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
                ))}
              </div>
            </>
          )}

          {step === 3 && (
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
          {step === 2 ? (
            <button className="primary" onClick={() => setStep(3)}>
              {a.vibes.length ? `Continue with ${a.vibes.length}` : 'None of these, continue'}
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
