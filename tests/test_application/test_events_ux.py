"""Tests for Events UX redesign: validation, rebuild, auto-occurrence, recurrence mapping."""
import pytest
from datetime import date, timedelta
from sqlalchemy.orm import Session

from app.application.events import (
    CreateEventUseCase, validate_event_form, rebuild_event_occurrences,
)
from app.application.recurrence_rules import (
    CreateRecurrenceRuleUseCase, UpdateRecurrenceRuleUseCase,
)
from app.infrastructure.db.models import (
    CalendarEventModel, EventOccurrenceModel, RecurrenceRuleModel,
    WorkCategory,
)

ACCOUNT = 1
TODAY = date(2026, 2, 14)


def _add_category(db: Session, title: str = "Test", emoji: str = "") -> int:
    wc = WorkCategory(
        account_id=ACCOUNT, title=title, emoji=emoji,
    )
    db.add(wc)
    db.flush()
    return wc.category_id


# ===========================================================================
# Validation tests
# ===========================================================================

class TestValidation:
    def test_validate_onetime_requires_start_date(self):
        err = validate_event_form(
            event_type="onetime", title="Test", start_date="",
        )
        assert err is not None
        assert "Дата начала" in err

    def test_validate_onetime_valid(self):
        err = validate_event_form(
            event_type="onetime", title="Test", start_date="2026-02-14",
        )
        assert err is None

    def test_validate_onetime_requires_title(self):
        err = validate_event_form(
            event_type="onetime", title="", start_date="2026-02-14",
        )
        assert err is not None
        assert "Название" in err

    def test_validate_yearly_requires_month_and_day(self):
        err = validate_event_form(
            event_type="recurring", title="Test",
            recurrence_type="yearly", rec_month=None, rec_day=None,
        )
        assert err is not None
        assert "месяц" in err.lower() or "день" in err.lower()

    def test_validate_yearly_valid(self):
        err = validate_event_form(
            event_type="recurring", title="Test",
            recurrence_type="yearly", rec_month=2, rec_day=14,
        )
        assert err is None

    def test_validate_monthly_requires_day(self):
        err = validate_event_form(
            event_type="recurring", title="Test",
            recurrence_type="monthly", rec_day=None,
        )
        assert err is not None
        assert "день" in err.lower()

    def test_validate_monthly_valid(self):
        err = validate_event_form(
            event_type="recurring", title="Test",
            recurrence_type="monthly", rec_day=15,
        )
        assert err is None

    def test_validate_weekly_requires_weekdays(self):
        err = validate_event_form(
            event_type="recurring", title="Test",
            recurrence_type="weekly", rec_weekdays=None,
        )
        assert err is not None
        assert "день недели" in err.lower()

    def test_validate_weekly_valid(self):
        err = validate_event_form(
            event_type="recurring", title="Test",
            recurrence_type="weekly", rec_weekdays=["MO", "WE"],
        )
        assert err is None

    def test_validate_interval_requires_start(self):
        err = validate_event_form(
            event_type="recurring", title="Test",
            recurrence_type="interval", rec_interval=3, rec_start_date="",
        )
        assert err is not None
        assert "Дата начала" in err

    def test_validate_interval_valid(self):
        err = validate_event_form(
            event_type="recurring", title="Test",
            recurrence_type="interval", rec_interval=3, rec_start_date="2026-02-14",
        )
        assert err is None

    def test_validate_recurring_requires_type(self):
        err = validate_event_form(
            event_type="recurring", title="Test", recurrence_type="",
        )
        assert err is not None
        assert "тип повтора" in err.lower()


# ===========================================================================
# One-time auto-occurrence tests
# ===========================================================================

class TestOnetimeAutoOccurrence:
    def test_onetime_creates_occurrence(self, db_session):
        cat_id = _add_category(db_session)
        event_id = CreateEventUseCase(db_session).execute(
            account_id=ACCOUNT,
            title="Встреча",
            category_id=cat_id,
            occ_start_date="2026-02-14",
            occ_start_time="10:00",
            actor_user_id=ACCOUNT,
        )
        occs = db_session.query(EventOccurrenceModel).filter(
            EventOccurrenceModel.event_id == event_id,
        ).all()
        assert len(occs) == 1
        assert occs[0].start_date == date(2026, 2, 14)
        assert occs[0].start_time is not None

    def test_onetime_occurrence_has_manual_source(self, db_session):
        cat_id = _add_category(db_session)
        event_id = CreateEventUseCase(db_session).execute(
            account_id=ACCOUNT,
            title="Party",
            category_id=cat_id,
            occ_start_date="2026-03-01",
            actor_user_id=ACCOUNT,
        )
        occ = db_session.query(EventOccurrenceModel).filter(
            EventOccurrenceModel.event_id == event_id,
        ).first()
        assert occ.source == "manual"

    def test_onetime_no_occurrence_without_date(self, db_session):
        cat_id = _add_category(db_session)
        event_id = CreateEventUseCase(db_session).execute(
            account_id=ACCOUNT,
            title="No date event",
            category_id=cat_id,
            actor_user_id=ACCOUNT,
        )
        occs = db_session.query(EventOccurrenceModel).filter(
            EventOccurrenceModel.event_id == event_id,
        ).all()
        assert len(occs) == 0

    def test_onetime_with_period(self, db_session):
        cat_id = _add_category(db_session)
        event_id = CreateEventUseCase(db_session).execute(
            account_id=ACCOUNT,
            title="Vacation",
            category_id=cat_id,
            occ_start_date="2026-03-01",
            occ_end_date="2026-03-10",
            actor_user_id=ACCOUNT,
        )
        occ = db_session.query(EventOccurrenceModel).filter(
            EventOccurrenceModel.event_id == event_id,
        ).first()
        assert occ.start_date == date(2026, 3, 1)
        assert occ.end_date == date(2026, 3, 10)


