"""
Tests for CalendarEvent and EventOccurrenceEvent domain entities
"""
import pytest
from datetime import datetime, date, time, timedelta, timezone

from app.domain.event import CalendarEvent
from app.domain.event_occurrence import EventOccurrenceEvent
from app.application.events import (
    validate_reminder_mode, EventValidationError,
    compute_event_start_dt, MSK, ALL_DAY_START_HOUR,
)


# --- CalendarEvent domain tests ---

def test_calendar_event_create_minimal():
    """Create event with required fields only."""
    payload = CalendarEvent.create(
        account_id=1, event_id=10, title="День рождения", category_id=5,
    )
    assert payload["account_id"] == 1
    assert payload["event_id"] == 10
    assert payload["title"] == "День рождения"
    assert payload["category_id"] == 5
    assert payload["importance"] == 0
    assert payload["repeat_rule_id"] is None
    assert "created_at" in payload


def test_calendar_event_create_full():
    """Create event with all fields."""
    payload = CalendarEvent.create(
        account_id=1, event_id=11, title="Встреча", category_id=3,
        description="Zoom-звонок", importance=3, repeat_rule_id=7,
    )
    assert payload["description"] == "Zoom-звонок"
    assert payload["importance"] == 3
    assert payload["repeat_rule_id"] == 7


def test_calendar_event_update():
    """Update event returns only changed fields + event_id."""
    payload = CalendarEvent.update(event_id=10, title="Новое название", importance=2)
    assert payload["event_id"] == 10
    assert payload["title"] == "Новое название"
    assert payload["importance"] == 2
    assert "updated_at" in payload
    assert "description" not in payload  # not changed


def test_calendar_event_deactivate():
    """Deactivate sets is_active=False."""
    payload = CalendarEvent.deactivate(event_id=10)
    assert payload["event_id"] == 10
    assert payload["is_active"] is False
    assert "deactivated_at" in payload


# --- EventOccurrenceEvent domain tests ---

def test_occurrence_create_all_day():
    """Create all-day occurrence (no time)."""
    payload = EventOccurrenceEvent.create(
        event_id=10, occurrence_id=100, account_id=1,
        start_date="2026-03-15",
    )
    assert payload["event_id"] == 10
    assert payload["occurrence_id"] == 100
    assert payload["start_date"] == "2026-03-15"
    assert payload["start_time"] is None
    assert payload["end_date"] is None
    assert payload["source"] == "manual"


def test_occurrence_create_with_time_and_period():
    """Create occurrence with time and end date."""
    payload = EventOccurrenceEvent.create(
        event_id=10, occurrence_id=101, account_id=1,
        start_date="2026-03-15", start_time="14:00",
        end_date="2026-03-16", end_time="10:00",
        source="rule",
    )
    assert payload["start_time"] == "14:00"
    assert payload["end_date"] == "2026-03-16"
    assert payload["end_time"] == "10:00"
    assert payload["source"] == "rule"


def test_occurrence_update():
    """Update occurrence returns only changed fields."""
    payload = EventOccurrenceEvent.update(
        occurrence_id=100, start_date="2026-04-01", end_date="2026-04-02",
    )
    assert payload["occurrence_id"] == 100
    assert payload["start_date"] == "2026-04-01"
    assert payload["end_date"] == "2026-04-02"
    assert "start_time" not in payload


def test_occurrence_cancel():
    """Cancel occurrence."""
    payload = EventOccurrenceEvent.cancel(event_id=10, occurrence_id=100)
    assert payload["event_id"] == 10
    assert payload["occurrence_id"] == 100
    assert payload["is_cancelled"] is True
    assert "cancelled_at" in payload


# --- Reminder validation ---

def test_validate_reminder_offset_ok():
    """Offset mode with offset_minutes is valid."""
    validate_reminder_mode("offset", offset_minutes=30, fixed_time=None)


def test_validate_reminder_offset_missing_minutes():
    """Offset mode requires offset_minutes."""
    with pytest.raises(EventValidationError, match="offset_minutes"):
        validate_reminder_mode("offset", offset_minutes=None, fixed_time=None)


def test_validate_reminder_offset_with_fixed_time_fails():
    """Offset mode must not have fixed_time."""
    with pytest.raises(EventValidationError, match="fixed_time"):
        validate_reminder_mode("offset", offset_minutes=30, fixed_time="09:00")


def test_validate_reminder_fixed_time_ok():
    """Fixed_time mode with fixed_time value is valid."""
    validate_reminder_mode("fixed_time", offset_minutes=None, fixed_time="08:00")


def test_validate_reminder_fixed_time_missing():
    """Fixed_time mode requires fixed_time."""
    with pytest.raises(EventValidationError, match="fixed_time"):
        validate_reminder_mode("fixed_time", offset_minutes=None, fixed_time=None)


def test_validate_reminder_fixed_time_with_offset_fails():
    """Fixed_time mode must not have offset_minutes."""
    with pytest.raises(EventValidationError, match="offset_minutes"):
        validate_reminder_mode("fixed_time", offset_minutes=15, fixed_time="08:00")


def test_validate_reminder_invalid_mode():
    """Invalid mode raises error."""
    with pytest.raises(EventValidationError, match="Неверный режим"):
        validate_reminder_mode("push", offset_minutes=None, fixed_time=None)


# --- All-day start_dt = 09:00 MSK ---

def test_compute_start_dt_all_day():
    """All-day event uses 09:00 MSK."""
    dt = compute_event_start_dt(date(2026, 3, 15), None)
    assert dt.hour == ALL_DAY_START_HOUR
    assert dt.minute == 0
    assert dt.tzinfo == MSK


def test_compute_start_dt_with_time():
    """Event with explicit time uses that time in MSK."""
    dt = compute_event_start_dt(date(2026, 3, 15), time(14, 30))
    assert dt.hour == 14
    assert dt.minute == 30
    assert dt.tzinfo == MSK
