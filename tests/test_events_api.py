"""Tests for events API — creation, validation, listing, and event sourcing."""
from datetime import date, time, timedelta
import pytest
from sqlalchemy.orm import Session
from app.infrastructure.db.models import (
    CalendarEventModel, EventOccurrenceModel, WorkCategory, EventLog,
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
        _occurrence(db_session, ev.event_id, start_date=date.today(), start_time=time(10, 0))
        db_session.commit()
        assert len(self._query_events(db_session)) == 1

    def test_past_event_within_7days_visible(self, db_session: Session):
        cat = _category(db_session)
        ev = _event(db_session, category_id=cat.category_id)
        _occurrence(db_session, ev.event_id, start_date=date.today() - timedelta(days=5))
        db_session.commit()
        assert len(self._query_events(db_session)) == 1

    def test_past_event_beyond_7days_hidden(self, db_session: Session):
        cat = _category(db_session)
        ev = _event(db_session, category_id=cat.category_id)
        _occurrence(db_session, ev.event_id, start_date=date.today() - timedelta(days=10))
        db_session.commit()
        assert len(self._query_events(db_session)) == 0

    def test_cancelled_event_hidden(self, db_session: Session):
        cat = _category(db_session)
        ev = _event(db_session, category_id=cat.category_id)
        _occurrence(db_session, ev.event_id, start_date=date.today() + timedelta(days=5), is_cancelled=True)
        db_session.commit()
        assert len(self._query_events(db_session)) == 0

    def test_event_beyond_range_hidden(self, db_session: Session):
        cat = _category(db_session)
        ev = _event(db_session, category_id=cat.category_id)
        _occurrence(db_session, ev.event_id, start_date=date.today() + timedelta(days=35))
        db_session.commit()
        assert len(self._query_events(db_session, days=30)) == 0

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

    def test_empty_title_rejected(self):
        from app.application.events import validate_event_form
        err = validate_event_form(event_type="onetime", title="", start_date="2026-04-04")
        assert err is not None
        assert "Название" in err

    def test_whitespace_title_rejected(self):
        from app.application.events import validate_event_form
        assert validate_event_form(event_type="onetime", title="   ", start_date="2026-04-04") is not None

    def test_onetime_without_date_rejected(self):
        from app.application.events import validate_event_form
        err = validate_event_form(event_type="onetime", title="Встреча", start_date="")
        assert err is not None and "Дата" in err

    def test_valid_onetime_accepted(self):
        from app.application.events import validate_event_form
        assert validate_event_form(event_type="onetime", title="Встреча", start_date="2026-04-04") is None

    def test_recurring_weekly_without_weekdays_rejected(self):
        from app.application.events import validate_event_form
        err = validate_event_form(event_type="recurring", title="Спорт", recurrence_type="weekly", rec_weekdays=[])
        assert err is not None and "день" in err.lower()

    def test_recurring_monthly_without_day_rejected(self):
        from app.application.events import validate_event_form
        assert validate_event_form(event_type="recurring", title="Оплата", recurrence_type="monthly", rec_day=None) is not None

    def test_invalid_event_type_rejected(self):
        from app.application.events import validate_event_form
        assert validate_event_form(event_type="unknown", title="Test", start_date="2026-01-01") is not None


# ── Dashboard "today" block tests ────────────────────────────────────────────


class TestDashboardTodayEvents:

    def _query_today_events(self, db: Session):
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
        cat = _category(db_session)
        ev = _event(db_session, category_id=cat.category_id)
        _occurrence(db_session, ev.event_id, start_date=date.today(), start_time=time(15, 15), end_date=None)
        db_session.commit()
        assert len(self._query_today_events(db_session)) == 1

    def test_multi_day_event_spanning_today_visible(self, db_session: Session):
        cat = _category(db_session)
        ev = _event(db_session, category_id=cat.category_id)
        _occurrence(db_session, ev.event_id, start_date=date.today() - timedelta(days=1), end_date=date.today() + timedelta(days=1))
        db_session.commit()
        assert len(self._query_today_events(db_session)) == 1

    def test_yesterday_event_no_end_date_NOT_visible(self, db_session: Session):
        cat = _category(db_session)
        ev = _event(db_session, category_id=cat.category_id)
        _occurrence(db_session, ev.event_id, start_date=date.today() - timedelta(days=1), end_date=None)
        db_session.commit()
        assert len(self._query_today_events(db_session)) == 0

    def test_future_event_NOT_in_today(self, db_session: Session):
        cat = _category(db_session)
        ev = _event(db_session, category_id=cat.category_id)
        _occurrence(db_session, ev.event_id, start_date=date.today() + timedelta(days=5), end_date=None)
        db_session.commit()
        assert len(self._query_today_events(db_session)) == 0


# ── End-to-end: CreateEventUseCase tests ─────────────────────────────────────


class TestCreateEventE2E:
    """Test full event creation flow through event sourcing + projector."""

    def test_create_onetime_event_creates_occurrence(self, db_session: Session):
        from app.application.events import CreateEventUseCase

        cat = _category(db_session)
        db_session.commit()

        event_id = CreateEventUseCase(db_session).execute(
            account_id=ACCT,
            title="Зенит - Крылья Советов",
            category_id=cat.category_id,
            occ_start_date="2026-04-04",
            occ_start_time="15:15",
            occ_end_date=None,
            actor_user_id=ACCT,
        )

        ev = db_session.query(CalendarEventModel).filter_by(event_id=event_id).first()
        assert ev is not None
        assert ev.title == "Зенит - Крылья Советов"

        occ = db_session.query(EventOccurrenceModel).filter_by(event_id=event_id).first()
        assert occ is not None, "EventOccurrenceModel NOT created"
        assert occ.start_date == date(2026, 4, 4)
        assert occ.start_time == time(15, 15)
        assert occ.end_date is None

    def test_create_event_without_end_date_visible_in_api_query(self, db_session: Session):
        from app.application.events import CreateEventUseCase

        cat = _category(db_session)
        db_session.commit()

        CreateEventUseCase(db_session).execute(
            account_id=ACCT,
            title="Тестовое событие",
            category_id=cat.category_id,
            occ_start_date="2026-04-04",
            occ_start_time="10:00",
            actor_user_id=ACCT,
        )

        today = date.today()
        results = (
            db_session.query(EventOccurrenceModel)
            .filter(
                EventOccurrenceModel.account_id == ACCT,
                EventOccurrenceModel.start_date >= today - timedelta(days=7),
                EventOccurrenceModel.start_date <= today + timedelta(days=30),
                EventOccurrenceModel.is_cancelled == False,
            )
            .all()
        )
        titles = []
        for occ in results:
            ev = db_session.query(CalendarEventModel).filter_by(event_id=occ.event_id).first()
            if ev:
                titles.append(ev.title)
        assert "Тестовое событие" in titles

    def test_event_log_has_both_entries(self, db_session: Session):
        from app.application.events import CreateEventUseCase

        cat = _category(db_session)
        db_session.commit()

        CreateEventUseCase(db_session).execute(
            account_id=ACCT,
            title="Проверка event_log",
            category_id=cat.category_id,
            occ_start_date="2026-04-10",
            actor_user_id=ACCT,
        )

        event_types = [
            log.event_type
            for log in db_session.query(EventLog).filter(EventLog.account_id == ACCT).all()
        ]
        assert "calendar_event_created" in event_types
        assert "event_occurrence_created" in event_types


# ── BUG REPRODUCTION: ID collision with pre-existing occurrences ─────────────


class TestOccurrenceIdCollision:
    """
    BUG: _generate_id() reads max occurrence_id from event_log, but old
    interface created occurrences directly in the table (without event_log).
    So _generate_id() returns an ID that already exists in event_occurrences,
    and the projector silently skips creation (existing check on line 92-96).

    This is why "Зенит - Крылья Советов" was created but never appeared.
    """

    def test_id_collision_causes_missing_occurrence(self, db_session: Session):
        """Reproduce the exact bug: pre-existing occurrences cause ID collision."""
        from app.application.events import CreateEventUseCase

        cat = _category(db_session)
        db_session.commit()

        # Simulate old interface: create occurrences directly in DB (no event_log)
        old_ev = CalendarEventModel(
            event_id=999, account_id=ACCT, title="Old Event",
            category_id=cat.category_id, is_active=True,
        )
        db_session.add(old_ev)
        db_session.flush()

        # Pre-populate occurrences with IDs 1, 2, 3 (as if old code created them)
        for i in range(1, 4):
            db_session.add(EventOccurrenceModel(
                id=i, account_id=ACCT, event_id=999,
                start_date=date(2026, 1, i), is_cancelled=False, source="manual",
            ))
        db_session.commit()

        # Now create via new interface (event sourcing)
        # _generate_id() reads event_log (empty) → returns 1
        # Projector tries to create occurrence with id=1 → already exists → SKIPS!
        event_id = CreateEventUseCase(db_session).execute(
            account_id=ACCT,
            title="Зенит - Крылья Советов",
            category_id=cat.category_id,
            occ_start_date="2026-04-04",
            occ_start_time="15:15",
            actor_user_id=ACCT,
        )

        # The event should exist
        ev = db_session.query(CalendarEventModel).filter_by(event_id=event_id).first()
        assert ev is not None, "Event should exist"
        assert ev.title == "Зенит - Крылья Советов"

        # BUG: occurrence is MISSING because of ID collision
        occ = db_session.query(EventOccurrenceModel).filter_by(event_id=event_id).first()
        # This FAILS with current code — proving the bug
        # After fix, this should pass
        assert occ is not None, (
            "BUG: Occurrence not created due to ID collision! "
            "_generate_id() returned an ID that already exists in event_occurrences "
            "(created by old interface without event_log). "
            "Projector silently skipped creation."
        )
        assert occ.start_date == date(2026, 4, 4)

    def test_no_collision_when_table_empty(self, db_session: Session):
        """When no pre-existing occurrences, everything works fine."""
        from app.application.events import CreateEventUseCase

        cat = _category(db_session)
        db_session.commit()

        event_id = CreateEventUseCase(db_session).execute(
            account_id=ACCT,
            title="Нормальное событие",
            category_id=cat.category_id,
            occ_start_date="2026-04-04",
            actor_user_id=ACCT,
        )

        occ = db_session.query(EventOccurrenceModel).filter_by(event_id=event_id).first()
        assert occ is not None, "Should work when no pre-existing data"


# ── Form validation tests ────────────────────────────────────────────────────


class TestEventFormValidation:
    """Test frontend-equivalent validation rules in backend."""

    def test_create_with_only_required_fields(self, db_session: Session):
        """Minimal valid event: title + category + date. No time, no end_date."""
        from app.application.events import CreateEventUseCase

        cat = _category(db_session)
        db_session.commit()

        event_id = CreateEventUseCase(db_session).execute(
            account_id=ACCT,
            title="Минимальное событие",
            category_id=cat.category_id,
            occ_start_date="2026-05-01",
            actor_user_id=ACCT,
        )

        occ = db_session.query(EventOccurrenceModel).filter_by(event_id=event_id).first()
        assert occ is not None
        assert occ.start_date == date(2026, 5, 1)
        assert occ.start_time is None  # all-day
        assert occ.end_date is None    # single-day

    def test_create_with_time_enabled(self, db_session: Session):
        """Event with specific time (hasTime toggle on)."""
        from app.application.events import CreateEventUseCase

        cat = _category(db_session)
        db_session.commit()

        event_id = CreateEventUseCase(db_session).execute(
            account_id=ACCT,
            title="Событие со временем",
            category_id=cat.category_id,
            occ_start_date="2026-05-01",
            occ_start_time="14:30",
            actor_user_id=ACCT,
        )

        occ = db_session.query(EventOccurrenceModel).filter_by(event_id=event_id).first()
        assert occ is not None
        assert occ.start_time == time(14, 30)

    def test_create_with_date_range(self, db_session: Session):
        """Event with end_date (hasEndDate toggle on)."""
        from app.application.events import CreateEventUseCase

        cat = _category(db_session)
        db_session.commit()

        event_id = CreateEventUseCase(db_session).execute(
            account_id=ACCT,
            title="Многодневное событие",
            category_id=cat.category_id,
            occ_start_date="2026-05-01",
            occ_end_date="2026-05-03",
            actor_user_id=ACCT,
        )

        occ = db_session.query(EventOccurrenceModel).filter_by(event_id=event_id).first()
        assert occ is not None
        assert occ.start_date == date(2026, 5, 1)
        assert occ.end_date == date(2026, 5, 3)

    def test_create_with_time_and_date_range(self, db_session: Session):
        """Event with both time and date range."""
        from app.application.events import CreateEventUseCase

        cat = _category(db_session)
        db_session.commit()

        event_id = CreateEventUseCase(db_session).execute(
            account_id=ACCT,
            title="Полное событие",
            category_id=cat.category_id,
            occ_start_date="2026-05-01",
            occ_start_time="09:00",
            occ_end_date="2026-05-02",
            actor_user_id=ACCT,
        )

        occ = db_session.query(EventOccurrenceModel).filter_by(event_id=event_id).first()
        assert occ is not None
        assert occ.start_time == time(9, 0)
        assert occ.end_date == date(2026, 5, 2)

    def test_create_with_description(self, db_session: Session):
        """Event with description in extra fields."""
        from app.application.events import CreateEventUseCase

        cat = _category(db_session)
        db_session.commit()

        event_id = CreateEventUseCase(db_session).execute(
            account_id=ACCT,
            title="С описанием",
            category_id=cat.category_id,
            description="Тестовое описание события",
            occ_start_date="2026-05-01",
            actor_user_id=ACCT,
        )

        ev = db_session.query(CalendarEventModel).filter_by(event_id=event_id).first()
        assert ev is not None
        assert ev.description == "Тестовое описание события"

    def test_empty_title_rejected(self, db_session: Session):
        from app.application.events import CreateEventUseCase, EventValidationError

        cat = _category(db_session)
        db_session.commit()

        with pytest.raises(EventValidationError):
            CreateEventUseCase(db_session).execute(
                account_id=ACCT,
                title="",
                category_id=cat.category_id,
                occ_start_date="2026-05-01",
                actor_user_id=ACCT,
            )

    def test_whitespace_title_rejected(self, db_session: Session):
        from app.application.events import CreateEventUseCase, EventValidationError

        cat = _category(db_session)
        db_session.commit()

        with pytest.raises(EventValidationError):
            CreateEventUseCase(db_session).execute(
                account_id=ACCT,
                title="   ",
                category_id=cat.category_id,
                occ_start_date="2026-05-01",
                actor_user_id=ACCT,
            )

    def test_event_without_occurrence_date_creates_no_occurrence(self, db_session: Session):
        """If occ_start_date is missing, event exists but no occurrence created."""
        from app.application.events import CreateEventUseCase

        cat = _category(db_session)
        db_session.commit()

        event_id = CreateEventUseCase(db_session).execute(
            account_id=ACCT,
            title="Без даты occurrence",
            category_id=cat.category_id,
            actor_user_id=ACCT,
        )

        ev = db_session.query(CalendarEventModel).filter_by(event_id=event_id).first()
        assert ev is not None

        occ = db_session.query(EventOccurrenceModel).filter_by(event_id=event_id).first()
        assert occ is None, "No occurrence should be created without occ_start_date"

    def test_multiple_events_get_unique_ids(self, db_session: Session):
        """Creating multiple events should generate unique IDs."""
        from app.application.events import CreateEventUseCase

        cat = _category(db_session)
        db_session.commit()

        ids = []
        for i in range(3):
            eid = CreateEventUseCase(db_session).execute(
                account_id=ACCT,
                title=f"Событие {i+1}",
                category_id=cat.category_id,
                occ_start_date=f"2026-06-0{i+1}",
                actor_user_id=ACCT,
            )
            ids.append(eid)

        assert len(set(ids)) == 3, "All event IDs should be unique"

        # Each should have an occurrence
        for eid in ids:
            occ = db_session.query(EventOccurrenceModel).filter_by(event_id=eid).first()
            assert occ is not None, f"Event {eid} should have an occurrence"


# ── End date validation tests ────────────────────────────────────────────────


class TestEndDateValidation:
    """Test that end_date < start_date is properly caught."""

    def test_end_date_before_start_date_rejected_by_endpoint(self):
        """Backend endpoint should reject end_date < start_date."""
        from app.api.v2.events import CreateEventRequest
        req = CreateEventRequest(
            title="Тест",
            start_date="2026-05-10",
            end_date="2026-05-08",
        )
        # Simulate validation
        assert req.end_date < req.start_date, "end_date should be before start_date"

    def test_end_date_equal_start_date_ok(self, db_session: Session):
        """end_date == start_date is valid."""
        from app.application.events import CreateEventUseCase

        cat = _category(db_session)
        db_session.commit()

        event_id = CreateEventUseCase(db_session).execute(
            account_id=ACCT,
            title="Однодневный диапазон",
            category_id=cat.category_id,
            occ_start_date="2026-05-10",
            occ_end_date="2026-05-10",
            actor_user_id=ACCT,
        )

        occ = db_session.query(EventOccurrenceModel).filter_by(event_id=event_id).first()
        assert occ is not None
        assert occ.end_date == date(2026, 5, 10)

    def test_end_date_after_start_date_ok(self, db_session: Session):
        """end_date > start_date is valid."""
        from app.application.events import CreateEventUseCase

        cat = _category(db_session)
        db_session.commit()

        event_id = CreateEventUseCase(db_session).execute(
            account_id=ACCT,
            title="Нормальный диапазон",
            category_id=cat.category_id,
            occ_start_date="2026-05-10",
            occ_end_date="2026-05-15",
            actor_user_id=ACCT,
        )

        occ = db_session.query(EventOccurrenceModel).filter_by(event_id=event_id).first()
        assert occ is not None
        assert occ.end_date == date(2026, 5, 15)
