import { useCallback, useEffect, useState } from 'react';
import { setup } from './discord';
import type { AuthResult } from './discord';
import { useGame } from './useGame';
import type { GameState } from './types';
import { Board } from './screens/Board';
import { Question } from './screens/Question';
import { Scores } from './screens/Scores';
import { FinalBid } from './screens/FinalBid';
import { FinalQuestion } from './screens/FinalQuestion';
import { FinalJudging } from './screens/FinalJudging';
import { Lobby } from './screens/Lobby';

export function App() {
  const [auth, setAuth] = useState<AuthResult | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    setup().then(setAuth).catch((e: unknown) =>
      setAuthError(e instanceof Error ? e.message : JSON.stringify(e))
    );
  }, []);

  if (authError) return <Centered>Discord auth failed: {authError}</Centered>;
  if (!auth) return <Centered>Connecting to Discord…</Centered>;
  return <GameOrLobby auth={auth} />;
}

type GameStatus = 'loading' | 'lobby' | 'game' | 'left';

function GameOrLobby({ auth }: { auth: AuthResult }) {
  const [status, setStatus] = useState<GameStatus>('loading');

  useEffect(() => {
    fetch(`/api/sessions/${auth.channelId}`)
      .then((r) => setStatus(r.ok ? 'game' : 'lobby'))
      .catch(() => setStatus('lobby'));
  }, [auth.channelId]);

  const onGameReady = useCallback(() => setStatus('game'), []);
  const onHostLeave = useCallback(() => setStatus('lobby'), []);
  const onPlayerLeave = useCallback(() => setStatus('left'), []);
  const onSessionEnded = useCallback(() => setStatus('lobby'), []);

  if (status === 'loading') return <Centered>Connecting…</Centered>;
  if (status === 'left') return (
    <Centered>
      <p style={{ color: '#aaa', margin: 0 }}>You left the game.</p>
      <button
        onClick={async () => {
          const r = await fetch(`/api/sessions/${auth.channelId}`).catch(() => null);
          setStatus(r?.ok ? 'game' : 'lobby');
        }}
        style={{
          marginTop: '1rem', padding: '0.5rem 2rem',
          background: '#1565c0', color: '#fff', border: 'none',
          borderRadius: 6, cursor: 'pointer', fontSize: '0.95rem',
        }}
      >
        Rejoin
      </button>
    </Centered>
  );
  if (status === 'lobby') return <Lobby auth={auth} onGameReady={onGameReady} />;
  return (
    <Game
      auth={auth}
      onHostLeave={onHostLeave}
      onPlayerLeave={onPlayerLeave}
      onSessionEnded={onSessionEnded}
    />
  );
}

