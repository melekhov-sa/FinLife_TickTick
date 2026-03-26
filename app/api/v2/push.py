"""
Web Push subscription API — v2 (JWT auth).

POST /api/v2/push/subscribe    — register push subscription
DELETE /api/v2/push/unsubscribe — remove push subscription
POST /api/v2/push/test         — send test notification
GET  /api/v2/push/vapid-key    — get VAPID public key
GET  /api/v2/push/status       — check if user has active subscriptions
"""
from fastapi import APIRouter, Request, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.infrastructure.db.session import get_db
from app.api.v2.deps import get_user_id
from app.infrastructure.db.models import PushSubscription
from app.config import get_settings

router = APIRouter(prefix="/push", tags=["push"])


class PushKeys(BaseModel):
    p256dh: str
    auth: str


class SubscribeRequest(BaseModel):
    endpoint: str
    keys: PushKeys


@router.get("/vapid-key")
def vapid_key():
    return {"key": get_settings().VAPID_PUBLIC_KEY}


@router.get("/status")
def push_status(request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    count = db.query(PushSubscription).filter(PushSubscription.user_id == user_id).count()
    return {"subscribed": count > 0, "count": count}


@router.post("/subscribe")
def subscribe(body: SubscribeRequest, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)

    existing = db.query(PushSubscription).filter(
        PushSubscription.endpoint == body.endpoint
    ).first()

    if existing:
        existing.user_id = user_id
        existing.p256dh = body.keys.p256dh
        existing.auth = body.keys.auth
    else:
        sub = PushSubscription(
            user_id=user_id,
            endpoint=body.endpoint,
            p256dh=body.keys.p256dh,
            auth=body.keys.auth,
        )
        db.add(sub)

    db.commit()
    return {"ok": True}


@router.post("/unsubscribe")
def unsubscribe(body: SubscribeRequest, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    db.query(PushSubscription).filter(
        PushSubscription.endpoint == body.endpoint,
        PushSubscription.user_id == user_id,
    ).delete()
    db.commit()
    return {"ok": True}


@router.post("/test")
def test_push(request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    count = db.query(PushSubscription).filter(PushSubscription.user_id == user_id).count()
    if count == 0:
        return {"ok": False, "sent": 0}

    from app.application.push_service import send_push_to_user
    sent = send_push_to_user(db, user_id, {
        "title": "FinLife",
        "body": "Push-уведомления работают!",
        "url": "/dashboard",
    })
    return {"ok": True, "sent": sent}
