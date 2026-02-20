"""
Web Push notification service.

Sends push notifications via pywebpush and manages stale subscriptions.
"""
import json
import logging

from pywebpush import webpush, WebPushException
from sqlalchemy.orm import Session

from app.config import get_settings
from app.infrastructure.db.models import PushSubscription

logger = logging.getLogger(__name__)


def send_web_push(db: Session, subscription: PushSubscription, payload: dict) -> bool:
    """
    Send a push notification to a single subscription.

    payload format:
        {"title": "...", "body": "...", "url": "/tasks/123"}

    Returns True on success, False on failure.
    Automatically deletes stale subscriptions (410/404).
    """
    settings = get_settings()
    if not settings.VAPID_PRIVATE_KEY or not settings.VAPID_PUBLIC_KEY:
        logger.warning("VAPID keys not configured, skipping push")
        return False

    subscription_info = {
        "endpoint": subscription.endpoint,
        "keys": {
            "p256dh": subscription.p256dh,
            "auth": subscription.auth,
        },
    }

    # .env stores PEM with literal \n — restore actual newlines
    private_key = settings.VAPID_PRIVATE_KEY.replace("\\n", "\n")

    try:
        webpush(
            subscription_info=subscription_info,
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=private_key,
            vapid_claims={"sub": settings.VAPID_MAILTO},
        )
        return True
    except WebPushException as e:
        status_code = e.response.status_code if e.response is not None else 0
        if status_code in (404, 410):
            logger.info("Subscription expired (HTTP %d), removing: %s", status_code, subscription.endpoint[:60])
            db.query(PushSubscription).filter(PushSubscription.id == subscription.id).delete()
            db.commit()
        else:
            logger.error("WebPush error (HTTP %d): %s", status_code, e)
        return False


def send_push_to_user(db: Session, user_id: int, payload: dict) -> int:
    """
    Send push notification to all subscriptions of a user.

    Returns the number of successful deliveries.
    """
    subs = db.query(PushSubscription).filter(PushSubscription.user_id == user_id).all()
    if not subs:
        return 0

    sent = 0
    for sub in subs:
        if send_web_push(db, sub, payload):
            sent += 1
    return sent
