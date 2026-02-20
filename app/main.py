"""
FastAPI application factory
"""
import logging
import traceback

from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse, HTMLResponse
from starlette.middleware.sessions import SessionMiddleware

from app.config import get_settings
from app.infrastructure.db.session import check_db_connection
from app.api.v1 import auth, wallets, categories, transactions, pages, push, admin

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    """
    Application factory - создаёт и настраивает FastAPI приложение

    Returns:
        Настроенный FastAPI app
    """
    settings = get_settings()

    app = FastAPI(
        title="FinLife",
        debug=True,
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

    # Middleware
    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.SECRET_KEY
    )

    # Static files (themes.css, etc.)
    from fastapi.staticfiles import StaticFiles
    import os as _os
    _static_dir = _os.path.join(_os.path.dirname(_os.path.dirname(__file__)), "static")
    app.mount("/static", StaticFiles(directory=_static_dir), name="static")

    # Routers - API first, then SSR pages
    app.include_router(wallets.router)
    app.include_router(categories.router)
    app.include_router(transactions.router)
    app.include_router(auth.router)
    app.include_router(push.router)
    app.include_router(admin.router)
    app.include_router(pages.router)  # SSR pages (/, /wallets, /transactions)

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
