from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, PlainTextResponse
from fastapi.templating import Jinja2Templates

from app.db import check_db

app = FastAPI(title="FinLife")

templates = Jinja2Templates(directory="templates")

@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/health", response_class=PlainTextResponse)
def health():
    return "ok"

@app.get("/ready", response_class=PlainTextResponse)
def ready():
    check_db()
    return "ok"
