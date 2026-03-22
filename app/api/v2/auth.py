"""
Auth endpoints for v2 API.
Login/logout are now handled by Supabase on the frontend.
This endpoint is kept for logout (clears any legacy session).
"""
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

router = APIRouter(tags=["auth-v2"])


@router.post("/auth/logout")
def api_logout(request: Request):
    """Clear legacy session cookie if present."""
    request.session.clear()
    return JSONResponse({"ok": True})
