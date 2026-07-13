interface ScoresProps {
  scores: Record<string, number>;
  playerNames: Record<string, string>;
  playerAvatars?: Record<string, string | null>;
  connectedPlayers?: string[];
  answerer?: string | null;
}

function playerAvatarUrl(userId: string, avatar: string | null): string {
  if (avatar) return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png?size=40`;
  try {
    return `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(userId) >> 22n) % 6}.png`;
  } catch {
    return 'https://cdn.discordapp.com/embed/avatars/0.png';
  }
}

export function Scores({ scores, playerNames, playerAvatars, connectedPlayers, answerer }: ScoresProps) {
  const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);
  return (
    <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center', flexWrap: 'wrap' }}>
      {sorted.map(([id, score]) => {
        const avatar = playerAvatars?.[id] ?? null;
        const name = playerNames[id] ?? id;
        const online = !connectedPlayers || connectedPlayers.includes(id);
        return (
          <div
            key={id}
            style={{
              background: answerer === id ? '#1565c0' : '#1a2035',
              border: `1px solid ${answerer === id ? '#42a5f5' : '#2a3a5a'}`,
              borderRadius: 8,
              padding: '0.4rem 0.75rem',
              minWidth: 90,
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.25rem',
              opacity: online ? 1 : 0.4,
            }}
          >
            <img
              src={playerAvatarUrl(id, avatar)}
              alt=""
              style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <div style={{ fontSize: '0.72rem', color: '#90a4ae', lineHeight: 1.2 }}>{name}</div>
            <div style={{ fontWeight: 700, color: score < 0 ? '#ef5350' : '#ffd54f' }}>{score}</div>
          </div>
        );
      })}
    </div>
  );
}