# ===========================================================================
# Recurrence mapping tests (via CreateEventUseCase)
# ===========================================================================

class TestRecurrenceMapping:
    def test_yearly_maps_correctly(self, db_session):
        cat_id = _add_category(db_session)
        event_id = CreateEventUseCase(db_session).execute(
            account_id=ACCOUNT,
            title="Birthday",
            category_id=cat_id,
            freq="YEARLY",
            interval=1,
            start_date="2026-02-14",
            by_month=2,
            by_monthday_for_year=14,
            actor_user_id=ACCOUNT,
        )
        ev = db_session.query(CalendarEventModel).filter(
            CalendarEventModel.event_id == event_id,
        ).first()
        assert ev.repeat_rule_id is not None
        rule = db_session.query(RecurrenceRuleModel).filter(
            RecurrenceRuleModel.rule_id == ev.repeat_rule_id,
        ).first()
        assert rule.freq == "YEARLY"
        assert rule.by_month == 2
        assert rule.by_monthday_for_year == 14

    def test_monthly_maps_correctly(self, db_session):
        cat_id = _add_category(db_session)
        event_id = CreateEventUseCase(db_session).execute(
            account_id=ACCOUNT,
            title="Rent",
            category_id=cat_id,
            freq="MONTHLY",
            interval=1,
            start_date="2026-02-14",
            by_monthday=15,
            actor_user_id=ACCOUNT,
        )
        ev = db_session.query(CalendarEventModel).filter(
            CalendarEventModel.event_id == event_id,
        ).first()
        rule = db_session.query(RecurrenceRuleModel).filter(
            RecurrenceRuleModel.rule_id == ev.repeat_rule_id,
        ).first()
        assert rule.freq == "MONTHLY"
        assert rule.by_monthday == 15

    def test_weekly_maps_correctly(self, db_session):
        cat_id = _add_category(db_session)
        event_id = CreateEventUseCase(db_session).execute(
            account_id=ACCOUNT,
            title="Standup",
            category_id=cat_id,
            freq="WEEKLY",
            interval=1,
            start_date="2026-02-14",
            by_weekday="MO,WE,FR",
            actor_user_id=ACCOUNT,
        )
        ev = db_session.query(CalendarEventModel).filter(
            CalendarEventModel.event_id == event_id,
        ).first()
        rule = db_session.query(RecurrenceRuleModel).filter(
            RecurrenceRuleModel.rule_id == ev.repeat_rule_id,
        ).first()
        assert rule.freq == "WEEKLY"
        assert rule.by_weekday == "MO,WE,FR"

    def test_interval_maps_correctly(self, db_session):
        cat_id = _add_category(db_session)
        event_id = CreateEventUseCase(db_session).execute(
            account_id=ACCOUNT,
            title="Check-in",
            category_id=cat_id,
            freq="INTERVAL_DAYS",
            interval=3,
            start_date="2026-02-14",
            actor_user_id=ACCOUNT,
        )
        ev = db_session.query(CalendarEventModel).filter(
            CalendarEventModel.event_id == event_id,
        ).first()
        rule = db_session.query(RecurrenceRuleModel).filter(
            RecurrenceRuleModel.rule_id == ev.repeat_rule_id,
        ).first()
        assert rule.freq == "INTERVAL_DAYS"
        assert rule.interval == 3


# ===========================================================================
# UpdateRecurrenceRuleUseCase tests
# ===========================================================================

class TestUpdateRecurrenceRule:
    def test_update_rule_changes_freq(self, db_session):
        rule_id = CreateRecurrenceRuleUseCase(db_session).execute(
            account_id=ACCOUNT,
            freq="MONTHLY",
            interval=1,
            start_date="2026-01-01",
            by_monthday=15,
            actor_user_id=ACCOUNT,
        )
        UpdateRecurrenceRuleUseCase(db_session).execute(
            rule_id=rule_id,
            account_id=ACCOUNT,
            freq="WEEKLY",
            by_weekday="MO,FR",
            by_monthday=None,
            start_date="2026-01-01",
            actor_user_id=ACCOUNT,
        )
        rule = db_session.query(RecurrenceRuleModel).filter(
            RecurrenceRuleModel.rule_id == rule_id,
        ).first()
        assert rule.freq == "WEEKLY"
        assert rule.by_weekday == "MO,FR"

    def test_update_rule_changes_interval(self, db_session):
        rule_id = CreateRecurrenceRuleUseCase(db_session).execute(
            account_id=ACCOUNT,
            freq="INTERVAL_DAYS",
            interval=3,
            start_date="2026-01-01",
            actor_user_id=ACCOUNT,
        )
        UpdateRecurrenceRuleUseCase(db_session).execute(
            rule_id=rule_id,
            account_id=ACCOUNT,
            interval=7,
            actor_user_id=ACCOUNT,
        )
        rule = db_session.query(RecurrenceRuleModel).filter(
            RecurrenceRuleModel.rule_id == rule_id,
        ).first()
        assert rule.interval == 7


