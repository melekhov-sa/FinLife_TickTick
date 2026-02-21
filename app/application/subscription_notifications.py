"""
Subscription expiration notifications — checks daily, sends push N days before.

For each subscription with notify_enabled=True and notify_days_before set:
  - Check SELF paid_until and each member's paid_until
  - If today == paid_until - notify_days_before → send push
  - Log to subscription_notification_log to prevent duplicates
"""
import logging
from datetime import date, timedelta

from sqlalchemy import distinct
from sqlalchemy.orm import Session

from app.infrastructure.db.models import (
    SubscriptionModel, SubscriptionMemberModel, SubscriptionNotificationLog,
    ContactModel, PushSubscription, User,
)
from app.application.push_service import send_push_to_user

logger = logging.getLogger(__name__)


def check_subscription_notifications(db: Session, today: date | None = None) -> int:
    """
    Check all subscriptions with notifications enabled and send push
    notifications N days before expiration.

    Returns total number of push notifications sent.
    """
    if today is None:
        today = date.today()

    # Find all subscriptions with notifications enabled
    subs = db.query(SubscriptionModel).filter(
        SubscriptionModel.notify_enabled == True,  # noqa: E712
        SubscriptionModel.notify_days_before.isnot(None),
        SubscriptionModel.is_archived == False,  # noqa: E712
    ).all()

    if not subs:
        return 0

    total_sent = 0

    for sub in subs:
        try:
            total_sent += _check_subscription(db, sub, today)
        except Exception:
            logger.exception("Subscription notification check failed for sub_id=%d", sub.id)

    return total_sent


def _check_subscription(db: Session, sub: SubscriptionModel, today: date) -> int:
    """Check a single subscription for expiring coverage. Returns notifications sent."""
    sent = 0
    notify_date_offset = timedelta(days=sub.notify_days_before)

    # Get user_ids for push delivery (may be empty if no push subscriptions)
    user_ids = _get_account_user_ids(db, sub.account_id)

    # Check SELF paid_until
    if sub.paid_until_self:
        trigger_date = sub.paid_until_self - notify_date_offset
        if today == trigger_date:
            if not _already_notified(db, sub.id, None, sub.paid_until_self):
                # Send push if possible
                if user_ids:
                    payload = {
                        "title": "\u23f0 \u041f\u043e\u0434\u043f\u0438\u0441\u043a\u0430 \u0441\u043a\u043e\u0440\u043e \u0437\u0430\u043a\u043e\u043d\u0447\u0438\u0442\u0441\u044f",
                        "body": f"{sub.name}\n\u041e\u043f\u043b\u0430\u0447\u0435\u043d\u043e \u0434\u043e {sub.paid_until_self.strftime('%d.%m.%Y')}",
                        "url": f"/subscriptions/{sub.id}",
                    }
                    for uid in user_ids:
                        sent += send_push_to_user(db, uid, payload)
                # Always log to prevent duplicate checks
                _log_notification(db, sub.id, None, sub.paid_until_self)

    # Check each member's paid_until
    members = db.query(SubscriptionMemberModel).filter(
        SubscriptionMemberModel.subscription_id == sub.id,
        SubscriptionMemberModel.is_archived == False,  # noqa: E712
        SubscriptionMemberModel.paid_until.isnot(None),
    ).all()

    # Preload contact names
    contact_ids = [m.contact_id for m in members]
    contact_map = {}
    if contact_ids:
        contacts = db.query(ContactModel).filter(ContactModel.id.in_(contact_ids)).all()
        contact_map = {c.id: c for c in contacts}

    for member in members:
        trigger_date = member.paid_until - notify_date_offset
        if today == trigger_date:
            if not _already_notified(db, sub.id, member.id, member.paid_until):
                if user_ids:
                    contact = contact_map.get(member.contact_id)
                    contact_name = contact.name if contact else "?"
                    payload = {
                        "title": "\u23f0 \u041f\u043e\u0434\u043f\u0438\u0441\u043a\u0430 \u0441\u043a\u043e\u0440\u043e \u0437\u0430\u043a\u043e\u043d\u0447\u0438\u0442\u0441\u044f",
                        "body": f"{sub.name} ({contact_name})\n\u041e\u043f\u043b\u0430\u0447\u0435\u043d\u043e \u0434\u043e {member.paid_until.strftime('%d.%m.%Y')}",
                        "url": f"/subscriptions/{sub.id}",
                    }
                    for uid in user_ids:
                        sent += send_push_to_user(db, uid, payload)
                _log_notification(db, sub.id, member.id, member.paid_until)

    db.commit()
    return sent


def _get_account_user_ids(db: Session, account_id: int) -> list[int]:
    """Get user IDs for an account that have push subscriptions.

    In the current single-user-per-account model, account_id == user_id.
    """
    rows = (
        db.query(distinct(PushSubscription.user_id))
        .filter(PushSubscription.user_id == account_id)
        .all()
    )
    return [r[0] for r in rows]


def _already_notified(
    db: Session, subscription_id: int, member_id: int | None, notified_for_date: date,
) -> bool:
    """Check if we already sent this notification."""
    q = db.query(SubscriptionNotificationLog).filter(
        SubscriptionNotificationLog.subscription_id == subscription_id,
        SubscriptionNotificationLog.notified_for_date == notified_for_date,
    )
    if member_id is not None:
        q = q.filter(SubscriptionNotificationLog.member_id == member_id)
    else:
        q = q.filter(SubscriptionNotificationLog.member_id.is_(None))
    return q.first() is not None


def _log_notification(
    db: Session, subscription_id: int, member_id: int | None, notified_for_date: date,
) -> None:
    """Record that we sent a notification."""
    log = SubscriptionNotificationLog(
        subscription_id=subscription_id,
        member_id=member_id,
        notified_for_date=notified_for_date,
    )
    db.add(log)
    db.flush()
