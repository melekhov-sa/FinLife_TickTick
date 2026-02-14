"""
Tests for events application layer - queries, idempotency, filters
"""
import pytest
from datetime import date, time, timedelta

from app.infrastructure.db.models import (
    CalendarEventModel, EventOccurrenceModel, WorkCategory,
)
from app.application.events import (
    get_today_events, get_7days_events, get_history_events,
)


@pytest.fixture
def setup_work_category(db_session, sample_account_id):
    """Create a work category for events."""
    wc = WorkCategory(
        category_id=100,
        account_id=sample_account_id,
        title="Праздники",
        emoji="🎉",
        is_archived=False,
    )
    db_session.add(wc)
    db_session.flush()
    return wc


@pytest.fixture
def setup_event(db_session, sample_account_id, setup_work_category):
    """Create a calendar event."""
    ev = CalendarEventModel(
        event_id=1,
        account_id=sample_account_id,
        title="День рождения",
        category_id=setup_work_category.category_id,
        importance=2,
        is_active=True,
    )
    db_session.add(ev)
    db_session.flush()
    return ev


def _add_occurrence(db_session, account_id, event_id, start_date,
                    start_time=None, end_date=None, end_time=None,
                    is_cancelled=False, source="manual"):
    occ = EventOccurrenceModel(
        account_id=account_id,
        event_id=event_id,
        start_date=start_date,
        start_time=start_time,
        end_date=end_date,
        end_time=end_time,
        is_cancelled=is_cancelled,
        source=source,
    )
    db_session.add(occ)
    db_session.flush()
    return occ


# --- Today filter tests ---

class TestGetTodayEvents:
    def test_today_exact_match(self, db_session, sample_account_id, setup_event):
        """Occurrence with start_date == today shows up."""
        today = date(2026, 3, 15)
        _add_occurrence(db_session, sample_account_id, setup_event.event_id, today)

        result = get_today_events(db_session, sample_account_id, today)
        assert len(result) == 1
        assert result[0].start_date == today

    def test_today_excludes_past(self, db_session, sample_account_id, setup_event):
        """Occurrence with start_date < today does NOT show (no overdue)."""
        today = date(2026, 3, 15)
        yesterday = today - timedelta(days=1)
        _add_occurrence(db_session, sample_account_id, setup_event.event_id, yesterday)

        result = get_today_events(db_session, sample_account_id, today)
        assert len(result) == 0

    def test_today_excludes_future(self, db_session, sample_account_id, setup_event):
        """Occurrence with start_date > today does NOT show in today."""
        today = date(2026, 3, 15)
        tomorrow = today + timedelta(days=1)
        _add_occurrence(db_session, sample_account_id, setup_event.event_id, tomorrow)

        result = get_today_events(db_session, sample_account_id, today)
        assert len(result) == 0

    def test_today_period_spanning(self, db_session, sample_account_id, setup_event):
        """Period event spanning today shows up."""
        today = date(2026, 3, 15)
        _add_occurrence(
            db_session, sample_account_id, setup_event.event_id,
            start_date=date(2026, 3, 14),
            end_date=date(2026, 3, 16),
        )

        result = get_today_events(db_session, sample_account_id, today)
        assert len(result) == 1

    def test_today_period_ended_yesterday(self, db_session, sample_account_id, setup_event):
        """Period event that ended yesterday doesn't show."""
        today = date(2026, 3, 15)
        _add_occurrence(
            db_session, sample_account_id, setup_event.event_id,
            start_date=date(2026, 3, 12),
            end_date=date(2026, 3, 14),
        )

        result = get_today_events(db_session, sample_account_id, today)
        assert len(result) == 0

    def test_today_excludes_cancelled(self, db_session, sample_account_id, setup_event):
        """Cancelled occurrences are excluded from today."""
        today = date(2026, 3, 15)
        _add_occurrence(
            db_session, sample_account_id, setup_event.event_id,
            start_date=today, is_cancelled=True,
        )

        result = get_today_events(db_session, sample_account_id, today)
        assert len(result) == 0


# --- 7 days filter tests ---

