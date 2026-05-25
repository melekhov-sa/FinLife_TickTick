"""Basic Auth for CalDAV endpoints — separate from Supabase JWT."""
import base64
import secrets

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.infrastructure.db.models import CalDAVTokenModel, User


def _require_basic(request: Request) -> tuple[str, str]:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Basic "):
        raise HTTPException(
            status_code=401,
            headers={"WWW-Authenticate": 'Basic realm="FinLife CalDAV"'},
            detail="Authentication required",
        )
    try:
        decoded = base64.b64decode(auth[6:]).decode("utf-8", errors="replace")
        username, password = decoded.split(":", 1)
        return username, password
    except Exception:
        raise HTTPException(status_code=400, detail="Malformed Authorization header")


def authenticate_caldav(request: Request, db: Session) -> User:
    """Verify Basic Auth credentials and return the matching User."""
    username, password = _require_basic(request)
    user = db.query(User).filter(User.email == username).first()
    if not user:
        raise HTTPException(
            status_code=401,
            headers={"WWW-Authenticate": 'Basic realm="FinLife CalDAV"'},
            detail="Invalid credentials",
        )
    token_row = (
        db.query(CalDAVTokenModel)
        .filter(
            CalDAVTokenModel.account_id == user.id,
            CalDAVTokenModel.token == password,
            CalDAVTokenModel.enabled.is_(True),
        )
        .first()
    )
    if not token_row:
        raise HTTPException(
            status_code=401,
            headers={"WWW-Authenticate": 'Basic realm="FinLife CalDAV"'},
            detail="Invalid credentials",
        )
    return user


def generate_token() -> str:
    return secrets.token_urlsafe(32)
