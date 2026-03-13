"""
API v2 — JSON-first endpoints for the Next.js frontend.

Coexists with SSR pages (app/api/v1/pages.py) which remain unchanged.
Auth: same session cookie as SSR (credentials: 'include' from frontend).
"""
from fastapi import APIRouter

from . import me, dashboard, projects, tasks

router = APIRouter(prefix="/api/v2", tags=["v2"])
router.include_router(me.router)
router.include_router(dashboard.router)
router.include_router(projects.router)
router.include_router(tasks.router)
