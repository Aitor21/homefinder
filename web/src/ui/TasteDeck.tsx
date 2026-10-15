import { useEffect, useMemo, useRef, useState } from 'react';
import type { Town } from '../types';
import type { Ranked } from '../scoring';
import { explain, MIN_PICKS, type Affinity } from '../affinity';
import { cultureScore } from '../culture';
import { flag, tasteSample } from '../quickstart';
import { Highlights, MonthStrip } from './bits';

interface Props {
  /** The current results, best first: the deck is drawn from these. */
  ranked: Ranked[];
  /** Everything, for when the filters leave too little to sample from. */
  all: Town[];
  favourites: string[];
  affinity: Affinity | null;
  onLike: (t: Town) => void;
  onClose: () => void;
}

const DECK = 10;
/** How far a card has to be dragged before letting go counts as a decision. */
const THRESHOLD = 90;

/**
 * "Would you live here?", one place at a time.
 *
 * The taste model in affinity.ts learns from places you would live in, and
 * used to be fed only from a detail panel button few people found. Asking
 * about ten varied places in a row, one tap each (or a swipe on a phone),
 * gives it the three it needs within a minute, from places the person has
 * actually looked at rather than ones they were asked to remember.
 *
 * Only a yes teaches anything. A no moves on: one rejected town is not a
 * pattern, and the model reads what your likes share, not what your dislikes do.
 */
export default function TasteDeck({ ranked, all, favourites, affinity, onLike, onClose }: Props) {
  const [seen, setSeen] = useState<Set<string>>(() => new Set(favourites));
  const [round, setRound] = useState(0);
  const deck = useMemo(() => {
    const pool = ranked.length >= DECK
      ? ranked
      : [...ranked, ...[...all].sort((a, b) => b.pop - a.pop).slice(0, 600).map((town) => ({ town, score: 0 }))];
    return tasteSample(pool, DECK, seen, cultureScore);
    // A new deck only when a round starts, not on every like: the list
    // reshuffling under your thumb would be maddening.
  }, [round]);
  const [i, setI] = useState(0);
  const [likes, setLikes] = useState(0);
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState<0 | 1 | -1>(0);
  const start = useRef<{ x: number; id: number } | null>(null);

  const card = deck[i];
  const done = i >= deck.length;

  const decide = (yes: boolean) => {
    if (!card || leaving) return;
    setLeaving(yes ? 1 : -1);
    window.setTimeout(() => {
      if (yes) {
        onLike(card);
        setLikes((n) => n + 1);
      }
      setSeen((s) => new Set(s).add(card.id));
      setI((n) => n + 1);
      setDx(0);
      setLeaving(0);
    }, 200);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') decide(true);
      else if (e.key === 'ArrowLeft') decide(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const total = favourites.length;
  const learned = affinity?.ok ? explain(affinity, 4) : [];

  return (
    <div className="overlay deck-overlay" onClick={onClose}>
      <div className="sheet deck" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Taste check">
        <div className="deckhead">
          <div>
            <h2>Would you live here?</h2>
            <div className="subtle">
              {done ? 'Round done' : `${i + 1} of ${deck.length}`} {'·'} {total} liked so far
              {total < MIN_PICKS && ` · ${MIN_PICKS - total} more and the ranking starts learning from them`}
            </div>
          </div>
          <button className="link" onClick={onClose}>close</button>
        </div>

        {!done && card && (
          <>
            <div
              className={`tcard ${leaving === 1 ? 'out-right' : leaving === -1 ? 'out-left' : ''}`}
              style={leaving ? undefined : { transform: `translateX(${dx}px) rotate(${dx / 22}deg)` }}
              onPointerDown={(e) => {
                start.current = { x: e.clientX, id: e.pointerId };
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (start.current?.id === e.pointerId) setDx(e.clientX - start.current.x);
              }}
              onPointerUp={() => {
                start.current = null;
                if (dx > THRESHOLD) decide(true);
                else if (dx < -THRESHOLD) decide(false);
                else setDx(0);
              }}
              onPointerCancel={() => {
                start.current = null;
                setDx(0);
              }}
            >
              <span className="stamp yes" style={{ opacity: Math.max(0, Math.min(1, dx / THRESHOLD)) }}>YES</span>
              <span className="stamp no" style={{ opacity: Math.max(0, Math.min(1, -dx / THRESHOLD)) }}>NOPE</span>
              <div className="tname">
                <span className="flag" aria-hidden>{flag(card.country)}</span>
                <div>
                  <b>{card.name}</b>
                  <div className="subtle">{card.province} {'·'} {card.countryName}</div>
                </div>
              </div>
              <MonthStrip town={card} />
              <Highlights town={card} max={7} />
            </div>
            <div className="deckbtns">
              <button className="nope" onClick={() => decide(false)} aria-label="Not for me">
                <span aria-hidden>✕</span> Not for me
              </button>
              <button className="yes" onClick={() => decide(true)} aria-label="I would live here">
                <span aria-hidden>♥</span> I’d live here
              </button>
            </div>
            <p className="hintline center">Swipe, tap, or use the arrow keys. Only a yes changes the ranking.</p>
          </>
        )}

        {done && (
          <div className="deckdone">
            <div className="bigcount">
              <b>{likes}</b> liked this round
            </div>
            {learned.length > 0 ? (
              <>
                <h4>What your picks have in common</h4>
                <ul className="notes">
                  {learned.map((l, k) => <li key={k}>{l}</li>)}
                </ul>
                <p className="hintline">
                  The <b>Like my picks</b> weight now ranks every place by this. Like or unlike
                  any town from its panel to refine it.
                </p>
              </>
            ) : (
              <p className="sub">
                {total < MIN_PICKS
                  ? `Like ${MIN_PICKS - total} more and the ranking will start learning what your picks share.`
                  : 'Your picks do not agree on much yet. Another round will sharpen it.'}
              </p>
            )}
            <div className="deckbtns">
              <button className="nope" onClick={() => { setRound((r) => r + 1); setI(0); setLikes(0); }}>
                Ten more
              </button>
              <button className="yes" onClick={onClose}>See my matches</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
