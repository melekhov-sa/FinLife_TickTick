"""
Tests for Notification Engine 1.0.

Covers:
  - Dedup: same entity + same day → only 1 notification
  - Dedup: different days → 2 records allowed
  - Template rendering: in-app and Telegram body formatting
  - Quiet hours: overnight range (in / out / not configured)
  - In-app delivery auto-sent by dispatcher
  - TASK_OVERDUE rule: 1 overdue task → 1 notification
  - PAYMENT_DUE_TOMORROW rule: 1 occurrence due tomorrow → 1 notification
  - UserNotificationSettings defaults for new user
"""
import pytest
from datetime import date, datetime, time, timedelta, timezone
from unittest.mock import patch

from app.infrastructure.db.models import (
    User,
    TaskModel,
    OperationTemplateModel,
    OperationOccurrence,
    NotificationRule,
    NotificationModel,
    NotificationDelivery,
    UserNotificationSettings,
    TelegramSettings,
)
from app.application.notification_engine import (
    _TEMPLATES,
    _is_duplicate,
    _create_notification,
    _in_quiet_hours,
    dispatch_pending_deliveries,
    NotificationEngine,
    _run_task_overdue,
    _run_payment_due_tomorrow,
)


_tz = timezone.utc
TODAY = date(2026, 2, 27)
USER_ID = 1


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _user(db, user_id=USER_ID) -> User:
    u = db.query(User).filter_by(id=user_id).first()
    if not u:
        u = User(
            id=user_id,
            email=f"test{user_id}@example.com",
            password_hash="x",
        )
        db.add(u)
        db.flush()
    return u


def _rule(db, code: str) -> NotificationRule:
    r = db.query(NotificationRule).filter_by(code=code).first()
    if not r:
        r = NotificationRule(code=code, title=code, enabled=True)
        db.add(r)
        db.flush()
    return r


def _seed_rules(db):
    for code in ["SUB_MEMBER_EXPIRED", "SUB_MEMBER_EXPIRES_SOON", "PAYMENT_DUE_TOMORROW", "TASK_OVERDUE"]:
        _rule(db, code)
    db.flush()


def _task(db, *, due_date=None, status="ACTIVE", account_id=USER_ID) -> TaskModel:
    tid = db.query(TaskModel).count() + 1
    t = TaskModel(
        task_id=tid,
        account_id=account_id,
        title=f"task-{tid}",
        status=status,
        board_status="backlog",
        due_date=due_date,
        created_at=datetime(2026, 1, 1, tzinfo=_tz),
    )
    db.add(t)
    db.flush()
    return t


def _notif(db, *, user_id=USER_ID, rule_code="TASK_OVERDUE",
           entity_type="task", entity_id=1,
           created_at=None) -> NotificationModel:
    n = NotificationModel(
        user_id=user_id,
        rule_code=rule_code,
        entity_type=entity_type,
        entity_id=entity_id,
        severity="info",
        title="Test",
        body_inapp="body",
        body_telegram="body_tg",
        is_read=False,
        created_at=created_at or datetime(2026, 2, 27, 10, 0, tzinfo=_tz),
    )
    db.add(n)
    db.flush()
    return n


def _settings(db, *, user_id=USER_ID, enabled=True,
              quiet_start=None, quiet_end=None,
              channels=None) -> UserNotificationSettings:
    s = UserNotificationSettings(
        user_id=user_id,
        enabled=enabled,
        quiet_start=quiet_start,
        quiet_end=quiet_end,
        channels_json=channels or {"inapp": True, "telegram": False, "email": False},
    )
    db.add(s)
    db.flush()
    return s


# ---------------------------------------------------------------------------
# Dedup tests
# ---------------------------------------------------------------------------

def test_dedup_same_day(db_session):
    """Same entity + same day → _is_duplicate returns True after first creation."""
    _notif(db_session, entity_id=42, created_at=datetime(2026, 2, 27, 9, 0, tzinfo=_tz))
    assert _is_duplicate(db_session, USER_ID, "TASK_OVERDUE", "task", 42, TODAY) is True


def test_dedup_different_day(db_session):
    """Notification on a different day → _is_duplicate returns False."""
    _notif(db_session, entity_id=42, created_at=datetime(2026, 2, 26, 9, 0, tzinfo=_tz))
    # Yesterday's notification should not block today
    assert _is_duplicate(db_session, USER_ID, "TASK_OVERDUE", "task", 42, TODAY) is False


# ---------------------------------------------------------------------------
# Template rendering tests
# ---------------------------------------------------------------------------

def test_template_inapp_render():
    """SUB_MEMBER_EXPIRED in-app body contains the member name."""
    tmpl = _TEMPLATES["SUB_MEMBER_EXPIRED"]
    body = tmpl["body_inapp"].format(name="Netflix", member="Иван", date="25.02.2026")
    assert "Netflix" in body
    assert "Иван" in body


