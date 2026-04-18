"""
Shared dependencies for v2 API routes.
Auth via Supabase JWT (Bearer token in Authorization header).
"""
import time
import hashlib
import threading
import base64
import json

from fastapi import HTTPException, Request, Depends
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.infrastructure.db.models import User
from app.infrastructure.supabase_client import get_supabase
from app.api.deps import get_db

_TOKEN_CACHE: dict[str, tuple[str, float]] = {}  # sha256(token) -> (email, expires_at)
_CACHE_LOCK = threading.Lock()
_CACHE_TTL_SEC = 60


def _decode_jwt_exp(token: str) -> float | None:
    """Read JWT exp claim without verifying signature. None on any error."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        payload = parts[1] + "=" * (-len(parts[1]) % 4)  # pad for urlsafe_b64
        data = json.loads(base64.urlsafe_b64decode(payload))
        exp = data.get("exp")
        return float(exp) if exp is not None else None
    except Exception:
        return None


def _cache_sweep_expired():
    now = time.time()
    expired = [k for k, (_email, exp) in _TOKEN_CACHE.items() if exp < now]
    for k in expired:
        _TOKEN_CACHE.pop(k, None)


def _get_token(request: Request) -> str:
    """Extract Bearer token from Authorization header."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    return auth[7:]


def _get_email_from_token_uncached(token: str) -> str:
    """Validate Supabase JWT and return the user's email."""
    try:
        response = get_supabase().auth.get_user(token)
        return response.user.email
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def _get_email_from_token(token: str) -> str:
    """Validate Supabase JWT and return the user's email, using a TTL cache."""
    key = hashlib.sha256(token.encode()).hexdigest()
    now = time.time()
    with _CACHE_LOCK:
        cached = _TOKEN_CACHE.get(key)
        if cached and cached[1] > now:
            return cached[0]
    # miss: hit Supabase
    email = _get_email_from_token_uncached(token)
    jwt_exp = _decode_jwt_exp(token)
    default_exp = now + _CACHE_TTL_SEC
    expires_at = min(default_exp, jwt_exp) if jwt_exp else default_exp
    with _CACHE_LOCK:
        _cache_sweep_expired()
        _TOKEN_CACHE[key] = (email, expires_at)
    return email


def _get_or_create_user(email: str, db: Session) -> User:
    """Return existing local user or create one on first login.
    Race-safe: if concurrent insert hits unique constraint, re-query."""
    user = db.query(User).filter(User.email == email).first()
    if user:
        return user
    try:
        user = User(email=email)
        db.add(user)
        db.flush()
        return user
    except IntegrityError:
        db.rollback()
        user = db.query(User).filter(User.email == email).first()
        if not user:
            raise HTTPException(status_code=500, detail="User creation failed")
        return user


def get_user_id(request: Request, db: Session = Depends(get_db)) -> int:
    """Validate JWT and return local user_id."""
    email = _get_email_from_token(_get_token(request))
    return _get_or_create_user(email, db).id


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Validate JWT and return User ORM object."""
    email = _get_email_from_token(_get_token(request))
    return _get_or_create_user(email, db)