# ===========================================================================
# Rebuild mechanism tests
# ===========================================================================

class TestRebuild:
    def _create_recurring_event(self, db: Session, cat_id: int) -> tuple[int, int]:
        """Helper: create a weekly event and generate occurrences. Returns (event_id, rule_id)."""
        event_id = CreateEventUseCase(db).execute(
            account_id=ACCOUNT,
            title="Weekly meeting",
            category_id=cat_id,
            freq="WEEKLY",
            interval=1,
            start_date=TODAY.isoformat(),
            by_weekday="MO,WE,FR",
            actor_user_id=ACCOUNT,
        )
        ev = db.query(CalendarEventModel).filter(
            CalendarEventModel.event_id == event_id,
        ).first()
        # Generate occurrences
        from app.application.occurrence_generator import OccurrenceGenerator
        OccurrenceGenerator(db).generate_event_occurrences(ACCOUNT)
        return event_id, ev.repeat_rule_id

    def test_rebuild_deletes_future_rule_occurrences(self, db_session):
        cat_id = _add_category(db_session)
        event_id, rule_id = self._create_recurring_event(db_session, cat_id)

        # Verify some occurrences exist
        occs_before = db_session.query(EventOccurrenceModel).filter(
            EventOccurrenceModel.event_id == event_id,
            EventOccurrenceModel.source == "rule",
            EventOccurrenceModel.start_date >= TODAY,
        ).count()
        assert occs_before > 0

        # Rebuild
        deleted = rebuild_event_occurrences(db_session, event_id, ACCOUNT, TODAY)
        assert deleted == occs_before

    def test_rebuild_preserves_manual_occurrences(self, db_session):
        cat_id = _add_category(db_session)
        event_id, rule_id = self._create_recurring_event(db_session, cat_id)

        # Add a manual occurrence directly (bypassing event log ID issues in tests)
        manual_occ = EventOccurrenceModel(
            account_id=ACCOUNT,
            event_id=event_id,
            start_date=TODAY + timedelta(days=5),
            start_time=None,
            is_cancelled=False,
            source="manual",
        )
        db_session.add(manual_occ)
        db_session.commit()

        manual_before = db_session.query(EventOccurrenceModel).filter(
            EventOccurrenceModel.event_id == event_id,
            EventOccurrenceModel.source == "manual",
        ).count()
        assert manual_before == 1

        rebuild_event_occurrences(db_session, event_id, ACCOUNT, TODAY)

        manual_after = db_session.query(EventOccurrenceModel).filter(
            EventOccurrenceModel.event_id == event_id,
            EventOccurrenceModel.source == "manual",
        ).count()
        assert manual_after == manual_before

    def test_rebuild_preserves_cancelled_occurrences(self, db_session):
        cat_id = _add_category(db_session)
        event_id, rule_id = self._create_recurring_event(db_session, cat_id)

        # Cancel one future occurrence
        future_occ = db_session.query(EventOccurrenceModel).filter(
            EventOccurrenceModel.event_id == event_id,
            EventOccurrenceModel.source == "rule",
            EventOccurrenceModel.start_date >= TODAY,
        ).first()
        assert future_occ is not None
        future_occ.is_cancelled = True
        db_session.commit()

        cancelled_date = future_occ.start_date
        rebuild_event_occurrences(db_session, event_id, ACCOUNT, TODAY)

        # Cancelled occurrence should still be there (not deleted by rebuild)
        cancelled_occ = db_session.query(EventOccurrenceModel).filter(
            EventOccurrenceModel.event_id == event_id,
            EventOccurrenceModel.start_date == cancelled_date,
            EventOccurrenceModel.is_cancelled == True,
        ).first()
        assert cancelled_occ is not None

    def test_rebuild_regenerates_after_delete(self, db_session):
        cat_id = _add_category(db_session)
        event_id, rule_id = self._create_recurring_event(db_session, cat_id)

        rebuild_event_occurrences(db_session, event_id, ACCOUNT, TODAY)

        # After rebuild, new occurrences should exist (regenerated)
        occs_after = db_session.query(EventOccurrenceModel).filter(
            EventOccurrenceModel.event_id == event_id,
            EventOccurrenceModel.source == "rule",
            EventOccurrenceModel.start_date >= TODAY,
        ).count()
        assert occs_after > 0
