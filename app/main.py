"""
FastAPI application factory
"""
import logging
import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse, HTMLResponse, FileResponse
from starlette.middleware.sessions import SessionMiddleware

from app.config import get_settings
from app.infrastructure.db.session import check_db_connection
from app.api.v1 import auth, wallets, categories, transactions, pages, push, admin
from app.api.v2 import router as v2_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app):
    from app.application.scheduler import start_scheduler, shutdown_scheduler
    start_scheduler()
    yield
    shutdown_scheduler()


def create_app() -> FastAPI:
    """
    Application factory - создаёт и настраивает FastAPI приложение

    Returns:
        Настроенный FastAPI app
    """
    settings = get_settings()

    if "finlife_password_change_me" in settings.DATABASE_URL or settings.SECRET_KEY == "super-secret-key-change-me":
        raise RuntimeError(
            "FATAL: DATABASE_URL or SECRET_KEY is using a known insecure default. "
            "Set both in .env before starting."
        )

    app = FastAPI(
        title="FinLife",
        debug=True,
        lifespan=lifespan,
    )

    # Error-logging middleware — catches ALL exceptions including sync routes
    from starlette.middleware.base import BaseHTTPMiddleware
    from starlette.responses import Response

    class ErrorLoggingMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request, call_next):
            try:
                response = await call_next(request)
                return response
            except Exception as exc:
                tb_str = traceback.format_exc()
                logger.error(f"\n{'='*60}\nERROR on {request.method} {request.url.path}\n{tb_str}{'='*60}")
                return Response(content=f"Internal Server Error: {exc}", status_code=500)

    app.add_middleware(ErrorLoggingMiddleware)

    # CORS — allow Next.js frontend in development (localhost:3000)
    # In production, replace with the actual frontend origin.
    from fastapi.middleware.cors import CORSMiddleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ],
        allow_credentials=True,   # required for session cookie
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Session middleware (must come after CORS)
    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.SECRET_KEY
    )

    # Static files (themes.css, etc.)
    from fastapi.staticfiles import StaticFiles
    import os as _os
    _static_dir = _os.path.join(_os.path.dirname(_os.path.dirname(__file__)), "static")
    app.mount("/static", StaticFiles(directory=_static_dir), name="static")

    # Ensure uploads directory exists (files served via authenticated endpoint, not static mount)
    import pathlib as _pathlib
    _project_root = _pathlib.Path(_os.path.dirname(_os.path.dirname(__file__)))
    _uploads_dir = _pathlib.Path(settings.UPLOADS_DIR)
    if not _uploads_dir.is_absolute():
        _uploads_dir = _project_root / _uploads_dir
    try:
        _uploads_dir.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass

    # Routers - v2 JSON API, then v1 API, then SSR pages
    app.include_router(v2_router)
    app.include_router(wallets.router)
    app.include_router(categories.router)
    app.include_router(transactions.router)
    app.include_router(auth.router)
    app.include_router(push.router)
    app.include_router(admin.router)
    app.include_router(pages.router)  # SSR pages (/, /wallets, /transactions)

    # Service Worker — must be served from root for scope="/"
    _sw_path = _os.path.join(_static_dir, "js", "service-worker.js")

    @app.get("/service-worker.js", include_in_schema=False)
    def service_worker():
        return FileResponse(
            _sw_path,
            media_type="application/javascript",
            headers={"Cache-Control": "no-cache", "Service-Worker-Allowed": "/"},
        )

    # Health checks
    @app.get("/health", response_class=PlainTextResponse, tags=["system"])
    def health():
        """Health check endpoint"""
        return "ok"

    @app.get("/ready", response_class=PlainTextResponse, tags=["system"])
    def ready():
        """Readiness check endpoint (проверяет доступность БД)"""
        check_db_connection()
        return "ok"

    return app


# Create app instance
app = create_app()


if __name__ == "__main__":
    import uvicorn
    # Запуск на 127.0.0.1 (localhost) — открывать в браузере: http://127.0.0.1:8000/
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
    )
