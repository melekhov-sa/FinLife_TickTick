"""
Admin endpoints for managing application-level configuration via the UI.

Currently supports: OpenAI API key (stored in app_config table).
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.infrastructure.db.session import get_db
from app.api.v2.deps import get_current_user
from app.infrastructure.db.models import User
from app.application.app_config import get_config, set_openai_key, get_openai_key, OPENAI_KEY
from app.infrastructure.crypto import decrypt
from app.config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


# ── Helpers ──────────────────────────────────────────────────────────────────

def _require_admin(request: Request, db: Session) -> User:
    user: User = get_current_user(request, db)
    if not user or not user.is_admin:
        raise HTTPException(403, "Admin access required")
    return user


def _mask_key(key: str) -> str:
    """Return a masked version of the key: first 7 chars + **** + last 4."""
    if len(key) <= 11:
        prefix = key[:3] if len(key) >= 3 else key
        suffix = key[-2:] if len(key) >= 2 else ""
        return f"{prefix}-****{suffix}"
    return f"{key[:7]}-****{key[-4:]}"


def _get_source(db: Session) -> tuple[str | None, str]:
    """Return (raw_key, source) where source is 'db'|'env'|'none'.

    If the DB row exists but decrypt fails (rotated SECRET_KEY or corrupted
    ciphertext), we fall through to env instead of returning garbled ciphertext.
    """
    db_val = get_config(db, OPENAI_KEY)
    if db_val:
        plain = decrypt(db_val)
        if plain:
            return plain, "db"
        logger.warning("openai_api_key decrypt failed — falling back to env")
    env_val = get_settings().OPENAI_API_KEY
    if env_val:
        return env_val, "env"
    return None, "none"


# ── Response schemas ─────────────────────────────────────────────────────────

class OpenAIConfigResponse(BaseModel):
    has_key: bool
    source: str  # 'db' | 'env' | 'none'
    masked: str | None


class PatchOpenAIKeyRequest(BaseModel):
    api_key: str  # empty string = clear DB value


class TestConnectionResponse(BaseModel):
    ok: bool
    error: str | None = None
    model_used: str | None = None


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/openai-config", response_model=OpenAIConfigResponse)
def get_openai_config(request: Request, db: Session = Depends(get_db)):
    _require_admin(request, db)
    raw, source = _get_source(db)
    return OpenAIConfigResponse(
        has_key=raw is not None,
        source=source,
        masked=_mask_key(raw) if raw else None,
    )


@router.patch("/openai-config", response_model=OpenAIConfigResponse)
def update_openai_config(
    body: PatchOpenAIKeyRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    _require_admin(request, db)
    # Empty string = clear DB entry (falls back to .env)
    new_val = body.api_key.strip() if body.api_key else None
    set_openai_key(db, new_val if new_val else None)
    raw, source = _get_source(db)
    return OpenAIConfigResponse(
        has_key=raw is not None,
        source=source,
        masked=_mask_key(raw) if raw else None,
    )


@router.post("/openai-config/test", response_model=TestConnectionResponse)
def test_openai_connection(request: Request, db: Session = Depends(get_db)):
    _require_admin(request, db)
    key = get_openai_key(db)
    if not key:
        return TestConnectionResponse(ok=False, error="Ключ OpenAI не настроен")

    from app.infrastructure.ai import ping
    result = ping(key)
    return TestConnectionResponse(
        ok=result["ok"],
        error=result.get("error"),
        model_used=result.get("model"),
    )
