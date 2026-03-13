"""
GET  /api/v2/notifications        — list notifications (unread first)
POST /api/v2/notifications/{id}/read — mark as read
GET  /api/v2/notifications/badge  — unread count
"""
from datetime import datetime

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, field_serializer
from sqlalchemy.orm import Session

from app.infrastructure.db.session import get_db
from app.api.v2.deps import get_user_id
from app.infrastructure.db.models import NotificationModel

router = APIRouter()


class NotificationItem(BaseModel):
    id: int
    rule_code: str
    entity_type: str | None
    entity_id: int | None
    severity: str
    title: str
    body_inapp: str
    is_read: bool
    created_at: datetime

    @field_serializer("created_at")
    def _dt(self, v: datetime) -> str:
        return v.isoformat()


class BadgeResponse(BaseModel):
    unread_count: int


@router.get("/notifications", response_model=list[NotificationItem])
def list_notifications(
    request: Request,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    user_id = get_user_id(request)
    rows = (
        db.query(NotificationModel)
        .filter(NotificationModel.user_id == user_id)
        .order_by(NotificationModel.is_read.asc(), NotificationModel.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        NotificationItem(
            id=n.id,
            rule_code=n.rule_code,
            entity_type=n.entity_type,
            entity_id=n.entity_id,
            severity=n.severity,
            title=n.title,
            body_inapp=n.body_inapp,
            is_read=n.is_read,
            created_at=n.created_at,
        )
        for n in rows
    ]


@router.get("/notifications/badge", response_model=BadgeResponse)
def notifications_badge(request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request)
    count = (
        db.query(NotificationModel)
        .filter(NotificationModel.user_id == user_id, NotificationModel.is_read == False)  # noqa: E712
        .count()
    )
    return BadgeResponse(unread_count=count)


@router.post("/notifications/{notification_id}/read")
def mark_read(notification_id: int, request: Request, db: Session = Depends(get_db)):
    from fastapi import HTTPException
    user_id = get_user_id(request)
    n = db.query(NotificationModel).filter(
        NotificationModel.id == notification_id,
        NotificationModel.user_id == user_id,
    ).first()
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    n.is_read = True
    db.commit()
    return {"ok": True}
