"""Tests for events API — creation, validation, and listing."""
from datetime import date, time, timedelta
import pytest
from sqlalchemy.orm import Session
from app.infrastructure.db.models import (
    CalendarEventModel, EventOccurrenceModel, WorkCategory,
)

ACCT = 1


def _category(db: Session, **kw) -> WorkCategory:
    defaults = dict(
        account_id=ACCT, title="Работа", emoji="💼",
        is_archived=False,
    )
    defaults.update(kw)
    cat = WorkCategory(**defaults)
    db.add(cat)
    db.flush()
    return cat


def _event(db: Session, **kw) -> CalendarEventModel:
    cnt = db.query(CalendarEventModel).count()
    defaults = dict(
        event_id=cnt + 100,
        account_id=ACCT,
        title=f"Event {cnt + 1}",
        category_id=1,
        is_active=True,
    )
    defaults.update(kw)
    ev = CalendarEventModel(**defaults)
    db.add(ev)
    db.flush()
    return ev


def _occurrence(db: Session, event_id: int, **kw) -> EventOccurrenceModel:
    defaults = dict(
        account_id=ACCT,
        event_id=event_id,
        start_date=date.today(),
        is_cancelled=False,
        source="manual",
    )
    defaults.update(kw)
    occ = EventOccurrenceModel(**defaults)
    db.add(occ)
    db.flush()
    return occ


# ── Model-level tests ─────────────────────────────────────────────────────────


class TestEventOccurrenceModel:
    """Test that EventOccurrenceModel correctly stores all field combinations."""

    def test_create_with_all_fields(self, db_session: Session):
        cat = _category(db_session)
        ev = _event(db_session, category_id=cat.category_id)
        occ = _occurrence(
            db_session, ev.event_id,
            start_date=date(2026, 4, 4),
            start_time=time(15, 15),
            end_date=date(2026, 4, 5),
        )
        db_session.commit()

        loaded = db_session.query(EventOccurrenceModel).filter_by(id=occ.id).one()
        assert loaded.start_date == date(2026, 4, 4)
        assert loaded.start_time == time(15, 15)
        assert loaded.end_date == date(2026, 4, 5)
        assert loaded.is_cancelled is False

    def test_create_without_end_date(self, db_session: Session):
        """Event without end_date should be valid — it's a single-day timed event."""
        cat = _category(db_session)
        ev = _event(db_session, category_id=cat.category_id)
        occ = _occurrence(
            db_session, ev.event_id,
            start_date=date(2026, 4, 4),
            start_time=time(15, 15),
            end_date=None,
        )
        db_session.commit()

        loaded = db_session.query(EventOccurrenceModel).filter_by(id=occ.id).one()
        assert loaded.start_date == date(2026, 4, 4)
        assert loaded.start_time == time(15, 15)
        assert loaded.end_date is None

    def test_create_all_day_event(self, db_session: Session):
        """All-day event: start_time=None, end_date=None."""
        cat = _category(db_session)
        ev = _event(db_session, category_id=cat.category_id)
        occ = _occurrence(
            db_session, ev.event_id,
            start_date=date(2026, 4, 4),
            start_time=None,
            end_date=None,
        )
        db_session.commit()

        loaded = db_session.query(EventOccurrenceModel).filter_by(id=occ.id).one()
        assert loaded.start_time is None
        assert loaded.end_date is None

    def test_cancelled_event_excluded(self, db_session: Session):
        """Cancelled events should not appear in active queries."""
        cat = _category(db_session)
        ev = _event(db_session, category_id=cat.category_id)
        occ = _occurrence(
            db_session, ev.event_id,
            start_date=date.today(),
            is_cancelled=True,
        )
        db_session.commit()

        active = db_session.query(EventOccurrenceModel).filter(
            EventOccurrenceModel.account_id == ACCT,
            EventOccurrenceModel.is_cancelled == False,
        ).all()
        assert occ.id not in [o.id for o in active]


# ── Listing / filtering tests ─────────────────────────────────────────────────


