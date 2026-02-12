from fastapi import FastAPI, Request, Form, Depends
from fastapi.responses import HTMLResponse, RedirectResponse, PlainTextResponse
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware
from sqlalchemy.orm import Session

from app.db import check_db
from app.db_sa import SessionLocal
from app.auth import verify_password, get_user_by_email
from app.models import User

app = FastAPI(title="FinLife")

app.add_middleware(SessionMiddleware, secret_key="super-secret-key-change-me")

templates = Jinja2Templates(directory="templates")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def require_user(request: Request):
    if not request.session.get("user_id"):
        return False
    return True


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/login", response_class=HTMLResponse)
def login_get(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})


@app.post("/login", response_class=HTMLResponse)
def login_post(
    request: Request,
    email: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db),
):
    user = get_user_by_email(db, email)

    if not user or not verify_password(password, user.password_hash):
        return templates.TemplateResponse(
            "login.html",
            {"request": request, "error": "Неверный email или пароль"},
        )

    request.session["user_id"] = user.id
    return RedirectResponse("/", status_code=302)


@app.get("/logout")
def logout(request: Request):
    request.session.clear()
    return RedirectResponse("/login", status_code=302)


@app.get("/health", response_class=PlainTextResponse)
def health():
    return "ok"


@app.get("/ready", response_class=PlainTextResponse)
def ready():
    check_db()
    return "ok"
