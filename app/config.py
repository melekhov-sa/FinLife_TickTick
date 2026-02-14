"""
Application configuration using Pydantic Settings
"""
import os
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables
    """
    # Database
    DATABASE_URL: str = "postgresql://finlife:finlife_password_change_me@localhost:5432/finlife"

    # Security
    SECRET_KEY: str = "super-secret-key-change-me"  # ВАЖНО: Заменить в продакшене!

    # Application
    TIMEZONE: str = "Europe/Moscow"
    DEBUG: bool = False

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",  # Игнорировать дополнительные поля из переменных окружения
    )

    def get_sqlalchemy_url(self) -> str:
        """
        Convert DATABASE_URL to SQLAlchemy format (postgresql+psycopg://)
        """
        url = self.DATABASE_URL
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+psycopg://", 1)
        return url


@lru_cache
def get_settings() -> Settings:
    """
    Cached settings instance (singleton)
    """
    return Settings()
