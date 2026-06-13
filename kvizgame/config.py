"""KvizGame configuration loaded from environment variables."""

from pydantic_settings import BaseSettings


class Config(BaseSettings):
    """Application configuration.

    Attributes:
        discord_client_id: Discord application client ID.
        discord_client_secret: Discord application client secret.
        discord_proxy_target: Hostname used as the Discord proxy target (e.g. example.com).
        kvizgame_port: Port the aiohttp server listens on.
        kvizgame_packs_dir: Directory where uploaded .siq packs are stored.
        kvizgame_sessions_dir: Directory where active session state is persisted.
        kvizgame_frontend_dir: Path to the built frontend dist directory.
            Leave empty to disable frontend serving (e.g. when nginx serves it).
    """

    discord_client_id: str = ''
    discord_client_secret: str = ''
    discord_proxy_target: str = ''
    kvizgame_port: int = 8082
    kvizgame_packs_dir: str = '/tmp/kvizgame-packs'
    kvizgame_sessions_dir: str = '/tmp/kvizgame-sessions'
    kvizgame_frontend_dir: str = ''


config = Config()
