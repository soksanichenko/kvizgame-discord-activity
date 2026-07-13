import { useEffect, useRef, useState } from 'react';
import type { Atom, GameState } from '../types';
import { Scores } from './Scores';
import { TimerBorder } from './TimerBorder';
import { PauseOverlay } from './PauseOverlay';
import { AppealOverlay } from './AppealOverlay';

const MEDIA_FOLDER: Record<string, string> = {
  image: 'Images',
  voice: 'Audio',
  audio: 'Audio',
  video: 'Video',
};

const DEFAULT_REVEAL_SEC = 4;

interface QuestionProps {
  state: GameState;
  channelId: string;
  playerId: string;
  isHost: boolean;
  send: (op: string, data?: Record<string, unknown>) => void;
}

export function Question({ state, channelId, playerId, isHost, send }: QuestionProps) {
  const { phase, paused, appeal_by, last_judged_id, current_question: cq, active_player_id, current_answerer_id, scores, player_names, settings } = state;
  const progressive = settings.progressive_reveal;
  const isActive = active_player_id === playerId;
  const isAnswerer = current_answerer_id === playerId;

  // Track whether we already sent open_buzzer for this question.
  const openedRef = useRef(false);
  useEffect(() => { openedRef.current = false; }, [cq?.theme_name, cq?.price]);

  // Auto-advance after ANSWER_RESULT (host only, 4 s window for appeals).
  useEffect(() => {
    if (phase !== 'ANSWER_RESULT' || !isHost || appeal_by || paused) return;
    const t = setTimeout(() => send('advance'), 4000);
    return () => clearTimeout(t);
  }, [phase, isHost, appeal_by, paused, send]);

  // Auto-open buzzer (host only). Delay = sum of reveal durations when progressive.
  useEffect(() => {
    if (phase !== 'QUESTION' || !isHost) return;
    const delayMs = progressive
      ? (cq?.scenario ?? []).reduce((sum, a) => sum + (a.time > 0 ? a.time : DEFAULT_REVEAL_SEC) * 1000, 0)
      : 0;
    const t = setTimeout(() => {
      if (!openedRef.current) {
        openedRef.current = true;
        send('open_buzzer');
      }
    }, delayMs);
    return () => clearTimeout(t);
  }, [phase, isHost, progressive, cq?.theme_name, cq?.price, send]);

  // Auto-play media elements on question change.
  const mediaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    mediaRef.current?.querySelectorAll<HTMLMediaElement>('audio, video').forEach(el => {
      el.play().catch(() => {});
    });
  }, [cq?.theme_name, cq?.price]);

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', padding: '1rem', gap: '1rem' }}>
      <TimerBorder phase={phase} paused={paused} />
      {appeal_by ? (
        <AppealOverlay state={state} isHost={isHost} send={send} />
      ) : (
        paused && <PauseOverlay isHost={isHost} send={send} />
      )}
      {isHost && !paused && !appeal_by && (
        <button
          onClick={() => send('pause')}
          style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', background: 'transparent', color: '#90caf9', border: '1px solid #1976d2', borderRadius: 4, padding: '0.2rem 0.6rem', fontSize: '0.8rem', cursor: 'pointer', zIndex: 5 }}
        >
          ⏸
        </button>
      )}
      {cq && (
        <div style={{ textAlign: 'center', color: '#90caf9', fontSize: '0.85rem' }}>
          {cq.theme_name} · <strong style={{ color: '#ffd54f' }}>{cq.price}</strong>
        </div>
      )}

      {isHost && settings.show_answers_to_host && cq && phase !== 'ANSWER_RESULT' && (
        <div style={{ textAlign: 'center', fontSize: '0.8rem', color: '#a5d6a7', padding: '0.2rem 0.75rem', background: '#0a1a05', borderRadius: 4, border: '1px solid #1a5a1a' }}>
          Answer: {cq.right.join(' / ')}
        </div>
      )}

      <div
        ref={mediaRef}
        key={`${cq?.theme_name}-${cq?.price}`}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}
      >
        {cq?.scenario.map((atom, i) => (
          <QuestionAtom key={i} atom={atom} packStem={state.pack_stem} progressive={progressive} />
        ))}
      </div>

      {phase === 'ANSWER_RESULT' && cq && (
        <div style={{ textAlign: 'center', color: '#a5d6a7', fontSize: '1rem' }}>
          Answer: <strong>{cq.right.join(' / ')}</strong>
        </div>
      )}

      <Controls
        phase={phase}
        isActive={isActive}
        isHost={isHost}
        isAnswerer={isAnswerer}
        answerer={current_answerer_id}
        cq={cq}
        playerId={playerId}
        playerNames={player_names}
        lastJudgedId={last_judged_id}
        falseStarts={settings.false_starts}
        send={send}
      />

      <Scores scores={scores} playerNames={player_names} playerAvatars={state.player_avatars} connectedPlayers={state.connected_players} answerer={current_answerer_id} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Atom renderers
