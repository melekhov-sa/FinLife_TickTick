"""
Authentication routes (login, logout)
"""
from pathlib import Path
from fastapi import APIRouter, Request, Form, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_user
from app.auth import verify_password, get_user_by_email


router = APIRouter(tags=["auth"])
# Используем абсолютный путь к директории шаблонов относительно корня проекта
templates_dir = Path(__file__).parent.parent.parent.parent / "templates"
templates = Jinja2Templates(directory=str(templates_dir))


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
    # Restore saved theme (fallback to default if not set)
    request.session["user_theme"] = user.theme or "graphite-emerald-light"
    return RedirectResponse("/", status_code=302)


@router.get("/logout")
def logout(request: Request):
    """
    Выход из системы
    """
    request.session.clear()
    return RedirectResponse("/login", status_code=302)
