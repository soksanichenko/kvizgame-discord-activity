import { useState } from 'react';
import type { GameState } from '../types';
import { Scores } from './Scores';
import { PauseOverlay } from './PauseOverlay';
import { ScoreCorrection } from './ScoreCorrection';

interface BoardProps {
  state: GameState;
  playerId: string;
  isHost: boolean;
  send: (op: string, data?: Record<string, unknown>) => void;
}

export function Board({ state, playerId, isHost, send }: BoardProps) {
  const isActive = !isHost && state.active_player_id === playerId;
  const { paused, scores, player_names } = state;
  const [correcting, setCorrecting] = useState(false);

  const openCorrection = () => {
    if (!paused) send('pause');
    setCorrecting(true);
  };

  const applyCorrection = (adjustments: Record<string, number>) => {
    if (Object.keys(adjustments).length > 0) {
      send('correct_scores', { adjustments });
    }
  };
  const cols = state.board.length;

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', padding: '1rem', gap: '1rem' }}>
      {correcting && (
        <ScoreCorrection
          scores={scores}
          playerNames={player_names}
          onApply={applyCorrection}
          onClose={() => setCorrecting(false)}
        />
      )}
      {!correcting && paused && <PauseOverlay isHost={isHost} send={send} />}
      {isHost && !correcting && (
        <div style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', display: 'flex', gap: '0.4rem', zIndex: 5 }}>
          {!paused && (
            <button onClick={() => send('pause')} style={hostBtnStyle}>⏸</button>
          )}
          <button onClick={openCorrection} style={hostBtnStyle}>⚙</button>
        </div>
      )}
      <header style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.2rem', color: '#90caf9' }}>{state.round_name}</h1>
        {isActive && (
          <p style={{ fontSize: '0.8rem', color: '#81c784', marginTop: 4 }}>Your turn — pick a question</p>
        )}
        {isHost && state.active_player_id && (
          <p style={{ fontSize: '0.8rem', color: '#81c784', marginTop: 4 }}>
            {state.player_names[state.active_player_id] ?? state.active_player_id} is picking…
          </p>
        )}
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: '0.4rem',
          flex: 1,
          overflow: 'auto',
        }}
      >
        {state.board.map((theme, tIdx) => (
          <div key={tIdx} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div
              style={{
                background: '#0d47a1',
                borderRadius: 6,
                padding: '0.5rem 0.25rem',
                textAlign: 'center',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#bbdefb',
                minHeight: 48,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {theme.name}
            </div>
            {theme.questions.map((q, qIdx) => (
              <button
                key={qIdx}
                disabled={q.played || !isActive}
                onClick={() => send('select', { theme_idx: tIdx, question_idx: qIdx })}
                style={{
                  background: q.played ? '#1a2035' : '#1565c0',
                  color: q.played ? 'transparent' : '#ffd54f',
                  fontWeight: 700,
                  fontSize: '1.1rem',
                  padding: '0.8rem 0',
                  borderRadius: 6,
                  border: `1px solid ${q.played ? '#2a3a5a' : '#1976d2'}`,
                }}
              >
                {q.played ? '' : q.price}
              </button>
            ))}
          </div>
        ))}
      </div>

      <Scores
        scores={state.scores}
        playerNames={state.player_names}
        playerAvatars={state.player_avatars}
        connectedPlayers={state.connected_players}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '0.25rem', borderTop: '1px solid #1e1e3a' }}>
        <img
          src={state.host_avatar
            ? `https://cdn.discordapp.com/avatars/${state.host_id}/${state.host_avatar}.png?size=32`
            : (() => { try { return `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(state.host_id) >> 22n) % 6}.png`; } catch { return 'https://cdn.discordapp.com/embed/avatars/0.png'; } })()
          }
          alt=""
          style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <span style={{ fontSize: '0.6rem', color: '#90caf9', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>Host</span>
        <span style={{ fontSize: '0.8rem', color: '#ccc' }}>{state.host_name}</span>
      </div>
    </div>
  );
}

const hostBtnStyle: React.CSSProperties = {
  background: 'transparent', color: '#90caf9', border: '1px solid #1976d2',
  borderRadius: 4, padding: '0.2rem 0.6rem', fontSize: '0.8rem', cursor: 'pointer',
};
