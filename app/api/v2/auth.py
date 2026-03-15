"""
JSON auth endpoints for Next.js frontend.
Returns JSON instead of redirects so session cookies are forwarded correctly.
"""
from fastapi import APIRouter, Request, Form, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.auth import verify_password, get_user_by_email

router = APIRouter(tags=["auth-v2"])


@router.post("/auth/login")
def api_login(
    request: Request,
    email: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db),
):
    user = get_user_by_email(db, email)

    if not user or not verify_password(password, user.password_hash):
        return JSONResponse({"ok": False, "error": "Неверный email или пароль"}, status_code=401)

    request.session["user_id"] = user.id
    request.session["is_admin"] = user.is_admin
    request.session["user_theme"] = user.theme or "graphite-emerald-light"
    if user.budget_grain:
        request.session["budget_grain"] = user.budget_grain
    if user.budget_range_count is not None:
        request.session["budget_range_count"] = user.budget_range_count

    return JSONResponse({"ok": True})


@router.post("/auth/logout")
def api_logout(request: Request):
    request.session.clear()
    return JSONResponse({"ok": True})
