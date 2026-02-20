"""
Web Push subscription API endpoints.
"""
from fastapi import APIRouter, Request, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.api.deps import get_db
from app.infrastructure.db.models import PushSubscription

router = APIRouter(prefix="/api/push", tags=["push"])


class PushKeys(BaseModel):
    p256dh: str
    auth: str


class SubscribeRequest(BaseModel):
    endpoint: str
    keys: PushKeys


@router.post("/subscribe")
def subscribe(body: SubscribeRequest, request: Request, db: Session = Depends(get_db)):
    user_id = request.session.get("user_id")
    if not user_id:
        return JSONResponse({"error": "Not authenticated"}, status_code=401)

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
    return {"success": True}


@router.delete("/unsubscribe")
def unsubscribe(body: SubscribeRequest, request: Request, db: Session = Depends(get_db)):
    user_id = request.session.get("user_id")
    if not user_id:
        return JSONResponse({"error": "Not authenticated"}, status_code=401)

    deleted = db.query(PushSubscription).filter(
        PushSubscription.endpoint == body.endpoint,
        PushSubscription.user_id == user_id,
    ).delete()
    db.commit()

    return {"success": True, "deleted": deleted}


@router.post("/test")
def test_push(request: Request, db: Session = Depends(get_db)):
    """Send a test push to verify the setup."""
    user_id = request.session.get("user_id")
    if not user_id:
        return JSONResponse({"error": "Not authenticated"}, status_code=401)

    from app.application.push_service import send_push_to_user
    sent = send_push_to_user(db, user_id, {
        "title": "FinLife",
        "body": "Push-уведомления работают!",
        "url": "/profile",
    })
    return {"success": True, "sent": sent}
