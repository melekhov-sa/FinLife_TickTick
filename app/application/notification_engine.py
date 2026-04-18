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
    DigestModel,
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
    "WEEKLY_DIGEST_READY": {
        "severity": "info",
        "title": "Дайджест недели готов",
        "body_inapp": "Дайджест недели {week}: {completed} задач · {habit_pct}% привычек · +{xp} XP",
        "body_telegram": "📊 <b>Дайджест недели {week}</b>\n{completed} задач · {habit_pct}% привычек · +{xp} XP\nОткрыть → /digest/week/{week}",
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
        .join(OperationTemplateModel, OperationTemplateModel.template_id == OperationOccurrence.template_id)
        .filter(
            OperationOccurrence.account_id == user_id,
            OperationOccurrence.scheduled_date == tomorrow,
            OperationOccurrence.status == "ACTIVE",
            OperationTemplateModel.is_archived == False,
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


def _run_weekly_digest(db: Session, user_id: int, today: date, channels: list[str]) -> None:
    """WEEKLY_DIGEST_READY: fire once on Sunday after digest is generated."""
    from app.application.digests import iso_week_key
    # Only fire on Sundays
    if today.weekday() != 6:
        return
    # Find the digest for the current week (which ended today — Sunday)
    week_key = iso_week_key(today)
    digest = (
        db.query(DigestModel)
        .filter(
            DigestModel.account_id == user_id,
            DigestModel.period_type == "week",
            DigestModel.period_key == week_key,
        )
        .first()
    )
    if not digest:
        return
    # Dedup: one notification per week per user (entity_type="digest", entity_id=digest.id, keyed on today)
    if _is_duplicate(db, user_id, "WEEKLY_DIGEST_READY", "digest", digest.id, today):
        return
    payload = digest.payload or {}
    tasks_data = payload.get("tasks", {})
    habits_data = payload.get("habits", {})
    xp_data = payload.get("xp", {})
    completed = tasks_data.get("completed", 0)
    habit_rate = habits_data.get("completion_rate", 0.0)
    habit_pct = int(round(habit_rate * 100))
    xp = xp_data.get("gained", 0)
    ctx = {
        "week": week_key,
        "completed": completed,
        "habit_pct": habit_pct,
        "xp": xp,
    }
    try:
        _create_notification(db, user_id, "WEEKLY_DIGEST_READY", "digest", digest.id, ctx, channels)
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
        if "WEEKLY_DIGEST_READY" in enabled_rules:
            _run_weekly_digest(self.db, user.id, today, channels)


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


_TELEGRAM_RETRY = object()  # sentinel compared by identity; leaves delivery as pending


def _send_telegram(db: Session, notif: NotificationModel):
    """Send a Telegram message using the user's own bot token.

    Returns:
        True  — message delivered successfully.
        False — permanent failure (4xx other than 429); mark delivery failed.
        _TELEGRAM_RETRY sentinel — transient failure (429 or 5xx); leave pending.
    """
    from app.infrastructure.crypto import decrypt
    tg = db.query(TelegramSettings).filter_by(user_id=notif.user_id, connected=True).first()
    if not tg or not tg.chat_id or not tg.bot_token:
        return False
    bot_token = decrypt(tg.bot_token)
    chat_id = decrypt(tg.chat_id)
    if not bot_token or not chat_id:
        return False
    try:
        resp = requests.post(
            f"https://api.telegram.org/bot{bot_token}/sendMessage",
            json={
                "chat_id": chat_id,
                "text": notif.body_telegram,
                "parse_mode": "HTML",
            },
            timeout=5,
        )
        if resp.status_code == 200:
            return True
        if resp.status_code == 429:
            retry_after = resp.headers.get("Retry-After", "unknown")
            logger.warning(
                "Telegram rate-limited for user_id=%s; Retry-After=%s s — leaving delivery pending",
                notif.user_id, retry_after,
            )
            return _TELEGRAM_RETRY
        if resp.status_code >= 500:
            logger.warning(
                "Telegram server error %s for user_id=%s — leaving delivery pending for next cycle",
                resp.status_code, notif.user_id,
            )
            return _TELEGRAM_RETRY
        # 4xx other than 429 — permanent error
        logger.error("Telegram permanent error %s for user_id=%s", resp.status_code, notif.user_id)
        return False
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
        try:
            notif = db.get(NotificationModel, delivery.notification_id)
            if notif is None:
                continue
            settings = db.query(UserNotificationSettings).filter_by(user_id=notif.user_id).first()

            if delivery.channel == "inapp":
                delivery.status = "sending"
                delivery.sent_at = now
                db.commit()
                try:
                    from app.application.push_service import send_push_to_user
                    send_push_to_user(db, notif.user_id, {
                        "title": notif.title,
                        "body": notif.body_inapp,
                        "url": "/notifications",
                    })
                except Exception:
                    pass  # push is best-effort, don't fail the delivery
                delivery.status = "sent"
                db.commit()
            elif delivery.channel == "telegram":
                if _in_quiet_hours(now.time(), settings):
                    continue
                delivery.status = "sending"
                db.commit()
                result = _send_telegram(db, notif)
                if result is _TELEGRAM_RETRY:
                    # Transient failure — revert to pending so next cycle retries
                    delivery.status = "pending"
                    db.commit()
                else:
                    delivery.status = "sent" if result else "failed"
                    delivery.sent_at = now
                    db.commit()
            elif delivery.channel == "email":
                if _in_quiet_hours(now.time(), settings):
                    continue
                delivery.status = "sending"
                db.commit()
                _send_email(db, notif)
                delivery.status = "skipped"
                delivery.sent_at = now
                db.commit()
        except Exception:
            logger.exception("dispatch_pending_deliveries failed for delivery_id=%s", delivery.id)
