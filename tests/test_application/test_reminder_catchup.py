"""Пропущенное напоминание должно догонять, но не дублироваться.

Раньше окно было 2 минуты без отметки об отправке: пропущенный тик
(перезапуск, деплой) терял напоминание навсегда.
"""
from datetime import datetime, timedelta, timezone

from app.application.reminder_dispatcher import CATCHUP_WINDOW, _should_send, _mark_sent

ACC = 1


def _now():
    return datetime(2026, 11, 9, 12, 0, tzinfo=timezone.utc)


def test_fires_when_just_due(db_session):
    now = _now()
    assert _should_send(db_session, ACC, "task", 10, now - timedelta(minutes=1), now)


def test_catches_up_missed_tick(db_session):
    """Главное ради чего всё затевалось: тик пропустили, напоминание не потеряно."""
    now = _now()
    assert _should_send(db_session, ACC, "task", 10, now - timedelta(minutes=30), now)


def test_does_not_fire_too_old(db_session):
    """Но и не присылает привет из прошлого."""
    now = _now()
    assert not _should_send(db_session, ACC, "task", 10, now - CATCHUP_WINDOW - timedelta(minutes=5), now)


def test_does_not_fire_in_future(db_session):
    now = _now()
    assert not _should_send(db_session, ACC, "task", 10, now + timedelta(minutes=5), now)


def test_no_duplicate_after_mark(db_session):
    now = _now()
    fire_at = now - timedelta(minutes=1)
    assert _should_send(db_session, ACC, "task", 10, fire_at, now)
    _mark_sent(db_session, ACC, "task", 10, fire_at)
    assert not _should_send(db_session, ACC, "task", 10, fire_at, now)


def test_other_time_still_fires(db_session):
    """Второе напоминание той же задачи на другое время — отдельное событие."""
    now = _now()
    first = now - timedelta(minutes=30)
    _mark_sent(db_session, ACC, "task", 10, first)
    assert _should_send(db_session, ACC, "task", 10, now - timedelta(minutes=1), now)


def test_kinds_do_not_collide(db_session):
    now = _now()
    fire_at = now - timedelta(minutes=1)
    _mark_sent(db_session, ACC, "task", 10, fire_at)
    assert _should_send(db_session, ACC, "event", 10, fire_at, now)
