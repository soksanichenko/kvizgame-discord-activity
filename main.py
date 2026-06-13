"""KvizGame Discord Activity — standalone entry point."""

import logging
import pathlib

from aiohttp import web

from kvizgame.config import config
from kvizgame.server import create_app
from kvizgame.session import GameSession

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s: %(message)s')
logger = logging.getLogger('kvizgame')


def _load_sessions(sessions: dict[str, GameSession]) -> None:
    """Restore persisted game sessions from disk on startup."""
    sessions_dir = pathlib.Path(config.kvizgame_sessions_dir)
    if not sessions_dir.exists():
        return
    for path in sessions_dir.glob('*.json'):
        try:
            session = GameSession.load(path)
            if session.phase.name == 'GAME_OVER':
                path.unlink(missing_ok=True)
                continue
            sessions[session.channel_id] = session
            logger.info('Restored session for channel %r', session.channel_id)
        except Exception as exc:
            logger.warning('Failed to restore session from %s: %s', path, exc)
            path.unlink(missing_ok=True)


if __name__ == '__main__':
    sessions: dict[str, GameSession] = {}
    _load_sessions(sessions)
    app = create_app(sessions)
    web.run_app(app, host='0.0.0.0', port=config.kvizgame_port)
