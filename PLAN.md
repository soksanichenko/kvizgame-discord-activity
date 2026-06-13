# KvizGame Discord Activity — Development Plan

## Status

Extracted from `discord-meow-bot` as a standalone application.
Game engine, SIQ parser, and React frontend are fully functional.
OAuth, Lobby, Board, Question, Final screens all work end-to-end on the dev host.

All game management moves to the Activity UI — no Discord bot commands.

---

## Phase 0: Bootstrap (one-time setup)

### Discord Developer Portal

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

### Deployment (Ansible / infra repo)

- Add a new container role for `kvizgame-discord-activity` (separate from the Discord bot)
- Bind mounts:
  - `volumes/kvizgame/packs/` → `/tmp/kvizgame-packs` (read-write, uploaded .siq files)
  - `volumes/kvizgame/sessions/` → `/tmp/kvizgame-sessions` (read-write, session state)
- nginx: proxy `/kvizgame/` → frontend, `/api/(token|sessions|media|ws)` → backend
- Health check: `GET /health` (add endpoint to `server.py`)

---

## Phase 1: Lobby UI — Core Features

All changes are in `frontend/src/kvizgame/screens/Lobby.tsx` and `kvizgame/server.py`
unless noted otherwise.

### 1. Pack upload in UI

**Why:** currently the only way to upload a `.siq` pack is via a Discord bot command
(`/kvizgame upload`), which no longer exists after the extraction.

**Backend** (`kvizgame/server.py`):
- Add `POST /packs` — multipart upload, saves `.siq` to `packs_dir`,
  validates with `parser.load()`, returns `{name, path}` on success.

**Frontend** (`Lobby.tsx`):
- File input button (`accept=".siq"`), upload progress indicator,
  refresh pack list on success, show error on invalid file.

---

### 2. Role selection

**Why:** currently the person who clicks "Start Game" is always the host,
and every other Discord Activity participant is automatically a player.
Need explicit role assignment.

**Roles:**
- **Host (Showman)** — reads questions, judges answers, controls game flow. Exactly 1.
- **Player** — plays the game, buzzes in, bids. Up to N (set by lobby creator).
- **Spectator** — watches in read-only mode. Unlimited.

**Frontend** (`Lobby.tsx`):
- Replace flat participant list with a role-slot UI:
  host slot × 1, player slots × N, spectator section.
- Lobby creator assigns roles (or participants self-select — TBD).
- "Start Game" sends `player_ids`, `host_id`, `spectator_ids` to `POST /sessions`.

**Backend** (`kvizgame/session.py`, `kvizgame/server.py`):
- `POST /sessions` accepts optional `spectator_ids: list[str]`.
- `GameSession.connect()` allows spectators (IDs not in `player_ids`) in read-only mode:
  they receive all broadcast events but cannot send game actions.

---

### 3. Player slot count

**Why:** the lobby creator needs to control how many player seats exist
before other participants join and claim roles.

**Frontend only** — tracked in Lobby state as `maxPlayers` (2–6).
- Numeric stepper in Lobby UI.
- Limits how many participants can be assigned the Player role.
- `POST /sessions` already accepts arbitrary `player_ids`; no backend change needed.

---

### 4. Game rules

**Why:** SIGame supports configurable rules per session. `Settings` currently
only exposes `buzz_window_ms`.

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

## Suggested implementation order

1. `POST /packs` endpoint + upload UI (unblocks all testing without bot)
2. Role selection UI + spectator support in `GameSession`
3. Player slot count stepper
4. Rules section in Lobby
