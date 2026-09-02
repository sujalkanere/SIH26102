"""Application settings (FR-API-001, Section 5.2 environment variables)."""
from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite:///./data/sentinel.db"
    jwt_secret_key: str = "dev-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 30
    refresh_token_days: int = 7
    cors_origins: str = "*"
    environment: str = "development"

    # Detection thresholds (FR-ADE-*), configurable by ROLE_ADMIN per FR-AAA-002.
    cost_overrun_threshold_pct: float = 15.0
    duplicate_text_similarity: float = 0.85
    zscore_threshold: float = 2.5

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()
