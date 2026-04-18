"""
Batch 4A tests:
  Fix 1 — event reminders fixed_time mode fires correctly
  Fix 3 — dispatch_pending_deliveries respects .limit(500)
"""
import pytest
from datetime import date, datetime, time, timedelta, timezone
from unittest.mock import patch, MagicMock

from app.infrastructure.db.models import (
    User,
    CalendarEventModel,
    EventOccurrenceModel,
    EventReminderModel,
    NotificationModel,
    NotificationDelivery,
    UserNotificationSettings,
)
from app.application.reminder_dispatcher import _dispatch_event_reminders, MSK
from app.application.notification_engine import dispatch_pending_deliveries

_UTC = timezone.utc
USER_ID = 1
TODAY = date(2026, 4, 18)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _user(db, user_id=USER_ID):
    u = db.query(User).filter_by(id=user_id).first()
    if not u:
        u = User(id=user_id, email=f"test{user_id}@example.com", password_hash="x")
        db.add(u)
        db.flush()
    return u


def _event(db, *, account_id=USER_ID, title="Встреча") -> CalendarEventModel:
    eid = db.query(CalendarEventModel).count() + 1
    ev = CalendarEventModel(
        event_id=eid,
        account_id=account_id,
        title=title,
        category_id=1,
    )
    db.add(ev)
    db.flush()
    return ev


def _occurrence(db, ev: CalendarEventModel, *, start_date=TODAY, start_time=None) -> EventOccurrenceModel:
    occ = EventOccurrenceModel(
        account_id=ev.account_id,
        event_id=ev.event_id,
        start_date=start_date,
        start_time=start_time,
        is_cancelled=False,
        source="manual",
    )
    db.add(occ)
    db.flush()
    return occ


def _event_reminder(db, occ: EventOccurrenceModel, *, mode="fixed_time",
                    fixed_time=None, offset_minutes=None) -> EventReminderModel:
    rem = EventReminderModel(
        occurrence_id=occ.id,
        channel="ui",
        mode=mode,
        fixed_time=fixed_time,
        offset_minutes=offset_minutes,
        is_enabled=True,
    )
    db.add(rem)
    db.flush()
    return rem


def _notif(db, *, user_id=USER_ID) -> NotificationModel:
    n = NotificationModel(
        user_id=user_id,
        rule_code="TASK_OVERDUE",
        entity_type="task",
        entity_id=1,
        severity="info",
        title="Test",
        body_inapp="body",
        body_telegram="body_tg",
        is_read=False,
        created_at=datetime(2026, 4, 18, 10, 0, tzinfo=_UTC),
    )
    db.add(n)
    db.flush()
    return n


# ---------------------------------------------------------------------------
# Fix 1 — fixed_time event reminder fires correctly
# ---------------------------------------------------------------------------

def test_event_fixed_time_reminder_fires(db_session):
    """All-day event with fixed_time=09:00 reminder: dispatcher calls send_push at 09:01 MSK."""
    ev = _event(db_session)
    occ = _occurrence(db_session, ev, start_date=TODAY, start_time=None)
    _event_reminder(db_session, occ, mode="fixed_time", fixed_time=time(9, 0))

    # now_msk = 09:01 on the event date — just inside the 2-minute window
    now_msk = datetime.combine(TODAY, time(9, 1), tzinfo=MSK)

    with patch("app.application.reminder_dispatcher.send_push_to_user", return_value=1) as mock_send:
        result = _dispatch_event_reminders(db_session, now_msk)

    assert result == 1
    mock_send.assert_called_once()


def test_event_fixed_time_reminder_too_early_does_not_fire(db_session):
    """fixed_time=09:00, now=08:58 — before the window, must not fire."""
    ev = _event(db_session)
    occ = _occurrence(db_session, ev, start_date=TODAY, start_time=None)
    _event_reminder(db_session, occ, mode="fixed_time", fixed_time=time(9, 0))

    now_msk = datetime.combine(TODAY, time(8, 58), tzinfo=MSK)

    with patch("app.application.reminder_dispatcher.send_push_to_user", return_value=1) as mock_send:
        result = _dispatch_event_reminders(db_session, now_msk)

    assert result == 0
    mock_send.assert_not_called()


def test_event_fixed_time_reminder_skipped_when_no_fixed_time(db_session):
    """mode=fixed_time but fixed_time=None → skipped (no crash, no send)."""
    ev = _event(db_session)
    occ = _occurrence(db_session, ev, start_date=TODAY, start_time=None)
    _event_reminder(db_session, occ, mode="fixed_time", fixed_time=None)

    now_msk = datetime.combine(TODAY, time(9, 1), tzinfo=MSK)

    with patch("app.application.reminder_dispatcher.send_push_to_user", return_value=1) as mock_send:
        result = _dispatch_event_reminders(db_session, now_msk)

    assert result == 0
    mock_send.assert_not_called()


def test_event_offset_reminder_still_fires(db_session):
    """Existing offset mode still works after fix (regression guard)."""
    ev = _event(db_session)
    # Timed event at 10:00, reminder 5 min before → fire_at = 09:55
    occ = _occurrence(db_session, ev, start_date=TODAY, start_time=time(10, 0))
    _event_reminder(db_session, occ, mode="offset", offset_minutes=5)

    now_msk = datetime.combine(TODAY, time(9, 55, 30), tzinfo=MSK)

    with patch("app.application.reminder_dispatcher.send_push_to_user", return_value=1) as mock_send:
        result = _dispatch_event_reminders(db_session, now_msk)

    assert result == 1
    mock_send.assert_called_once()


# ---------------------------------------------------------------------------
# Fix 3 — dispatch_pending_deliveries processes at most 500 deliveries
# ---------------------------------------------------------------------------

def test_dispatch_pending_deliveries_limit(db_session):
    """With 600 pending inapp deliveries, only 500 are processed per call."""
    _user(db_session)

    # Create 600 pending inapp deliveries (each needs a notification)
    for i in range(600):
        n = NotificationModel(
            user_id=USER_ID,
            rule_code="TASK_OVERDUE",
            entity_type="task",
            entity_id=i + 1000,
            severity="info",
            title=f"Task {i}",
            body_inapp="body",
            body_telegram="body_tg",
            is_read=False,
            created_at=datetime(2026, 4, 18, 10, 0, tzinfo=_UTC),
        )
        db_session.add(n)
        db_session.flush()

        d = NotificationDelivery(
            notification_id=n.id,
            channel="inapp",
            status="pending",
        )
        db_session.add(d)
        db_session.flush()

    # Patch send_push_to_user so inapp delivery completes without real push
    with patch("app.application.push_service.send_push_to_user", return_value=0):
        dispatch_pending_deliveries(db_session)

    sent_count = db_session.query(NotificationDelivery).filter_by(status="sent").count()
    still_pending = db_session.query(NotificationDelivery).filter_by(status="pending").count()

    # Exactly 500 should have been processed
    assert sent_count == 500
    assert still_pending == 100
