"""
GET    /api/v2/digests?period_type=week&limit=20&offset=0 — list digests
GET    /api/v2/digests/{period_type}/{period_key}         — get detail
POST   /api/v2/digests/backfill                          — generate past N periods
POST   /api/v2/digests/{id}/viewed                       — mark as viewed
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.v2.deps import get_user_id
from app.api.deps import get_db
from app.infrastructure.db.models import DigestModel
from app.application.digests import (
    iso_week_key, parse_week_key, generate_and_save_weekly_digest,
)

router = APIRouter()


class DigestListItem(BaseModel):
    id: int
    period_type: str
    period_key: str
    generated_at: datetime
    viewed_at: Optional[datetime]
    tasks_completed: int
    habit_completion_rate: float
    xp_gained: int
    efficiency_score: int


class DigestDetail(BaseModel):
    id: int
    period_type: str
    period_key: str
    generated_at: datetime
    viewed_at: Optional[datetime]
    payload: dict
    ai_comment: Optional[str]


class BackfillRequest(BaseModel):
    period_type: str = "week"
    count: int = 4


def _to_list_item(d: DigestModel) -> DigestListItem:
    p = d.payload or {}
    return DigestListItem(
        id=d.id,
        period_type=d.period_type,
        period_key=d.period_key,
        generated_at=d.generated_at,
        viewed_at=d.viewed_at,
        tasks_completed=p.get("tasks", {}).get("completed", 0),
        habit_completion_rate=p.get("habits", {}).get("completion_rate", 0.0),
        xp_gained=p.get("xp", {}).get("gained", 0),
        efficiency_score=p.get("efficiency", {}).get("score", 0),
    )


@router.get("/digests", response_model=list[DigestListItem])
def list_digests(
    period_type: str = Query("week"),
    limit: int = Query(20, le=100),
    offset: int = Query(0),
    user_id: int = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    digests = (
        db.query(DigestModel)
        .filter(
            DigestModel.account_id == user_id,
            DigestModel.period_type == period_type,
        )
        .order_by(DigestModel.generated_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [_to_list_item(d) for d in digests]


@router.get("/digests/unviewed-latest", response_model=Optional[DigestListItem])
def get_latest_unviewed(
    user_id: int = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    """Return the most recent unviewed weekly digest (for dashboard card)."""
    d = (
        db.query(DigestModel)
        .filter(
            DigestModel.account_id == user_id,
            DigestModel.period_type == "week",
            DigestModel.viewed_at.is_(None),
        )
        .order_by(DigestModel.generated_at.desc())
        .first()
    )
    return _to_list_item(d) if d else None


@router.get("/digests/{period_type}/{period_key}", response_model=DigestDetail)
def get_digest(
    period_type: str,
    period_key: str,
    user_id: int = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    d = (
        db.query(DigestModel)
        .filter(
            DigestModel.account_id == user_id,
            DigestModel.period_type == period_type,
            DigestModel.period_key == period_key,
        )
        .first()
    )
    if not d:
        raise HTTPException(status_code=404, detail="Digest not found")
    return DigestDetail(
        id=d.id,
        period_type=d.period_type,
        period_key=d.period_key,
        generated_at=d.generated_at,
        viewed_at=d.viewed_at,
        payload=d.payload,
        ai_comment=d.ai_comment,
    )


@router.post("/digests/{digest_id}/viewed")
def mark_viewed(
    digest_id: int,
    user_id: int = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    d = db.query(DigestModel).filter(
        DigestModel.id == digest_id,
        DigestModel.account_id == user_id,
    ).first()
    if not d:
        raise HTTPException(status_code=404, detail="Digest not found")
    if not d.viewed_at:
        d.viewed_at = datetime.now(tz=timezone.utc)
        db.commit()
    return {"ok": True}


@router.post("/digests/backfill")
def backfill_digests(
    body: BackfillRequest,
    user_id: int = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    """Generate past N completed weekly periods (skip if already exist)."""
    import logging
    logger = logging.getLogger(__name__)

    if body.period_type != "week":
        raise HTTPException(status_code=400, detail="Only week period_type is supported")
    from datetime import date
    count = min(body.count, 52)
    today = date.today()
    days_since_sunday = (today.weekday() + 1) % 7
    last_sunday = today - timedelta(days=days_since_sunday)
    generated: list[str] = []
    errors: list[str] = []
    for i in range(count):
        week_end = last_sunday - timedelta(weeks=i)
        week_start = week_end - timedelta(days=6)
        week_key = iso_week_key(week_start)
        existing = (
            db.query(DigestModel)
            .filter(
                DigestModel.account_id == user_id,
                DigestModel.period_type == "week",
                DigestModel.period_key == week_key,
            )
            .first()
        )
        if existing:
            continue
        try:
            generate_and_save_weekly_digest(db, user_id, week_start)
            generated.append(week_key)
        except Exception as exc:
            logger.exception("Digest backfill failed for %s week=%s", user_id, week_key)
            errors.append(f"{week_key}: {exc}")
            db.rollback()
    return {"generated": generated, "count": len(generated), "errors": errors}
