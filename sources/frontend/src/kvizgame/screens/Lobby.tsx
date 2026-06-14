import { useCallback, useEffect, useRef, useState } from 'react';
import { Events } from '@discord/embedded-app-sdk';
import { sdk } from '../discord';
import type { AuthResult } from '../discord';

interface Pack {
  name: string;
  path: string;
}

interface Participant {
  id: string;
  displayName: string;
}

interface LobbyProps {
  auth: AuthResult;
  onGameReady: () => void;
}

export function Lobby({ auth, onGameReady }: LobbyProps) {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [selectedPath, setSelectedPath] = useState('');
  const [participants, setParticipants] = useState<Participant[]>([
    { id: auth.userId, displayName: auth.username },
  ]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchPacks = useCallback(() => {
    fetch('/api/packs')
      .then((r) => r.json())
      .then((data: Pack[]) => {
        setPacks(data);
        setSelectedPath((prev) => prev || (data.length > 0 ? data[0].path : ''));
      })
      .catch(() => {});
  }, []);

  useEffect(() => { fetchPacks(); }, [fetchPacks]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    const form = new FormData();
    form.append('file', file);
    try {
      const r = await fetch('/api/packs', { method: 'POST', body: form });
      if (r.ok) {
        const data: Pack = await r.json();
        fetchPacks();
        setSelectedPath(data.path);
      } else {
        const text = await r.text();
        setUploadError(text || 'Upload failed');
      }
    } catch {
      setUploadError('Network error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Get initial participant list; fall back to current user in dev/mock mode.
  useEffect(() => {
    sdk.commands
      .getActivityInstanceConnectedParticipants()
      .then(({ participants: raw }) =>
        setParticipants(
          raw.map((p) => ({ id: p.id, displayName: p.global_name ?? p.username })),
        ),
      )
      .catch(() => {});
  }, []);

  // Keep participant list in sync with Discord Activity events.
  useEffect(() => {
    const handler = ({
      participants: raw,
    }: {
      participants: { id: string; username: string; global_name?: string | null }[];
    }) => {
      setParticipants(raw.map((p) => ({ id: p.id, displayName: p.global_name ?? p.username })));
    };
    sdk.subscribe(Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE, handler).catch(() => {});
    return () => {
      sdk.unsubscribe(Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE, handler).catch(() => {});
    };
  }, []);

  // Poll until a session appears (covers non-starters who wait for someone else to start).
  useEffect(() => {
    const id = setInterval(async () => {
      const r = await fetch(`/api/sessions/${auth.channelId}`).catch(() => null);
      if (r?.ok) {
        clearInterval(id);
        onGameReady();
      }
    }, 2000);
    return () => clearInterval(id);
  }, [auth.channelId, onGameReady]);

  const startGame = async () => {
    if (!selectedPath || starting) return;
    setStarting(true);
    setError(null);
    const playerIds = participants.map((p) => p.id);
    const playerNames = Object.fromEntries(participants.map((p) => [p.id, p.displayName]));
    const r = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel_id: auth.channelId,
        siq_path: selectedPath,
        player_ids: playerIds,
        player_names: playerNames,
        host_id: auth.userId,
      }),
    }).catch(() => null);
    if (r && (r.ok || r.status === 409)) {
      onGameReady();
    } else {
      const text = await r?.text().catch(() => '');
      setError(`Failed to start: ${text || 'network error'}`);
      setStarting(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '2rem',
        padding: '1.5rem',
      }}
    >
      <h1 style={{ margin: 0, fontSize: '1.8rem' }}>KvizGame</h1>

      <div style={{ display: 'flex', gap: '2rem', width: '100%', maxWidth: '600px' }}>
        <section style={{ flex: 1 }}>
          <h3 style={{ marginBottom: '0.75rem' }}>Players ({participants.length})</h3>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {participants.map((p) => (
              <li key={p.id} style={{ background: '#1e1e2e', borderRadius: 6, padding: '0.4rem 0.75rem' }}>
                {p.displayName}
                {p.id === auth.userId && (
                  <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#90caf9' }}>(you)</span>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section style={{ flex: 1 }}>
          <h3 style={{ marginBottom: '0.75rem' }}>Pack</h3>
          {packs.length === 0 ? (
            <p style={{ color: '#aaa', fontSize: '0.9rem' }}>No packs yet — upload one below.</p>
          ) : (
            <select
              value={selectedPath}
              onChange={(e) => setSelectedPath(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                background: '#1e1e2e',
                color: '#fff',
                border: '1px solid #444',
                borderRadius: 6,
              }}
            >
              {packs.map((p) => (
                <option key={p.path} value={p.path}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <div style={{ marginTop: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input ref={fileInputRef} type="file" accept=".siq" style={{ display: 'none' }} onChange={handleUpload} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{
                padding: '0.35rem 0.9rem',
                fontSize: '0.85rem',
                background: uploading ? '#333' : '#2a2a3e',
                color: uploading ? '#888' : '#90caf9',
                border: '1px solid #444',
                borderRadius: 6,
                cursor: uploading ? 'default' : 'pointer',
              }}
            >
              {uploading ? 'Uploading…' : 'Upload .siq'}
            </button>
            {uploadError && <span style={{ fontSize: '0.8rem', color: '#ef9a9a' }}>{uploadError}</span>}
          </div>
        </section>
      </div>

      <button
        onClick={startGame}
        disabled={!selectedPath || starting}
        style={{
          padding: '0.7rem 2.5rem',
          fontSize: '1rem',
          background: selectedPath && !starting ? '#1565c0' : '#333',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          cursor: selectedPath && !starting ? 'pointer' : 'default',
        }}
      >
        {starting ? 'Starting…' : 'Start Game'}
      </button>

      {error && <p style={{ color: '#ef9a9a', margin: 0 }}>{error}</p>}
    </div>
  );
}
