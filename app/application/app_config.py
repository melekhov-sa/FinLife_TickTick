"""
Admin-managed application configuration stored in the app_config table.

Provides a simple key-value store with fallback to environment variables.
"""
import logging

from sqlalchemy.orm import Session

from app.infrastructure.db.models import AppConfigModel
from app.infrastructure.crypto import encrypt, decrypt

OPENAI_KEY = "openai_api_key"

logger = logging.getLogger(__name__)


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


def set_openai_key(db: Session, plaintext: str | None) -> None:
    """Upsert the OpenAI API key, encrypting before storing."""
    if plaintext:
        value = encrypt(plaintext)
    else:
        value = None
    set_config(db, OPENAI_KEY, value)


def get_openai_key(db: Session) -> str | None:
    """Return the OpenAI API key: DB value first (auto-decrypted), then .env fallback."""
    db_val = get_config(db, OPENAI_KEY)
    if db_val:
        try:
            plain = decrypt(db_val)
            if plain:
                return plain
        except Exception:
            logger.warning("Failed to decrypt openai_api_key — falling back to env")
    from app.config import get_settings
    env_val = get_settings().OPENAI_API_KEY
    return env_val if env_val else None
