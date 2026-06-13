# KvizGame Discord Activity — Development Plan

## Current state (2026-06-13)

- Extracted from `discord-meow-bot` as a standalone app — done
- Game engine, SIQ parser, React frontend fully functional
- OAuth, Lobby, Board, Question, Final screens work end-to-end on dev host
- All game management moves to the Activity UI — no Discord bot commands

---

## Phase 0: Bootstrap (one-time setup)

### 0.1 Discord Developer Portal — TODO

1. Create a new application at <https://discord.com/developers/applications>
2. **Activities** → enable → set URLs:
   - Root URL: `https://<your-host>/kvizgame`
   - Proxy prefix: `/api`
3. **OAuth2** → copy `Client ID` and `Client Secret`
4. Set env vars for the container:
   ```
   DISCORD_CLIENT_ID=<client_id>
   DISCORD_CLIENT_SECRET=<client_secret>
   DISCORD_PROXY_TARGET=<your-host>   # e.g. homeserver.zelgray.work
   ```

### 0.2 Ansible cleanup — TODO

`ansible/` was copied verbatim from `discord-meow-bot`. Needs to be adapted:

- Rename role `deploy_bot_container` → `deploy_kvizgame_container`
- Rename role `discord-meow-bot-nginx` → `kvizgame-nginx`
- Remove bot-specific env vars from `tasks/docker.yml`
  (DB_*, DISCORD_TOKEN, Twitch, Spotify, YouTube, Telegram, etc.)
- Keep only kvizgame env vars:
  `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_PROXY_TARGET`,
  `KVIZGAME_PACKS_DIR`, `KVIZGAME_SESSIONS_DIR`, `KVIZGAME_FRONTEND_DIR`
- Update bind mounts:
  - `volumes/kvizgame/packs/` → `/tmp/kvizgame-packs`
  - `volumes/kvizgame/sessions/` → `/tmp/kvizgame-sessions`
- Update nginx template: `/kvizgame/` → kvizgame container (not bot container)
- Remove bot-specific inventory vars from `group_vars/all.yml`
- Add `GET /health` endpoint to `kvizgame/server.py` (Ansible polls it after deploy)

---

## Phase 1: Lobby UI — Core Features

All changes are in `frontend/src/kvizgame/screens/Lobby.tsx` and `kvizgame/server.py`
unless noted otherwise.

### 1.1 Pack upload in UI

**Why:** the bot command `/kvizgame upload` no longer exists; packs can only be
uploaded through the Activity UI.

**Backend** (`kvizgame/server.py`):
- Add `POST /packs` — multipart upload, saves `.siq` to `packs_dir`,
  validates with `parser.load()`, returns `{name, path}` on success.

**Frontend** (`Lobby.tsx`):
- File input button (`accept=".siq"`), upload progress indicator,
  refresh pack list on success, show error on invalid file.

---

### 1.2 Role selection

**Why:** currently the person who clicks "Start Game" is always the host,
and every other Activity participant is automatically a player.

**Roles:**
- **Host (Showman)** — reads questions, judges answers, controls game flow. Exactly 1.
- **Player** — plays the game, buzzes in, bids. Up to N (set by lobby creator).
- **Spectator** — watches in read-only mode. Unlimited.

**Frontend** (`Lobby.tsx`):
- Replace flat participant list with role-slot UI:
  host slot × 1, player slots × N, spectator section.
- Lobby creator assigns roles (or participants self-select — TBD).
- "Start Game" sends `player_ids`, `host_id`, `spectator_ids` to `POST /sessions`.

**Backend** (`kvizgame/session.py`, `kvizgame/server.py`):
- `POST /sessions` accepts optional `spectator_ids: list[str]`.
- `GameSession.connect()` allows spectators (not in `player_ids`) in read-only mode:
  they receive all broadcast events but cannot send game actions.

---

### 1.3 Player slot count

**Why:** lobby creator needs to set how many player seats exist before others join.

**Frontend only** — `maxPlayers` state (2–6), numeric stepper in Lobby.
Limits how many participants can claim the Player role.
`POST /sessions` already accepts arbitrary `player_ids`; no backend change needed.

---

### 1.4 Game rules

**Why:** SIGame has configurable per-session rules. `Settings` currently only
exposes `buzz_window_ms`.

**Backend** (`kvizgame/game.py` → `Settings` dataclass):

| Field | Type | Default | Description |
|---|---|---|---|
| `false_start_enabled` | `bool` | `True` | Buzz before question ends = wrong answer |
| `question_timer_ms` | `int` | `0` | Delay before buzz opens (0 = disabled) |
| `appeal_enabled` | `bool` | `True` | Allow players to appeal a wrong judgment |
| `partial_answer_allowed` | `bool` | `False` | Host can accept a partial answer |

- Add fields to `Settings`, update `to_dict` / `from_dict`.
- `POST /sessions` body: `settings` object replaces bare `buzz_window_ms`.

**Frontend** (`Lobby.tsx`):
- Collapsible "Rules" section with toggles and a slider for `question_timer_ms`.

---

## Phase 2: Gameplay improvements

- **Spectator view** — spectators see board and scores but no buzz button
- **Reconnect** — player rejoins mid-game and gets current state replayed
- **Pack preview** — show pack name, round count, author before starting

---

## Implementation order

1. `POST /packs` + upload UI — unblocks all testing without bot
2. Role selection UI + spectator support in `GameSession`
3. Player slot count stepper
4. Rules section in Lobby
