"""
Shared dependencies for v2 API routes.
"""
from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.infrastructure.db.models import User


def get_user_id(request: Request) -> int:
    """Extract user_id from session or raise 401."""
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return int(user_id)


def get_current_user(request: Request, db: Session) -> User:
    """Return User ORM object or raise 401."""
    user_id = get_user_id(request)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user