class TestEventListing:
    """Test the same query logic used by GET /api/v2/events."""

    def _query_events(self, db: Session, days: int = 30):
        """Replicate the API query logic."""
        today = date.today()
        until = today + timedelta(days=days)
        return (
            db.query(EventOccurrenceModel)
            .filter(
                EventOccurrenceModel.account_id == ACCT,
                EventOccurrenceModel.start_date >= today - timedelta(days=7),
                EventOccurrenceModel.start_date <= until,
                EventOccurrenceModel.is_cancelled == False,
            )
            .order_by(EventOccurrenceModel.start_date)
            .all()
        )

    def test_future_event_without_end_date_visible(self, db_session: Session):
        """An event with start_date in 18 days and no end_date MUST appear."""
        cat = _category(db_session)
        ev = _event(db_session, category_id=cat.category_id)
        future = date.today() + timedelta(days=18)
        occ = _occurrence(
            db_session, ev.event_id,
            start_date=future,
            start_time=time(15, 15),
            end_date=None,
        )
        db_session.commit()

        results = self._query_events(db_session)
        assert len(results) == 1
        assert results[0].id == occ.id

    def test_today_event_visible(self, db_session: Session):
        cat = _category(db_session)
        ev = _event(db_session, category_id=cat.category_id)
        occ = _occurrence(
            db_session, ev.event_id,
            start_date=date.today(),
            start_time=time(10, 0),
        )
        db_session.commit()

        results = self._query_events(db_session)
        assert len(results) == 1

    def test_past_event_within_7days_visible(self, db_session: Session):
        cat = _category(db_session)
        ev = _event(db_session, category_id=cat.category_id)
        occ = _occurrence(
            db_session, ev.event_id,
            start_date=date.today() - timedelta(days=5),
        )
        db_session.commit()

        results = self._query_events(db_session)
        assert len(results) == 1

    def test_past_event_beyond_7days_hidden(self, db_session: Session):
        cat = _category(db_session)
        ev = _event(db_session, category_id=cat.category_id)
        _occurrence(
            db_session, ev.event_id,
            start_date=date.today() - timedelta(days=10),
        )
        db_session.commit()

        results = self._query_events(db_session)
        assert len(results) == 0

    def test_cancelled_event_hidden(self, db_session: Session):
        cat = _category(db_session)
        ev = _event(db_session, category_id=cat.category_id)
        _occurrence(
            db_session, ev.event_id,
            start_date=date.today() + timedelta(days=5),
            is_cancelled=True,
        )
        db_session.commit()

        results = self._query_events(db_session)
        assert len(results) == 0

    def test_event_beyond_range_hidden(self, db_session: Session):
        cat = _category(db_session)
        ev = _event(db_session, category_id=cat.category_id)
        _occurrence(
            db_session, ev.event_id,
            start_date=date.today() + timedelta(days=35),
        )
        db_session.commit()

        results = self._query_events(db_session, days=30)
        assert len(results) == 0

    def test_multiple_events_sorted(self, db_session: Session):
        cat = _category(db_session)
        ev = _event(db_session, category_id=cat.category_id)
        d1 = date.today() + timedelta(days=10)
        d2 = date.today() + timedelta(days=2)
        d3 = date.today() + timedelta(days=20)
        _occurrence(db_session, ev.event_id, start_date=d1)
        _occurrence(db_session, ev.event_id, start_date=d2)
        _occurrence(db_session, ev.event_id, start_date=d3)
        db_session.commit()

        results = self._query_events(db_session)
        assert len(results) == 3
        assert results[0].start_date == d2
        assert results[1].start_date == d1
        assert results[2].start_date == d3


# ── Validation tests ──────────────────────────────────────────────────────────


