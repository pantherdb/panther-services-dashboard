"""Settings, from the environment. The CLI sets them from its options before the app starts."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PSD_")

    logs_dir: Path | None = None
    """A folder of exported logs, read at start and on reload. Unset: uploads and the sample only."""
    load_sample: bool = False
    """Load the sample day at start, for a demo."""
