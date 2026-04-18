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
    DATABASE_URL: str

    # Security
    SECRET_KEY: str

    # Application
    TIMEZONE: str = "Europe/Moscow"
    DEBUG: bool = False
    DISABLE_NOTIFICATIONS: bool = False  # Set True on test environments to skip all push/telegram/email

    # Analytics (Microsoft Clarity)
    CLARITY_PROJECT_ID: str = ""
    CLARITY_ENABLED: bool = False

    # Web Push (VAPID)
    VAPID_PUBLIC_KEY: str = ""
    VAPID_PRIVATE_KEY: str = ""
    VAPID_MAILTO: str = "mailto:admin@finlife.app"

    # Telegram Bot (for notification delivery)
    TELEGRAM_BOT_TOKEN: str = ""

    # Email (SMTP stub — configure to activate)
    EMAIL_SMTP_HOST: str = ""
    EMAIL_SMTP_PORT: int = 587
    EMAIL_SMTP_USER: str = ""
    EMAIL_SMTP_PASSWORD: str = ""

    # File uploads
    UPLOADS_DIR: str = "uploads"

    # Supabase Auth
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""

    # AI commentary for weekly digest
    # Set OPENAI_API_KEY to enable automatic AI commentary on digests (uses gpt-4o-mini)
    # OPENAI_BASE_URL defaults to AITunnel (OpenAI-compatible proxy, reachable from RU).
    # Override to "https://api.openai.com/v1/" to use OpenAI directly.
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"
    OPENAI_BASE_URL: str = "https://api.aitunnel.ru/v1/"
    # Future-proof: Anthropic key placeholder (not used yet)
    ANTHROPIC_API_KEY: str = ""

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
