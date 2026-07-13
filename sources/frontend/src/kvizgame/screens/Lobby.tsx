import { useCallback, useEffect, useRef, useState } from 'react';
import { Events } from '@discord/embedded-app-sdk';
import { sdk } from '../discord';
import type { AuthResult } from '../discord';

type Role = 'host' | 'player' | 'watch';
type Tab = 'participants' | 'settings';

interface Pack {
  name: string;
  path: string;
}

interface Participant {
  id: string;
  displayName: string;
  avatar: string | null;
}

interface LobbyProps {
  auth: AuthResult;
  onGameReady: () => void;
}

function avatarUrl(userId: string, avatar: string | null): string {
  if (avatar) return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png?size=40`;
  try {
    return `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(userId) >> 22n) % 6}.png`;
  } catch {
    return 'https://cdn.discordapp.com/embed/avatars/0.png';
  }
}

const ROLE_STYLE: Record<Role, { bg: string; border: string; color: string }> = {
  host:   { bg: '#2a1a00', border: '#b8860b', color: '#ffd54f' },
  player: { bg: '#1565c0', border: '#1976d2', color: '#fff'    },
  watch:  { bg: '#1e1e1e', border: '#444',    color: '#888'    },
};

const SETTINGS_LABELS: [keyof typeof defaultSettings, string, string][] = [
  ['progressive_reveal', 'Поступательный показ вопроса', 'Текст и картинки появляются постепенно; таймер стартует после полного вывода'],
  ['false_starts',       'Запрет фальстартов',           'При выключенной опции игроки могут жать «Ответ» до окончания вывода вопроса'],
  ['show_answers_to_host', 'Ответ виден ведущему',       'Ведущий видит правильный ответ уже во время показа вопроса'],
];

const defaultSettings = { progressive_reveal: false, false_starts: false, show_answers_to_host: true };

export function Lobby({ auth, onGameReady }: LobbyProps) {
  const [tab, setTab] = useState<Tab>('participants');
  const [packs, setPacks] = useState<Pack[]>([]);
  const [selectedPath, setSelectedPath] = useState('');
  const [participants, setParticipants] = useState<Participant[]>([
    { id: auth.userId, displayName: auth.username, avatar: auth.avatar },
  ]);
  const [roles, setRoles] = useState<Record<string, Role>>({ [auth.userId]: 'host' });
  const [gameSettings, setGameSettings] = useState(defaultSettings);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getRoleFor = (id: string): Role => roles[id] ?? 'player';
  const isLocalHost = getRoleFor(auth.userId) === 'host';

  const cycleRole = (id: string) => {
    if (!isLocalHost) return;
    setRoles((prev) => {
      const current = prev[id] ?? 'player';
      const next: Role = current === 'player' ? 'watch' : current === 'watch' ? 'host' : 'player';
      const updated: Record<string, Role> = { ...prev, [id]: next };
      if (next === 'host') {
        Object.keys(updated).forEach((k) => {
          if (k !== id && updated[k] === 'host') updated[k] = 'player';
        });
      }
      return updated;
    });
  };

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
    if (!isLocalHost) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    setUploadProgress(0);

    const CHUNK_SIZE = 8 * 1024 * 1024;
    const uploadId = crypto.randomUUID();
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    try {
      for (let i = 0; i < totalChunks; i++) {
        const form = new FormData();
        form.append('upload_id', uploadId);
        form.append('chunk_index', String(i));
        form.append('total_chunks', String(totalChunks));
        form.append('filename', file.name);
        form.append('chunk', file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));

        const r = await fetch('/api/packs/chunk', { method: 'POST', body: form });
        if (!r.ok) {
          setUploadError((await r.text()) || 'Upload failed');
          return;
        }
        const data = await r.json();
        setUploadProgress(Math.round(((i + 1) / totalChunks) * 100));
        if (data.done) { fetchPacks(); setSelectedPath(data.path); }
      }
    } catch {
      setUploadError('Network error');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    sdk.commands
      .getActivityInstanceConnectedParticipants()
      .then(({ participants: raw }) =>
        setParticipants(raw.map((p) => ({ id: p.id, displayName: p.global_name ?? p.username, avatar: p.avatar ?? null }))),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handler = ({ participants: raw }: { participants: { id: string; username: string; global_name?: string | null; avatar?: string | null }[] }) => {
      setParticipants(raw.map((p) => ({ id: p.id, displayName: p.global_name ?? p.username, avatar: p.avatar ?? null })));
    };
    sdk.subscribe(Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE, handler).catch(() => {});
    return () => { sdk.unsubscribe(Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE, handler).catch(() => {}); };
  }, []);

  useEffect(() => {
    const id = setInterval(async () => {
      const r = await fetch(`/api/sessions/${auth.channelId}`).catch(() => null);
      if (r?.ok) { clearInterval(id); onGameReady(); }
    }, 2000);
    return () => clearInterval(id);
  }, [auth.channelId, onGameReady]);

  const hostParticipant = participants.find((p) => getRoleFor(p.id) === 'host');
  const players = participants.filter((p) => getRoleFor(p.id) === 'player');
  const canStart = isLocalHost && !!selectedPath && !starting && !!hostParticipant && players.length > 0;

  const startGame = async () => {
    if (!canStart) return;
    setStarting(true);
    setError(null);
    const host = hostParticipant!;
    const r = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel_id: auth.channelId,
        siq_path: selectedPath,
        player_ids: players.map((p) => p.id),
        player_names: Object.fromEntries(players.map((p) => [p.id, p.displayName])),
        player_avatars: Object.fromEntries(players.map((p) => [p.id, p.avatar ?? null])),
        host_id: host.id,
        host_name: host.displayName,
        host_avatar: host.avatar ?? null,
        ...gameSettings,
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '1.25rem 1.5rem', gap: '1rem' }}>
      <h1 style={{ margin: 0, fontSize: '1.6rem', textAlign: 'center' }}>KvizGame</h1>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid #1e1e3a', flexShrink: 0 }}>
        {(['participants', 'settings'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '0.4rem 1.1rem', fontSize: '0.875rem', background: 'transparent',
              color: tab === t ? '#90caf9' : '#666',
              border: 'none', borderBottom: `2px solid ${tab === t ? '#1976d2' : 'transparent'}`,
              cursor: 'pointer', marginBottom: -1,
            }}
          >
            {t === 'participants' ? `Участники (${participants.length})` : 'Настройки'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {tab === 'participants' && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {participants.map((p) => {
              const role = getRoleFor(p.id);
              const rc = ROLE_STYLE[role];
              return (
                <li
                  key={p.id}
                  style={{ background: '#1e1e2e', borderRadius: 6, padding: '0.35rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <img
                    src={avatarUrl(p.id, p.avatar)}
                    alt=""
                    style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  <span style={{ flex: 1, fontSize: '0.9rem' }}>
                    {p.displayName}
                    {p.id === auth.userId && <span style={{ marginLeft: '0.35rem', fontSize: '0.7rem', color: '#90caf9' }}>(you)</span>}
                  </span>
                  <button
                    onClick={() => cycleRole(p.id)}
                    disabled={!isLocalHost}
                    style={{
                      fontSize: '0.72rem', padding: '0.15rem 0.55rem',
                      background: rc.bg, color: rc.color, border: `1px solid ${rc.border}`,
                      borderRadius: 4, cursor: isLocalHost ? 'pointer' : 'default',
                      flexShrink: 0, minWidth: 54, opacity: isLocalHost ? 1 : 0.6,
                    }}
                  >
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {tab === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Pack selection */}
            <section>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: '#90caf9', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Пакет вопросов</h3>
              {packs.length === 0 ? (
                <p style={{ color: '#aaa', fontSize: '0.9rem', margin: 0 }}>Нет загруженных пакетов.</p>
              ) : (
                <select
                  value={selectedPath}
                  onChange={(e) => isLocalHost && setSelectedPath(e.target.value)}
                  disabled={!isLocalHost}
                  style={{
                    width: '100%', padding: '0.5rem',
                    background: '#1e1e2e', color: isLocalHost ? '#fff' : '#888',
                    border: '1px solid #444', borderRadius: 6, opacity: isLocalHost ? 1 : 0.7,
                  }}
                >
                  {packs.map((p) => <option key={p.path} value={p.path}>{p.name}</option>)}
                </select>
              )}
              {isLocalHost && (
                <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input ref={fileInputRef} type="file" accept=".siq" style={{ display: 'none' }} onChange={handleUpload} />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    style={{
                      padding: '0.35rem 0.9rem', fontSize: '0.85rem',
                      background: uploading ? '#333' : '#2a2a3e', color: uploading ? '#888' : '#90caf9',
                      border: '1px solid #444', borderRadius: 6, cursor: uploading ? 'default' : 'pointer',
                    }}
                  >
                    {uploading ? `Загрузка… ${uploadProgress}%` : 'Загрузить .siq'}
                  </button>
                  {uploadError && <span style={{ fontSize: '0.8rem', color: '#ef9a9a' }}>{uploadError}</span>}
                </div>
              )}
            </section>

            {/* Game rules */}
            <section>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: '#90caf9', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Правила</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {SETTINGS_LABELS.map(([key, label, hint]) => (
                  <label
                    key={key}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', cursor: isLocalHost ? 'pointer' : 'default', opacity: isLocalHost ? 1 : 0.6 }}
                  >
                    <input
                      type="checkbox"
                      checked={gameSettings[key]}
                      onChange={e => isLocalHost && setGameSettings(prev => ({ ...prev, [key]: e.target.checked }))}
                      disabled={!isLocalHost}
                      style={{ width: 15, height: 15, marginTop: 2, flexShrink: 0, cursor: isLocalHost ? 'pointer' : 'default' }}
                    />
                    <span>
                      <span style={{ fontSize: '0.875rem', color: '#ddd', display: 'block' }}>{label}</span>
                      <span style={{ fontSize: '0.75rem', color: '#666', display: 'block', marginTop: 1 }}>{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
        {isLocalHost ? (
          <>
            <button
              onClick={startGame}
              disabled={!canStart}
              style={{
                padding: '0.65rem 2.5rem', fontSize: '1rem',
                background: canStart ? '#1565c0' : '#333', color: '#fff',
                border: 'none', borderRadius: 8, cursor: canStart ? 'pointer' : 'default', width: '100%', maxWidth: 320,
              }}
            >
              {starting ? 'Запуск…' : 'Начать игру'}
            </button>
            {!hostParticipant && <p style={{ color: '#ffd54f', margin: 0, fontSize: '0.82rem' }}>Нужен ведущий</p>}
            {!!hostParticipant && players.length === 0 && <p style={{ color: '#ffd54f', margin: 0, fontSize: '0.82rem' }}>Нужен хотя бы один игрок</p>}
            {!selectedPath && <p style={{ color: '#ffd54f', margin: 0, fontSize: '0.82rem' }}>Выберите пакет вопросов</p>}
            {error && <p style={{ color: '#ef9a9a', margin: 0, fontSize: '0.85rem' }}>{error}</p>}
          </>
        ) : (
          <p style={{ color: '#888', margin: 0, fontSize: '0.9rem' }}>Ожидание старта от ведущего…</p>
        )}
      </div>
    </div>
  );
}