class TestGet7DaysEvents:
    def test_7days_includes_today(self, db_session, sample_account_id, setup_event):
        """Today is included in 7-day window."""
        today = date(2026, 3, 15)
        _add_occurrence(db_session, sample_account_id, setup_event.event_id, today)

        result = get_7days_events(db_session, sample_account_id, today)
        assert len(result) == 1

    def test_7days_includes_7th_day(self, db_session, sample_account_id, setup_event):
        """Day today+7 is included in 7-day window."""
        today = date(2026, 3, 15)
        day7 = today + timedelta(days=7)
        _add_occurrence(db_session, sample_account_id, setup_event.event_id, day7)

        result = get_7days_events(db_session, sample_account_id, today)
        assert len(result) == 1

    def test_7days_excludes_day8(self, db_session, sample_account_id, setup_event):
        """Day today+8 is NOT in 7-day window."""
        today = date(2026, 3, 15)
        day8 = today + timedelta(days=8)
        _add_occurrence(db_session, sample_account_id, setup_event.event_id, day8)

        result = get_7days_events(db_session, sample_account_id, today)
        assert len(result) == 0

    def test_7days_period_intersecting(self, db_session, sample_account_id, setup_event):
        """Period event that intersects 7-day window shows up."""
        today = date(2026, 3, 15)
        _add_occurrence(
            db_session, sample_account_id, setup_event.event_id,
            start_date=date(2026, 3, 10),
            end_date=date(2026, 3, 16),
        )

        result = get_7days_events(db_session, sample_account_id, today)
        assert len(result) == 1

    def test_7days_excludes_cancelled(self, db_session, sample_account_id, setup_event):
        """Cancelled occurrences excluded from 7-day window."""
        today = date(2026, 3, 15)
        _add_occurrence(
            db_session, sample_account_id, setup_event.event_id,
            start_date=today, is_cancelled=True,
        )

        result = get_7days_events(db_session, sample_account_id, today)
        assert len(result) == 0


# --- History filter tests ---

class TestGetHistoryEvents:
    def test_history_past_event(self, db_session, sample_account_id, setup_event):
        """Past event (start_date < today, no end_date) shows in history."""
        today = date(2026, 3, 15)
        _add_occurrence(
            db_session, sample_account_id, setup_event.event_id,
            start_date=date(2026, 3, 10),
        )

        result = get_history_events(db_session, sample_account_id, today)
        assert len(result) == 1

    def test_history_excludes_today(self, db_session, sample_account_id, setup_event):
        """Today's event is NOT in history."""
        today = date(2026, 3, 15)
        _add_occurrence(db_session, sample_account_id, setup_event.event_id, today)

        result = get_history_events(db_session, sample_account_id, today)
        assert len(result) == 0

    def test_history_period_still_active_excluded(self, db_session, sample_account_id, setup_event):
        """Period spanning today is NOT in history (end_date >= today)."""
        today = date(2026, 3, 15)
        _add_occurrence(
            db_session, sample_account_id, setup_event.event_id,
            start_date=date(2026, 3, 14),
            end_date=date(2026, 3, 16),
        )

        result = get_history_events(db_session, sample_account_id, today)
        assert len(result) == 0

    def test_history_includes_cancelled(self, db_session, sample_account_id, setup_event):
        """Cancelled past events appear in history."""
        today = date(2026, 3, 15)
        _add_occurrence(
            db_session, sample_account_id, setup_event.event_id,
            start_date=date(2026, 3, 10),
            is_cancelled=True,
        )

        result = get_history_events(db_session, sample_account_id, today)
        assert len(result) == 1

    def test_history_ordered_desc(self, db_session, sample_account_id, setup_event):
        """History is ordered by start_date descending."""
        today = date(2026, 3, 15)
        _add_occurrence(db_session, sample_account_id, setup_event.event_id, date(2026, 3, 10))
        _add_occurrence(db_session, sample_account_id, setup_event.event_id, date(2026, 3, 12))
        _add_occurrence(db_session, sample_account_id, setup_event.event_id, date(2026, 3, 8))

        result = get_history_events(db_session, sample_account_id, today)
        assert len(result) == 3
        assert result[0].start_date == date(2026, 3, 12)
        assert result[1].start_date == date(2026, 3, 10)
        assert result[2].start_date == date(2026, 3, 8)


# --- Idempotency test ---

class TestIdempotency:
    def test_duplicate_occurrence_same_source(self, db_session, sample_account_id, setup_event):
        """Two occurrences with same (account_id, event_id, start_date, source) should fail unique constraint."""
        today = date(2026, 3, 15)
        _add_occurrence(db_session, sample_account_id, setup_event.event_id, today, source="rule")

        with pytest.raises(Exception):  # IntegrityError
            _add_occurrence(db_session, sample_account_id, setup_event.event_id, today, source="rule")
            db_session.flush()

    def test_different_source_allowed(self, db_session, sample_account_id, setup_event):
        """Same date with different source is allowed."""
        today = date(2026, 3, 15)
        _add_occurrence(db_session, sample_account_id, setup_event.event_id, today, source="rule")
        _add_occurrence(db_session, sample_account_id, setup_event.event_id, today, source="manual")

        result = db_session.query(EventOccurrenceModel).filter(
            EventOccurrenceModel.event_id == setup_event.event_id,
            EventOccurrenceModel.start_date == today,
        ).all()
        assert len(result) == 2
