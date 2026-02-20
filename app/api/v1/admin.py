"""
Admin panel SSR routes.

Access: only users with is_admin=True.
CSRF: simple token-in-session approach for POST forms.
"""
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Request, Form, Depends, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.v1.pages import templates
from app.auth import hash_password
from app.infrastructure.db.models import User
from app.readmodels.admin_stats import (
    get_overview_stats,
    get_users_list,
    get_user_detail,
    get_user_activity_feed,
)

router = APIRouter(prefix="/admin", tags=["admin"])

MSK = timezone(timedelta(hours=3))


# ── Helpers ──────────────────────────────────────────────────────────────────

def _require_admin(request: Request, db: Session) -> User:
    """Return current user if admin, otherwise raise 403."""
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    return user


def _get_csrf_token(request: Request) -> str:
    """Get or create a CSRF token in the session."""
    token = request.session.get("_csrf")
    if not token:
        token = secrets.token_hex(32)
        request.session["_csrf"] = token
    return token


def _verify_csrf(request: Request, token: str) -> None:
    """Verify CSRF token matches session. Raises 403 on mismatch."""
    expected = request.session.get("_csrf")
    if not expected or not secrets.compare_digest(expected, token):
        raise HTTPException(status_code=403, detail="CSRF token invalid")


# ── Routes ───────────────────────────────────────────────────────────────────

@router.get("/overview", response_class=HTMLResponse)
def admin_overview(request: Request, db: Session = Depends(get_db)):
    admin_user = _require_admin(request, db)
    now_msk = datetime.now(MSK)
    stats = get_overview_stats(db, now_msk)
    return templates.TemplateResponse("admin/overview.html", {
        "request": request,
        "stats": stats,
        "admin_user": admin_user,
    })


@router.get("/users", response_class=HTMLResponse)
def admin_users(request: Request, db: Session = Depends(get_db)):
    admin_user = _require_admin(request, db)
    now_msk = datetime.now(MSK)
    users = get_users_list(db, now_msk)
    return templates.TemplateResponse("admin/users.html", {
        "request": request,
        "users": users,
        "admin_user": admin_user,
    })


@router.get("/users/new", response_class=HTMLResponse)
def admin_user_new_form(request: Request, db: Session = Depends(get_db)):
    admin_user = _require_admin(request, db)
    csrf_token = _get_csrf_token(request)
    return templates.TemplateResponse("admin/user_new.html", {
        "request": request,
        "csrf_token": csrf_token,
        "admin_user": admin_user,
    })


@router.post("/users/new", response_class=HTMLResponse)
def admin_user_create(
    request: Request,
    email: str = Form(...),
    password: str = Form(...),
    is_admin: str = Form(""),
    csrf_token: str = Form(...),
    db: Session = Depends(get_db),
):
    admin_user = _require_admin(request, db)
    _verify_csrf(request, csrf_token)

    email = email.strip().lower()
    if not email or "@" not in email:
        return templates.TemplateResponse("admin/user_new.html", {
            "request": request,
            "error": "Укажите корректный email",
            "csrf_token": _get_csrf_token(request),
            "admin_user": admin_user,
        })

    if len(password) < 6:
        return templates.TemplateResponse("admin/user_new.html", {
            "request": request,
            "error": "Пароль должен быть не менее 6 символов",
            "csrf_token": _get_csrf_token(request),
            "admin_user": admin_user,
        })

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        return templates.TemplateResponse("admin/user_new.html", {
            "request": request,
            "error": f"Пользователь {email} уже существует",
            "csrf_token": _get_csrf_token(request),
            "admin_user": admin_user,
        })

    new_user = User(
        email=email,
        password_hash=hash_password(password),
        is_admin=bool(is_admin),
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return RedirectResponse(f"/admin/users/{new_user.id}", status_code=302)


@router.get("/users/{user_id}", response_class=HTMLResponse)
def admin_user_detail(request: Request, user_id: int, db: Session = Depends(get_db)):
    admin_user = _require_admin(request, db)
    now_msk = datetime.now(MSK)
    detail = get_user_detail(db, user_id, now_msk)
    if not detail:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    feed = get_user_activity_feed(db, user_id, limit=50)

    return templates.TemplateResponse("admin/user_detail.html", {
        "request": request,
        "user": detail,
        "feed": feed,
        "admin_user": admin_user,
    })
