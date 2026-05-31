"""Application settings, read from environment variables."""

import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


class Settings:
    """Typed-ish access to configuration. Never hardcode secrets here."""

    def __init__(self) -> None:
        self.app_name: str = "AI Share Market Analysis Tool — AI Engine"
        self.version: str = "0.1.0"
        self.port: int = int(os.getenv("AI_ENGINE_PORT", "8000"))
        self.ai_provider: str = os.getenv("AI_PROVIDER", "mock")
        self.cors_origins: list[str] = [
            origin.strip()
            for origin in os.getenv(
                "AI_CORS_ORIGINS", "http://localhost:3000,http://localhost:4000"
            ).split(",")
            if origin.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance."""
    return Settings()
