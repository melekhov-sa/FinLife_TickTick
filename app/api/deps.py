"""
FastAPI dependencies (DB session, authentication)
"""
from fastapi import Request, HTTPException, status
from sqlalchemy.orm import Session

from app.infrastructure.db.session import get_db as _get_db
from app.infrastructure.db.models import User


# Re-export get_db для удобства
get_db = _get_db


def require_user(request: Request) -> bool:
    """
    Проверка аутентификации через session

    Returns:
        True если пользователь залогинен
        False если не залогинен

    Usage в routes:
        if not require_user(request):
            return RedirectResponse("/login")
    """
    return bool(request.session.get("user_id"))


def get_current_user(request: Request, db: Session) -> User:
    """
    Получить текущего пользователя из session (для API endpoints)

    Raises:
        HTTPException(401): если не залогинен

    Usage:
        @router.get("/profile")
        def get_profile(user: User = Depends(get_current_user)):
            ...
    """
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )

    return user
