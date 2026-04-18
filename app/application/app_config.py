"""
Admin-managed application configuration stored in the app_config table.

Provides a simple key-value store with fallback to environment variables.
"""
from sqlalchemy.orm import Session

from app.infrastructure.db.models import AppConfigModel

OPENAI_KEY = "openai_api_key"


def get_config(db: Session, key: str) -> str | None:
    """Retrieve a config value by key. Returns None if not set."""
    row = db.query(AppConfigModel).filter(AppConfigModel.key == key).first()
    return row.value if row else None


def set_config(db: Session, key: str, value: str | None) -> None:
    """Upsert a config value. Pass None or empty string to clear."""
    row = db.query(AppConfigModel).filter(AppConfigModel.key == key).first()
    if row:
        row.value = value if value else None
    else:
        row = AppConfigModel(key=key, value=value if value else None)
        db.add(row)
    db.commit()


def get_openai_key(db: Session) -> str | None:
    """Return the OpenAI API key: DB value first, then .env fallback."""
    db_val = get_config(db, OPENAI_KEY)
    if db_val:
        return db_val
    from app.config import get_settings
    env_val = get_settings().OPENAI_API_KEY
    return env_val if env_val else None
