"""
Shared dependencies for v2 API routes.
Auth via Supabase JWT (Bearer token in Authorization header).
"""
from fastapi import HTTPException, Request, Depends
from sqlalchemy.orm import Session

from app.infrastructure.db.models import User
from app.infrastructure.supabase_client import get_supabase
from app.api.deps import get_db


def _get_token(request: Request) -> str:
    """Extract Bearer token from Authorization header."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    return auth[7:]


def _get_email_from_token(token: str) -> str:
    """Validate Supabase JWT and return the user's email."""
    try:
        response = get_supabase().auth.get_user(token)
        return response.user.email
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def _get_or_create_user(email: str, db: Session) -> User:
    """Return existing local user or create one on first login."""
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(email=email)
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def get_user_id(request: Request, db: Session = Depends(get_db)) -> int:
    """Validate JWT and return local user_id."""
    email = _get_email_from_token(_get_token(request))
    return _get_or_create_user(email, db).id


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Validate JWT and return User ORM object."""
    email = _get_email_from_token(_get_token(request))
    return _get_or_create_user(email, db)