function Game({
  auth,
  onHostLeave,
  onPlayerLeave,
  onSessionEnded,
}: {
  auth: AuthResult;
  onHostLeave: () => void;
  onPlayerLeave: () => void;
  onSessionEnded: () => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const { state, error, reconnecting, send, leave } = useGame(auth.channelId, auth.userId, onSessionEnded);

  const isHost = state ? state.host_id === auth.userId : false;
  const isSpectator = state
    ? !state.player_names[auth.userId] && state.host_id !== auth.userId
    : false;

  const handleLeave = async () => {
    setLeaving(true);
    if (isHost) {
      await fetch(`/api/sessions/${auth.channelId}`, { method: 'DELETE' }).catch(() => {});
      onHostLeave();
    } else {
      leave();
      onPlayerLeave();
    }
  };

  const FINAL_PHASES: GameState['phase'][] = ['FINAL_BID', 'FINAL_QUESTION', 'FINAL_JUDGING', 'GAME_OVER'];
  const canJoin = isSpectator && state !== null && !FINAL_PHASES.includes(state.phase);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.35rem 0.75rem', background: '#0d0d1a',
          borderBottom: '1px solid #1e1e3a', flexShrink: 0,
        }}
      >
        {canJoin && (
          <button
            onClick={() => send('join_as_player', { name: auth.username })}
            style={{
              padding: '0.2rem 0.6rem', fontSize: '0.75rem',
              background: '#0a1a05', color: '#a5d6a7',
              border: '1px solid #1a5a1a', borderRadius: 4, cursor: 'pointer',
            }}
          >
            Join as Player
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={handleLeave}
          disabled={leaving}
          style={{
            padding: '0.2rem 0.6rem', fontSize: '0.75rem',
            background: '#1a0505', color: leaving ? '#666' : '#ef9a9a',
            border: '1px solid #5a1a1a', borderRadius: 4,
            cursor: leaving ? 'default' : 'pointer',
          }}
        >
          {leaving ? 'Leaving…' : isHost ? 'End Game' : 'Leave'}
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {error && <Centered style={{ color: '#ef9a9a' }}>{error}</Centered>}
        {!error && !state && <Centered>{reconnecting ? 'Reconnecting…' : 'Joining game…'}</Centered>}
        {!error && state && (
          <Screen state={state} channelId={auth.channelId} playerId={auth.userId} isHost={isHost} send={send} />
        )}
        {!isHost && state && !state.connected_players.includes(state.host_id) && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 20,
            background: 'rgba(0, 0, 0, 0.72)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
          }}>
            <p style={{ margin: 0, fontSize: '1.1rem', color: '#ffd54f' }}>Ведущий отключился</p>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#aaa' }}>Ожидание возвращения ведущего…</p>
          </div>
        )}
      </div>
    </div>
  );
}

const QUESTION_PHASES: GameState['phase'][] = [
  'QUESTION', 'AUCTION_BIDDING', 'CAT_TRANSFER',
  'BUZZER_OPEN', 'ANSWERING', 'ANSWER_RESULT',
];

function Screen({
  state,
  channelId,
  playerId,
  isHost,
  send,
}: {
  state: GameState;
  channelId: string;
  playerId: string;
  isHost: boolean;
  send: (op: string, d?: Record<string, unknown>) => void;
}) {
  const { phase } = state;

  if (phase === 'BOARD') {
    return <Board state={state} playerId={playerId} isHost={isHost} send={send} />;
  }

  if (QUESTION_PHASES.includes(phase)) {
    return <Question state={state} channelId={channelId} playerId={playerId} isHost={isHost} send={send} />;
  }

  if (phase === 'FINAL_BID') {
    return <FinalBid state={state} playerId={playerId} isHost={isHost} send={send} />;
  }

  if (phase === 'FINAL_QUESTION') {
    return <FinalQuestion state={state} channelId={channelId} playerId={playerId} isHost={isHost} send={send} />;
  }

  if (phase === 'FINAL_JUDGING') {
    return <FinalJudging state={state} isHost={isHost} send={send} />;
  }

  if (phase === 'ROUND_END') {
    return (
      <Centered>
        <h2 style={{ marginBottom: '1rem' }}>Round over</h2>
        <Scores scores={state.scores} playerNames={state.player_names} playerAvatars={state.player_avatars} connectedPlayers={state.connected_players} />
        {isHost && (
          <button onClick={() => send('next_round')} style={{ marginTop: '1.5rem', background: '#1565c0', color: '#fff', padding: '0.6rem 2rem' }}>
            Next Round →
          </button>
        )}
      </Centered>
    );
  }

  if (phase === 'GAME_OVER') {
    return (
      <Centered>
        <h2 style={{ marginBottom: '1rem', color: '#ffd54f' }}>Game Over</h2>
        <Scores scores={state.scores} playerNames={state.player_names} playerAvatars={state.player_avatars} connectedPlayers={state.connected_players} />
      </Centered>
    );
  }

  return <Centered>Phase: {phase}</Centered>;
}

function Centered({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem', ...style }}>
      {children}
    </div>
  );
}
