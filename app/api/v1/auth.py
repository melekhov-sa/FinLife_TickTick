"""
Authentication routes (login, logout)
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Request, Form, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_user
from app.auth import verify_password, get_user_by_email
from app.api.v1.pages import templates
from app.infrastructure.eventlog.repository import EventLogRepository


router = APIRouter(tags=["auth"])


@router.get("/login", response_class=HTMLResponse)
def login_get(request: Request):
    """
    Форма входа
    """
    return templates.TemplateResponse("login.html", {"request": request})


@router.post("/login", response_class=HTMLResponse)
def login_post(
    request: Request,
    email: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db),
):
    """
    Обработка формы входа
    """
    user = get_user_by_email(db, email)

    if not user:
        return templates.TemplateResponse(
            "login.html",
            {"request": request, "error": "Неверный email или пароль"},
        )

    if not verify_password(password, user.password_hash):
        return templates.TemplateResponse(
            "login.html",
            {"request": request, "error": "Неверный email или пароль"},
        )

    request.session["user_id"] = user.id
    request.session["is_admin"] = user.is_admin
    # Restore saved theme (fallback to default if not set)
    request.session["user_theme"] = user.theme or "graphite-emerald-light"
    # Restore budget view preferences if saved
    if user.budget_grain:
        request.session["budget_grain"] = user.budget_grain
    if user.budget_range_count is not None:
        request.session["budget_range_count"] = user.budget_range_count

    # Track login: update last_seen_at + write event
    MSK = timezone(timedelta(hours=3))
    now_msk = datetime.now(MSK)
    user.last_seen_at = now_msk
    EventLogRepository(db).append_event(
        account_id=user.id,
        event_type="user_logged_in",
        payload={"email": user.email},
        occurred_at=now_msk,
        actor_user_id=user.id,
    )
    db.commit()

    return RedirectResponse("/", status_code=302)


@router.get("/logout")
def logout(request: Request):
    """
    Выход из системы
    """
    request.session.clear()
    return RedirectResponse("/login", status_code=302)
