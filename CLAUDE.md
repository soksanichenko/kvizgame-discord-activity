# CLAUDE.md — kvizgame-discord-activity

## What this project is

KvizGame is a Discord Activity for SIGame-style quizzes: an `aiohttp` + WebSocket backend and a React 19 / TypeScript / Vite frontend built on the Discord Embedded App SDK. It was extracted from `discord-meow-bot` into a standalone app. Deployed to `zelgray.work` as a Docker container behind the shared nginx, served under `/kvizgame`.

## Project structure

```
kvizgame-discord-activity/
├── main.py                    # Entry point: restores sessions from disk, runs the aiohttp app
├── sources/
│   ├── backend/
│   │   ├── config.py          # pydantic-settings Config (env vars)
│   │   ├── server.py          # Routes + WebSocket handler (/ws/{channel_id})
│   │   ├── session.py         # GameSession: state machine, persistence (JSON)
│   │   ├── game.py            # Game logic
│   │   ├── parser.py          # .siq pack parser (ZIP: content.xml + Images/Audio/Video)
│   │   └── protocol.py        # WebSocket message types
│   ├── frontend/              # React + Vite app (src/kvizgame/{App,useGame,discord}.ts(x), screens/)
│   └── requirements.txt       # Runtime Python deps
├── tests/                     # pytest (test_game.py, test_parser.py)
├── ansible/                   # Deploy to zelgray.work (and a home-server inventory)
│   ├── inventories/{zelgray.work,home-server}/
│   ├── playbooks/{deploy.yml,pre_tasks/infisical.yml}
│   └── roles/
│       ├── deploy_kvizgame_container/   # volumes, container, /health wait
│       └── kvizgame-nginx/              # nginx location config
├── Dockerfile                 # 3 stages: frontend build (node), venv (almalinux), runtime
├── deploy.sh                  # build + push to GHCR (or --local ssh transfer) + run playbook
├── PLAN.md                    # Roadmap / phases
├── requirements.txt           # Dev deps: -r sources/requirements.txt + pytest
├── requirements.yml           # Ansible collections
└── .github/workflows/         # test, lint, build, deploy, security-scan, codeql, yamllint, ansible-lint, hadolint, shellcheck
```

## How to run

```bash
pip install -r requirements.txt
python -m pytest tests/ -q                          # pythonpath = sources (pyproject.toml)

npm ci --prefix sources/frontend
npm run build --prefix sources/frontend             # tsc + vite build -> sources/frontend/dist
PYTHONPATH=sources KVIZGAME_FRONTEND_DIR=sources/frontend/dist python main.py
```

Config comes from environment variables (`DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_PROXY_TARGET`, `KVIZGAME_PORT` = 8082, `KVIZGAME_PACKS_DIR`, `KVIZGAME_SESSIONS_DIR`, `KVIZGAME_FRONTEND_DIR`); defaults are in `sources/backend/config.py`.

## Conventions

- Python code uses double quotes and a line length of 100 (`ruff`, `target-version = py312`, see `pyproject.toml`); match the existing style here rather than the single-quote default used in other repos.
- Tests use `pytest-asyncio` in auto mode.
- Active sessions are persisted as `<channel_id>.json` in `KVIZGAME_SESSIONS_DIR` and restored on startup; sessions in `GAME_OVER` are deleted instead of restored.

## Deployment (Ansible)

This repo does **not** follow the build-on-server pattern of the other service repos: the image is built in CI or by `deploy.sh`, pushed to `ghcr.io/soksanichenko/kvizgame-discord-activity`, and the role pulls it (`kvizgame_image_tag`, `kvizgame_image_pull`).

```bash
./install_dependencies.sh
./deploy.sh                    # build, push to GHCR, run the playbook
./deploy.sh --local            # send the image over SSH instead of pushing
./deploy.sh -i inventories/home-server
```

The `Build` and `Deploy` GitHub workflows (manual `workflow_dispatch`) do the same in CI. Requires env: `INFISICAL_API_URL`, `INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET`.

`deploy.sh` passes `EXTRA_VARS` unquoted on purpose (it holds several `-e key=value` words); keep the `shellcheck disable=SC2086` directive there.

## nginx

The Discord proxy prepends the Activity root URL path (`/kvizgame`) to asset requests, so assets arrive as `/kvizgame/kvizgame/assets/...`. `kvizgame-nginx` has regex locations that rewrite these and force the correct MIME type; don't simplify them into a single prefix location.