def test_template_telegram_render():
    """TASK_OVERDUE Telegram body contains HTML bold tag."""
    tmpl = _TEMPLATES["TASK_OVERDUE"]
    body = tmpl["body_telegram"].format(title="Купить молоко", days=3)
    assert "<b>" in body
    assert "Купить молоко" in body


# ---------------------------------------------------------------------------
# Quiet hours tests
# ---------------------------------------------------------------------------

def test_quiet_hours_overnight_in():
    """23:30 inside overnight quiet window 22:00–08:00 → True."""
    s = UserNotificationSettings(
        user_id=USER_ID, quiet_start=time(22, 0), quiet_end=time(8, 0)
    )
    assert _in_quiet_hours(time(23, 30), s) is True


def test_quiet_hours_overnight_out():
    """12:00 outside overnight quiet window 22:00–08:00 → False."""
    s = UserNotificationSettings(
        user_id=USER_ID, quiet_start=time(22, 0), quiet_end=time(8, 0)
    )
    assert _in_quiet_hours(time(12, 0), s) is False


def test_quiet_hours_not_configured():
    """quiet_start=None → always False."""
    s = UserNotificationSettings(user_id=USER_ID, quiet_start=None, quiet_end=None)
    assert _in_quiet_hours(time(23, 30), s) is False


# ---------------------------------------------------------------------------
# Dispatcher tests
# ---------------------------------------------------------------------------

def test_inapp_auto_sent(db_session):
    """After dispatch, inapp delivery status becomes 'sent'."""
    n = _notif(db_session)
    d = NotificationDelivery(
        notification_id=n.id, channel="inapp", status="pending"
    )
    db_session.add(d)
    db_session.flush()

    dispatch_pending_deliveries(db_session)

    db_session.refresh(d)
    assert d.status == "sent"
    assert d.sent_at is not None


# ---------------------------------------------------------------------------
# Rule runner tests
# ---------------------------------------------------------------------------

def test_task_overdue_rule(db_session):
    """1 overdue task → 1 NotificationModel created by _run_task_overdue."""
    _seed_rules(db_session)
    _settings(db_session)
    overdue_date = TODAY - timedelta(days=2)
    _task(db_session, due_date=overdue_date, status="ACTIVE")

    _run_task_overdue(db_session, USER_ID, TODAY, ["inapp"])

    count = db_session.query(NotificationModel).filter_by(
        user_id=USER_ID, rule_code="TASK_OVERDUE"
    ).count()
    assert count == 1


def test_task_overdue_dedup(db_session):
    """Running rule twice for same task on same day creates only 1 notification."""
    _seed_rules(db_session)
    _settings(db_session)
    overdue_date = TODAY - timedelta(days=2)
    t = _task(db_session, due_date=overdue_date, status="ACTIVE")

    _run_task_overdue(db_session, USER_ID, TODAY, ["inapp"])
    _run_task_overdue(db_session, USER_ID, TODAY, ["inapp"])

    count = db_session.query(NotificationModel).filter_by(
        user_id=USER_ID, rule_code="TASK_OVERDUE"
    ).count()
    assert count == 1


def test_payment_rule(db_session):
    """1 operation occurrence due tomorrow → 1 PAYMENT_DUE_TOMORROW notification."""
    _seed_rules(db_session)
    _settings(db_session)

    # Create template + occurrence
    tmpl = OperationTemplateModel(
        template_id=1,
        account_id=USER_ID,
        title="Аренда",
        rule_id=1,
        active_from=TODAY,
        kind="EXPENSE",
        amount=5000,
    )
    db_session.add(tmpl)
    db_session.flush()

    occ = OperationOccurrence(
        id=1,
        account_id=USER_ID,
        template_id=1,
        scheduled_date=TODAY + timedelta(days=1),
        status="ACTIVE",
    )
    db_session.add(occ)
    db_session.flush()

    _run_payment_due_tomorrow(db_session, USER_ID, TODAY, ["inapp"])

    count = db_session.query(NotificationModel).filter_by(
        user_id=USER_ID, rule_code="PAYMENT_DUE_TOMORROW"
    ).count()
    assert count == 1


# ---------------------------------------------------------------------------
# Settings defaults
# ---------------------------------------------------------------------------

def test_settings_defaults(db_session):
    """New user → NotificationEngine creates default settings: enabled=True, inapp=True."""
    _user(db_session)
    _seed_rules(db_session)

    engine = NotificationEngine(db_session)
    s = engine._get_or_create_settings(USER_ID)

    assert s.enabled is True
    assert s.channels_json.get("inapp") is True
    assert s.channels_json.get("telegram") is False
