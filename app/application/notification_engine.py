"""
Notification Engine 1.0 — rule-based in-app + Telegram + email notifications.

Architecture:
- _TEMPLATES: message templates per rule code
- Rule runners: _run_<rule>() — check conditions, dedup, create notifications
- NotificationEngine.run(today): iterates all users, applies enabled rules
- dispatch_pending_deliveries(db): sends pending deliveries respecting quiet hours
"""
import logging
import requests
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.infrastructure.db.models import (
    User,
    TaskModel,
    SubscriptionModel,
    SubscriptionMemberModel,
    ContactModel,
    OperationTemplateModel,
    OperationOccurrence,
    NotificationRule,
    NotificationModel,
    NotificationDelivery,
    UserNotificationSettings,
    TelegramSettings,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Message templates
# ---------------------------------------------------------------------------

_TEMPLATES: dict[str, dict] = {
    "SUB_MEMBER_EXPIRED": {
        "severity": "danger",
        "title": "Подписка истекла",
        "body_inapp": "Подписка «{name}» для {member} истекла {date}.",
        "body_telegram": "🔴 <b>Подписка истекла</b>\n«{name}» для {member}\n📅 Дата: {date}",
    },
    "SUB_MEMBER_EXPIRES_SOON": {
        "severity": "warn",
        "title": "Подписка истекает",
        "body_inapp": "Подписка «{name}» для {member} истекает {date} (через {days} дн.).",
        "body_telegram": "🟡 <b>Подписка истекает</b>\n«{name}» для {member}\n📅 {date} (через {days} дн.)",
    },
    "PAYMENT_DUE_TOMORROW": {
        "severity": "warn",
        "title": "Платёж завтра",
        "body_inapp": "Запланирован платёж «{name}» на {date}: {amount} ₽.",
        "body_telegram": "💳 <b>Платёж завтра</b>\n«{name}»\n💰 {amount} ₽ · 📅 {date}",
    },
    "TASK_OVERDUE": {
        "severity": "danger",
        "title": "Просроченная задача",
        "body_inapp": "Задача «{title}» просрочена на {days} дн.",
        "body_telegram": "⚠️ <b>Просроченная задача</b>\n«{title}»\n📅 Просрочена на {days} дн.",
    },
}


# ---------------------------------------------------------------------------
# Dedup helper
# ---------------------------------------------------------------------------

def _is_duplicate(
    db: Session,
    user_id: int,
    rule_code: str,
    entity_type: str | None,
    entity_id: int | None,
    today: date,
) -> bool:
    """Return True if a notification for this entity was already created today."""
    return (
        db.query(NotificationModel)
        .filter(
            NotificationModel.user_id == user_id,
            NotificationModel.rule_code == rule_code,
            NotificationModel.entity_type == entity_type,
            NotificationModel.entity_id == entity_id,
            func.date(NotificationModel.created_at) == today,
        )
        .first()
        is not None
    )


# ---------------------------------------------------------------------------
# Notification + delivery creation helper
# ---------------------------------------------------------------------------

def _create_notification(
    db: Session,
    user_id: int,
    rule_code: str,
    entity_type: str | None,
    entity_id: int | None,
    ctx: dict,
    channels: list[str],
) -> NotificationModel:
    tmpl = _TEMPLATES[rule_code]
    notif = NotificationModel(
        user_id=user_id,
        rule_code=rule_code,
        entity_type=entity_type,
        entity_id=entity_id,
        severity=tmpl["severity"],
        title=tmpl["title"],
        body_inapp=tmpl["body_inapp"].format(**ctx),
        body_telegram=tmpl["body_telegram"].format(**ctx),
    )
    db.add(notif)
    db.flush()
    for ch in channels:
        db.add(NotificationDelivery(notification_id=notif.id, channel=ch, status="pending"))
    db.commit()
    return notif


# ---------------------------------------------------------------------------
# Rule runners
# ---------------------------------------------------------------------------

def _run_sub_expired(db: Session, user_id: int, today: date, channels: list[str]) -> None:
    """SUB_MEMBER_EXPIRED: subscription members whose paid_until has passed."""
    members = (
        db.query(SubscriptionMemberModel)
        .filter(
            SubscriptionMemberModel.account_id == user_id,
            SubscriptionMemberModel.is_archived.is_(False),
            SubscriptionMemberModel.paid_until < today,
        )
        .all()
    )
    for m in members:
        if _is_duplicate(db, user_id, "SUB_MEMBER_EXPIRED", "subscription_member", m.id, today):
            continue
        sub = db.query(SubscriptionModel).filter_by(id=m.subscription_id).first()
        contact = db.query(ContactModel).filter_by(id=m.contact_id).first()
        ctx = {
            "name": sub.name if sub else f"#{m.subscription_id}",
            "member": contact.name if contact else f"#{m.contact_id}",
            "date": m.paid_until.strftime("%d.%m.%Y"),
        }
        try:
            _create_notification(db, user_id, "SUB_MEMBER_EXPIRED", "subscription_member", m.id, ctx, channels)
        except Exception:
            db.rollback()


def _run_sub_expires_soon(db: Session, user_id: int, today: date, channels: list[str]) -> None:
    """SUB_MEMBER_EXPIRES_SOON: members expiring within 3 days."""
    deadline = today + timedelta(days=3)
    members = (
        db.query(SubscriptionMemberModel)
        .filter(
            SubscriptionMemberModel.account_id == user_id,
            SubscriptionMemberModel.is_archived.is_(False),
            SubscriptionMemberModel.paid_until >= today,
            SubscriptionMemberModel.paid_until <= deadline,
        )
        .all()
    )
    for m in members:
        if _is_duplicate(db, user_id, "SUB_MEMBER_EXPIRES_SOON", "subscription_member", m.id, today):
            continue
        sub = db.query(SubscriptionModel).filter_by(id=m.subscription_id).first()
        contact = db.query(ContactModel).filter_by(id=m.contact_id).first()
        days = (m.paid_until - today).days
        ctx = {
            "name": sub.name if sub else f"#{m.subscription_id}",
            "member": contact.name if contact else f"#{m.contact_id}",
            "date": m.paid_until.strftime("%d.%m.%Y"),
            "days": days,
        }
        try:
            _create_notification(db, user_id, "SUB_MEMBER_EXPIRES_SOON", "subscription_member", m.id, ctx, channels)
        except Exception:
            db.rollback()


def _run_payment_due_tomorrow(db: Session, user_id: int, today: date, channels: list[str]) -> None:
    """PAYMENT_DUE_TOMORROW: planned operation occurrences scheduled for tomorrow."""
    tomorrow = today + timedelta(days=1)
    occurrences = (
        db.query(OperationOccurrence)
        .filter(
            OperationOccurrence.account_id == user_id,
            OperationOccurrence.scheduled_date == tomorrow,
            OperationOccurrence.status == "ACTIVE",
        )
        .all()
    )
    for occ in occurrences:
        if _is_duplicate(db, user_id, "PAYMENT_DUE_TOMORROW", "operation_occurrence", occ.id, today):
            continue
        tmpl = db.query(OperationTemplateModel).filter_by(template_id=occ.template_id).first()
        ctx = {
            "name": tmpl.title if tmpl else f"Операция #{occ.template_id}",
            "amount": tmpl.amount if tmpl else "?",
            "date": tomorrow.strftime("%d.%m.%Y"),
        }
        try:
            _create_notification(db, user_id, "PAYMENT_DUE_TOMORROW", "operation_occurrence", occ.id, ctx, channels)
        except Exception:
            db.rollback()


def _run_task_overdue(db: Session, user_id: int, today: date, channels: list[str]) -> None:
    """TASK_OVERDUE: active tasks with due_date in the past."""
    tasks = (
        db.query(TaskModel)
        .filter(
            TaskModel.account_id == user_id,
            TaskModel.status == "ACTIVE",
            TaskModel.due_date < today,
            TaskModel.due_date.isnot(None),
        )
        .all()
    )
    for task in tasks:
        if _is_duplicate(db, user_id, "TASK_OVERDUE", "task", task.task_id, today):
            continue
        days = (today - task.due_date).days
        ctx = {
            "title": task.title,
            "days": days,
        }
        try:
            _create_notification(db, user_id, "TASK_OVERDUE", "task", task.task_id, ctx, channels)
        except Exception:
            db.rollback()


# ---------------------------------------------------------------------------
# Main engine
# ---------------------------------------------------------------------------

class NotificationEngine:
    def __init__(self, db: Session):
        self.db = db

    def run(self, today: date | None = None) -> None:
        """Generate notifications for all users for the given date."""
        today = today or date.today()
        users = self.db.query(User).all()
        enabled_rules = {
            r.code
            for r in self.db.query(NotificationRule).filter_by(enabled=True).all()
        }
        for user in users:
            try:
                self._run_for_user(user, today, enabled_rules)
            except Exception:
                logger.exception("Notification engine failed for user_id=%s", user.id)

    def _get_or_create_settings(self, user_id: int) -> UserNotificationSettings:
        s = self.db.query(UserNotificationSettings).filter_by(user_id=user_id).first()
        if not s:
            s = UserNotificationSettings(user_id=user_id)
            self.db.add(s)
            self.db.flush()
        return s

    def _run_for_user(self, user: User, today: date, enabled_rules: set[str]) -> None:
        settings = self._get_or_create_settings(user.id)
        if not settings.enabled:
            return
        channels_map = settings.channels_json or {}
        channels = [ch for ch, on in channels_map.items() if on]
        if "inapp" not in channels:
            channels.append("inapp")

        if "SUB_MEMBER_EXPIRED" in enabled_rules:
            _run_sub_expired(self.db, user.id, today, channels)
        if "SUB_MEMBER_EXPIRES_SOON" in enabled_rules:
            _run_sub_expires_soon(self.db, user.id, today, channels)
        if "PAYMENT_DUE_TOMORROW" in enabled_rules:
            _run_payment_due_tomorrow(self.db, user.id, today, channels)
        if "TASK_OVERDUE" in enabled_rules:
            _run_task_overdue(self.db, user.id, today, channels)


# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------

def _in_quiet_hours(now_time, settings: UserNotificationSettings | None) -> bool:
    """Return True if current time is in the user's quiet hours window."""
    if not settings or not settings.quiet_start or not settings.quiet_end:
        return False
    s, e = settings.quiet_start, settings.quiet_end
    if s <= e:
        return s <= now_time <= e
    # Overnight range (e.g. 22:00–08:00)
    return now_time >= s or now_time <= e


def _send_telegram(db: Session, notif: NotificationModel) -> bool:
    """Send a Telegram message. Returns True on success."""
    from app.config import get_settings
    cfg = get_settings()
    if not cfg.TELEGRAM_BOT_TOKEN:
        return False
    tg = db.query(TelegramSettings).filter_by(user_id=notif.user_id, connected=True).first()
    if not tg or not tg.chat_id:
        return False
    try:
        resp = requests.post(
            f"https://api.telegram.org/bot{cfg.TELEGRAM_BOT_TOKEN}/sendMessage",
            json={
                "chat_id": tg.chat_id,
                "text": notif.body_telegram,
                "parse_mode": "HTML",
            },
            timeout=5,
        )
        return resp.status_code == 200
    except Exception:
        logger.exception("Telegram send failed for user_id=%s", notif.user_id)
        return False


def _send_email(db: Session, notif: NotificationModel) -> bool:
    """Email delivery stub — logs only, returns False until SMTP is configured."""
    logger.info("EMAIL stub: user_id=%s title=%s", notif.user_id, notif.title)
    return False


def dispatch_pending_deliveries(db: Session) -> None:
    """Process all pending deliveries, respecting quiet hours for external channels."""
    now = datetime.now(tz=ZoneInfo("Europe/Moscow"))
    pending = db.query(NotificationDelivery).filter_by(status="pending").all()
    for delivery in pending:
        notif = db.get(NotificationModel, delivery.notification_id)
        if notif is None:
            continue
        settings = db.query(UserNotificationSettings).filter_by(user_id=notif.user_id).first()

        if delivery.channel == "inapp":
            delivery.status = "sent"
            delivery.sent_at = now
        elif delivery.channel == "telegram":
            if _in_quiet_hours(now.time(), settings):
                continue
            ok = _send_telegram(db, notif)
            delivery.status = "sent" if ok else "failed"
            delivery.sent_at = now
        elif delivery.channel == "email":
            if _in_quiet_hours(now.time(), settings):
                continue
            _send_email(db, notif)
            delivery.status = "skipped"
            delivery.sent_at = now

    db.commit()