class TestEventValidation:
    """Test validate_event_form() for proper error messages."""

    def test_empty_title_rejected(self):
        from app.application.events import validate_event_form
        err = validate_event_form(event_type="onetime", title="", start_date="2026-04-04")
        assert err is not None
        assert "Название" in err

    def test_whitespace_title_rejected(self):
        from app.application.events import validate_event_form
        err = validate_event_form(event_type="onetime", title="   ", start_date="2026-04-04")
        assert err is not None

    def test_onetime_without_date_rejected(self):
        from app.application.events import validate_event_form
        err = validate_event_form(event_type="onetime", title="Встреча", start_date="")
        assert err is not None
        assert "Дата" in err

    def test_valid_onetime_accepted(self):
        from app.application.events import validate_event_form
        err = validate_event_form(event_type="onetime", title="Встреча", start_date="2026-04-04")
        assert err is None

    def test_recurring_weekly_without_weekdays_rejected(self):
        from app.application.events import validate_event_form
        err = validate_event_form(
            event_type="recurring", title="Спорт",
            recurrence_type="weekly", rec_weekdays=[],
        )
        assert err is not None
        assert "день" in err.lower()

    def test_recurring_monthly_without_day_rejected(self):
        from app.application.events import validate_event_form
        err = validate_event_form(
            event_type="recurring", title="Оплата",
            recurrence_type="monthly", rec_day=None,
        )
        assert err is not None

    def test_invalid_event_type_rejected(self):
        from app.application.events import validate_event_form
        err = validate_event_form(event_type="unknown", title="Test", start_date="2026-01-01")
        assert err is not None


# ── Dashboard "today" block event query tests ────────────────────────────────


class TestDashboardTodayEvents:
    """Test the dashboard query logic for today's events."""

    def _query_today_events(self, db: Session):
        """Replicate dashboard _collect_events_today logic."""
        from sqlalchemy import or_, and_
        today = date.today()
        return (
            db.query(EventOccurrenceModel)
            .filter(
                EventOccurrenceModel.account_id == ACCT,
                EventOccurrenceModel.is_cancelled == False,
                or_(
                    EventOccurrenceModel.start_date == today,
                    and_(
                        EventOccurrenceModel.start_date <= today,
                        EventOccurrenceModel.end_date != None,
                        EventOccurrenceModel.end_date >= today,
                    ),
                ),
            )
            .all()
        )

    def test_today_event_no_end_date_visible(self, db_session: Session):
        """Event starting today with no end_date should appear in today block."""
        cat = _category(db_session)
        ev = _event(db_session, category_id=cat.category_id)
        occ = _occurrence(
            db_session, ev.event_id,
            start_date=date.today(),
            start_time=time(15, 15),
            end_date=None,
        )
        db_session.commit()

        results = self._query_today_events(db_session)
        assert len(results) == 1

    def test_multi_day_event_spanning_today_visible(self, db_session: Session):
        """A multi-day event that started yesterday and ends tomorrow should appear."""
        cat = _category(db_session)
        ev = _event(db_session, category_id=cat.category_id)
        occ = _occurrence(
            db_session, ev.event_id,
            start_date=date.today() - timedelta(days=1),
            end_date=date.today() + timedelta(days=1),
        )
        db_session.commit()

        results = self._query_today_events(db_session)
        assert len(results) == 1

    def test_yesterday_event_no_end_date_NOT_visible(self, db_session: Session):
        """An event from yesterday with no end_date should NOT appear in today."""
        cat = _category(db_session)
        ev = _event(db_session, category_id=cat.category_id)
        _occurrence(
            db_session, ev.event_id,
            start_date=date.today() - timedelta(days=1),
            end_date=None,
        )
        db_session.commit()

        results = self._query_today_events(db_session)
        assert len(results) == 0

    def test_future_event_NOT_in_today(self, db_session: Session):
        """A future event should NOT appear in today block."""
        cat = _category(db_session)
        ev = _event(db_session, category_id=cat.category_id)
        _occurrence(
            db_session, ev.event_id,
            start_date=date.today() + timedelta(days=5),
            end_date=None,
        )
        db_session.commit()

        results = self._query_today_events(db_session)
        assert len(results) == 0
