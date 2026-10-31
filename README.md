# kvizgame-discord-activity

KvizGame — a Discord Activity for SIGame-style quizzes. Players join from a voice channel, the host loads a `.siq` question pack, and the game (board, questions, final round, scores) runs in real time inside Discord.

## How it works

- **Backend** (`sources/backend/`) — an `aiohttp` server. Game state lives in a `GameSession` per Discord channel; clients talk to it over a WebSocket (`/ws/{channel_id}`). Active sessions are persisted as JSON files and restored on startup; finished games are removed.
- **Frontend** (`sources/frontend/`) — React 19 + TypeScript + Vite, built on the Discord Embedded App SDK. Screens: lobby, board, question, final round (bid, question, judging), scores, score correction, plus pause and appeal overlays.
- **Question packs** — `.siq` files: a ZIP archive with `content.xml` and optional `Images/`, `Audio/`, `Video/` folders. Packs are uploaded through the Activity (large files in chunks) and stored on disk.

HTTP endpoints: `GET /health`, `POST /token` (Discord OAuth code exchange), `GET`/`POST /packs`, `POST /packs/chunk`, `GET /sessions/{channel_id}`, `POST /sessions`, `GET /media/packs/{pack_stem}/{folder}/{filename}`.

## Configuration

Environment variables (see `sources/backend/config.py`):

| Variable | Default | Description |
|---|---|---|
| `DISCORD_CLIENT_ID` | _(empty)_ | Discord application client ID |
| `DISCORD_CLIENT_SECRET` | _(empty)_ | Discord application client secret |
| `DISCORD_PROXY_TARGET` | _(empty)_ | Hostname the Discord proxy points at |
| `KVIZGAME_PORT` | `8082` | Port the server listens on |
| `KVIZGAME_PACKS_DIR` | `/tmp/kvizgame-packs` | Where uploaded `.siq` packs are stored |
| `KVIZGAME_SESSIONS_DIR` | `/tmp/kvizgame-sessions` | Where session state is persisted |
| `KVIZGAME_FRONTEND_DIR` | _(empty)_ | Built frontend (`dist`) to serve; leave empty to serve no frontend |

The Discord application itself (Activities URL mapping, OAuth2 credentials) is set up in the Discord Developer Portal; `PLAN.md` describes the steps.

## Development

```bash
pip install -r requirements.txt
python -m pytest tests/ -q

# Frontend
npm ci --prefix sources/frontend
npm run dev --prefix sources/frontend      # Vite dev server
npm run build --prefix sources/frontend    # tsc + vite build -> sources/frontend/dist

# Backend (serving the built frontend)
PYTHONPATH=sources KVIZGAME_FRONTEND_DIR=sources/frontend/dist python main.py
```

`PLAN.md` holds the roadmap.

## Docker image

The `Dockerfile` has three stages: the frontend is built with Node 22, the Python virtualenv is built on AlmaLinux 10, and the runtime image combines both. The container runs `main.py` and serves the built frontend itself.

## Deployment

The container is deployed to `zelgray.work` with Ansible (`ansible/`):

- `deploy_kvizgame_container` — creates the packs and sessions volume directories, runs the `kvizgame` container from `ghcr.io/soksanichenko/kvizgame-discord-activity`, and waits for `/health`.
- `kvizgame-nginx` — adds the `/kvizgame` locations to the shared nginx. The Discord proxy prepends the Activity root path to asset requests, so the config also handles the doubled `/kvizgame/kvizgame/assets/...` paths.

Ways to deploy:

- **GitHub Actions** — run the `Build` workflow (publishes the image to GHCR as `latest` and the commit SHA), then the `Deploy` workflow (runs the playbook).
- **`./deploy.sh`** — builds the image locally, pushes it to GHCR, and runs the playbook. With `--local` the image is sent straight to the host over SSH instead; `-i <inventory>` selects another inventory (default `inventories/zelgray.work`).

```bash
./install_dependencies.sh
./deploy.sh            # or: ./deploy.sh --local
```

Requires env: `INFISICAL_API_URL`, `INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET`. The Discord credentials come from Infisical (`kvizgame-client-id`, `kvizgame-client-secret`).

## License

[MIT](https://opensource.org/licenses/MIT)
