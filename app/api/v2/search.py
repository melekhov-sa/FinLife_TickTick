"""
GET /api/v2/search?q=...&limit=30 — global full-text search across tasks, events,
operation templates and transactions.
"""
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.v2.deps import get_user_id
from app.application.search import SearchService
from app.infrastructure.db.session import get_db

router = APIRouter()


@router.get("/search")
def search_endpoint(
    request: Request,
    q: str = Query(..., min_length=1, max_length=100),
    limit: int = Query(30, ge=1, le=100),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(request, db)
    return SearchService(db).search(user_id, q, limit)