// ---------------------------------------------------------------------------

function QuestionAtom({ atom, packStem, progressive }: { atom: Atom; packStem: string; progressive: boolean }) {
  if (atom.type === 'text' || atom.type === 'say') {
    return <RevealText content={atom.content} durationSec={atom.time} progressive={progressive} />;
  }
  const folder = MEDIA_FOLDER[atom.type];
  if (!folder) return null;
  const filename = atom.content.replace(/^@/, '');
  const url = `/api/media/packs/${packStem}/${folder}/${encodeURIComponent(filename)}`;
  if (atom.type === 'image') {
    return <RevealImage src={url} durationSec={atom.time} progressive={progressive} />;
  }
  if (atom.type === 'audio' || atom.type === 'voice') {
    return <audio autoPlay controls src={url} style={{ width: '100%', maxWidth: 500 }} />;
  }
  if (atom.type === 'video') {
    return <video autoPlay controls src={url} style={{ maxWidth: '100%', maxHeight: 400 }} />;
  }
  return null;
}

function RevealText({ content, durationSec, progressive }: { content: string; durationSec: number; progressive: boolean }) {
  const [visible, setVisible] = useState(() => (progressive ? 0 : content.length));

  useEffect(() => {
    if (!progressive) {
      setVisible(content.length);
      return;
    }
    setVisible(0);
    const totalMs = (durationSec > 0 ? durationSec : DEFAULT_REVEAL_SEC) * 1000;
    const start = Date.now();
    let id: ReturnType<typeof requestAnimationFrame>;
    const tick = () => {
      const fraction = Math.min((Date.now() - start) / totalMs, 1);
      setVisible(Math.ceil(fraction * content.length));
      if (fraction < 1) id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [content, durationSec, progressive]);

  return <p style={{ fontSize: '1.4rem', textAlign: 'center', maxWidth: 600, margin: 0 }}>{content.slice(0, visible)}</p>;
}

function RevealImage({ src, durationSec, progressive }: { src: string; durationSec: number; progressive: boolean }) {
  const [progress, setProgress] = useState(() => (progressive && durationSec !== 0 ? 0 : 100));

  useEffect(() => {
    if (!progressive) {
      setProgress(100);
      return;
    }
    setProgress(0);
    const totalMs = (durationSec > 0 ? durationSec : DEFAULT_REVEAL_SEC) * 1000;
    const start = Date.now();
    let id: ReturnType<typeof requestAnimationFrame>;
    const tick = () => {
      const fraction = Math.min((Date.now() - start) / totalMs, 1);
      setProgress(Math.ceil(fraction * 100));
      if (fraction < 1) id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [src, durationSec, progressive]);

  const clipPath = progress < 100 ? `inset(0 0 ${100 - progress}% 0)` : undefined;
  return (
    <img
      src={src}
      style={{ maxWidth: '100%', maxHeight: 400, objectFit: 'contain', ...(clipPath ? { clipPath } : {}) }}
    />
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

interface ControlsProps {
  phase: GameState['phase'];
  isActive: boolean;
  isHost: boolean;
  isAnswerer: boolean;
  answerer: string | null;
  cq: GameState['current_question'];
  playerId: string;
  playerNames: Record<string, string>;
  lastJudgedId: string | null;
  falseStarts: boolean;
  send: (op: string, data?: Record<string, unknown>) => void;
}

function Controls({ phase, isActive, isHost, isAnswerer, answerer, cq, playerId, playerNames, lastJudgedId, falseStarts, send }: ControlsProps) {
  const minBid = cq ? Math.max(1, cq.price) : 1;
  const [bid, setBid] = useState(minBid);
  useEffect(() => { setBid(minBid); }, [minBid]);

  if (phase === 'AUCTION_BIDDING') {
    if (!isActive) {
      return <div style={{ textAlign: 'center', color: '#ffd54f' }}>Auction! Waiting for bid…</div>;
    }
    return (
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: '#ffd54f', marginBottom: '0.5rem' }}>Place your bid (min {minBid}):</p>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}>
          <input
            type="number"
            min={minBid}
            value={bid}
            onChange={e => setBid(Math.max(minBid, +e.target.value))}
            style={{ width: 100, fontSize: '1rem', padding: '0.4rem', background: '#1a2035', color: '#fff', border: '1px solid #1976d2', borderRadius: 4 }}
          />
          <button
            onClick={() => send('bid', { amount: bid })}
            disabled={bid < minBid}
            style={{ background: '#1565c0', color: '#fff', fontSize: '1rem', padding: '0.5rem 1.5rem' }}
          >
            Bid
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'CAT_TRANSFER') {
    if (!isActive) {
      return <div style={{ textAlign: 'center', color: '#ffd54f' }}>Cat in a bag! Waiting for transfer…</div>;
    }
    const others = Object.entries(playerNames).filter(([id]) => id !== playerId);
    return (
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: '#ffd54f', marginBottom: '0.5rem' }}>Cat in a bag! Choose a player:</p>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          {others.map(([id, name]) => (
            <button
              key={id}
              onClick={() => send('transfer', { recipient_id: id })}
              style={{ background: '#6a1b9a', color: '#fff', fontSize: '1rem', padding: '0.5rem 1.5rem', borderRadius: 6 }}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Early buzz: shown when false starts are allowed and there is no fixed answerer.
  if (phase === 'QUESTION' && !isHost && !falseStarts && !answerer) {
    return (
      <div style={{ textAlign: 'center' }}>
        <button
          onClick={() => send('buzz')}
          style={{ background: '#b71c1c', color: '#fff', fontSize: '1.6rem', fontWeight: 700, padding: '1rem 3rem', borderRadius: 12 }}
        >
          BUZZ!
        </button>
      </div>
    );
  }

  if (phase === 'BUZZER_OPEN') {
    if (isHost) return null;
    return (
      <div style={{ textAlign: 'center' }}>
        <button
          onClick={() => send('buzz')}
          style={{ background: '#b71c1c', color: '#fff', fontSize: '1.6rem', fontWeight: 700, padding: '1rem 3rem', borderRadius: 12 }}
        >
          BUZZ!
        </button>
      </div>
    );
  }

  if (phase === 'ANSWERING') {
    return (
      <div style={{ textAlign: 'center', color: '#ffd54f' }}>
        {isAnswerer ? 'Your turn to answer!' : `${playerNames[answerer!] ?? answerer} is answering…`}
        {isHost && (
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '0.8rem' }}>
            <button onClick={() => send('judge', { correct: true })} style={{ background: '#2e7d32', color: '#fff', fontSize: '1rem', padding: '0.6rem 1.5rem' }}>✓ Correct</button>
            <button onClick={() => send('judge', { correct: false })} style={{ background: '#c62828', color: '#fff', fontSize: '1rem', padding: '0.6rem 1.5rem' }}>✗ Wrong</button>
          </div>
        )}
      </div>
    );
  }

  if (phase === 'ANSWER_RESULT') {
    const canAppeal = !isHost && lastJudgedId === playerId;
    if (!canAppeal) return null;
    return (
      <div style={{ textAlign: 'center' }}>
        <button
          onClick={() => send('request_appeal')}
          style={{ background: '#e65100', color: '#fff', padding: '0.6rem 1.5rem', borderRadius: 6, cursor: 'pointer' }}
        >
          ⚖️ Appeal
        </button>
      </div>
    );
  }

  return null;
}
