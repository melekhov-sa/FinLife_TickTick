"""Tests for Events page — new list/new/edit UX flows."""
import pytest
from app.infrastructure.db.models import (
    CalendarEventModel, WorkCategory, RecurrenceRuleModel,
)
from app.application.events import (
    CreateEventUseCase, UpdateEventUseCase,
    DeactivateEventUseCase, ReactivateEventUseCase,
    EventValidationError,
)

ACCOUNT = 1


def _setup_category(db, category_id=1, title="Праздники", emoji="🎉"):
    """Create a work category for events."""
    existing = db.query(WorkCategory).filter(
        WorkCategory.category_id == category_id
    ).first()
    if existing:
        return existing
    wc = WorkCategory(
        category_id=category_id, account_id=ACCOUNT,
        title=title, emoji=emoji, is_archived=False,
    )
    db.add(wc)
    db.flush()
    return wc


def _get_event(db, event_id):
    return db.query(CalendarEventModel).filter(
        CalendarEventModel.event_id == event_id,
    ).first()


def _active_events(db):
    return db.query(CalendarEventModel).filter(
        CalendarEventModel.account_id == ACCOUNT,
        CalendarEventModel.is_active == True,
    ).order_by(CalendarEventModel.title).all()


def _archived_events(db):
    return db.query(CalendarEventModel).filter(
        CalendarEventModel.account_id == ACCOUNT,
        CalendarEventModel.is_active == False,
    ).order_by(CalendarEventModel.title).all()


# ======================================================================
# 1. Create one-time event
# ======================================================================

class TestCreateOneTime:
    def test_create_onetime_event(self, db_session):
        """Create one-time event with auto-occurrence."""
        _setup_category(db_session)
        event_id = CreateEventUseCase(db_session).execute(
            account_id=ACCOUNT,
            title="Встреча",
            category_id=1,
            description="Zoom",
            occ_start_date="2026-06-15",
            occ_start_time="14:00",
            actor_user_id=ACCOUNT,
        )
        ev = _get_event(db_session, event_id)
        assert ev is not None
        assert ev.title == "Встреча"
        assert ev.category_id == 1
        assert ev.repeat_rule_id is None
        assert ev.is_active is True

    def test_create_event_empty_title_fails(self, db_session):
        """Empty title raises validation error."""
        _setup_category(db_session)
        with pytest.raises(EventValidationError):
            CreateEventUseCase(db_session).execute(
                account_id=ACCOUNT, title="  ", category_id=1,
                actor_user_id=ACCOUNT,
            )


# ======================================================================
# 2. Create recurring event
# ======================================================================

class TestCreateRecurring:
    def test_create_yearly(self, db_session):
        """Create yearly recurring event — creates rule with freq=YEARLY."""
        _setup_category(db_session)
        event_id = CreateEventUseCase(db_session).execute(
            account_id=ACCOUNT,
            title="День рождения",
            category_id=1,
            freq="YEARLY",
            start_date="2026-03-15",
            by_month=3,
            by_monthday_for_year=15,
            actor_user_id=ACCOUNT,
        )
        ev = _get_event(db_session, event_id)
        assert ev is not None
        assert ev.repeat_rule_id is not None

        rule = db_session.query(RecurrenceRuleModel).filter(
            RecurrenceRuleModel.rule_id == ev.repeat_rule_id,
        ).first()
        assert rule is not None
        assert rule.freq == "YEARLY"
        assert rule.by_month == 3
        assert rule.by_monthday_for_year == 15


# ======================================================================
# 3. Archive and reactivate
# ======================================================================

class TestArchiveReactivate:
    def test_deactivate_removes_from_active(self, db_session):
        """Deactivation removes event from active list."""
        _setup_category(db_session)
        event_id = CreateEventUseCase(db_session).execute(
            account_id=ACCOUNT, title="Спорт", category_id=1,
            actor_user_id=ACCOUNT,
        )
        DeactivateEventUseCase(db_session).execute(event_id, ACCOUNT, actor_user_id=ACCOUNT)
        assert len(_active_events(db_session)) == 0

    def test_deactivate_appears_in_archived(self, db_session):
        """Deactivated event appears in archived list."""
        _setup_category(db_session)
        event_id = CreateEventUseCase(db_session).execute(
            account_id=ACCOUNT, title="Спорт", category_id=1,
            actor_user_id=ACCOUNT,
        )
        DeactivateEventUseCase(db_session).execute(event_id, ACCOUNT, actor_user_id=ACCOUNT)
        archived = _archived_events(db_session)
        assert len(archived) == 1
        assert archived[0].event_id == event_id

    def test_reactivate_returns_to_active(self, db_session):
        """Reactivation returns event to active list."""
        _setup_category(db_session)
        event_id = CreateEventUseCase(db_session).execute(
            account_id=ACCOUNT, title="Музыка", category_id=1,
            actor_user_id=ACCOUNT,
        )
        DeactivateEventUseCase(db_session).execute(event_id, ACCOUNT, actor_user_id=ACCOUNT)
        assert len(_active_events(db_session)) == 0

        ReactivateEventUseCase(db_session).execute(event_id, ACCOUNT, actor_user_id=ACCOUNT)
        active = _active_events(db_session)
        assert len(active) == 1
        assert active[0].title == "Музыка"

    def test_reactivate_already_active_fails(self, db_session):
        """Reactivating an already active event raises error."""
        _setup_category(db_session)
        event_id = CreateEventUseCase(db_session).execute(
            account_id=ACCOUNT, title="Чтение", category_id=1,
            actor_user_id=ACCOUNT,
        )
        with pytest.raises(EventValidationError):
            ReactivateEventUseCase(db_session).execute(event_id, ACCOUNT, actor_user_id=ACCOUNT)

    def test_deactivate_already_deactivated_fails(self, db_session):
        """Double deactivation raises error."""
        _setup_category(db_session)
        event_id = CreateEventUseCase(db_session).execute(
            account_id=ACCOUNT, title="Дом", category_id=1,
            actor_user_id=ACCOUNT,
        )
        DeactivateEventUseCase(db_session).execute(event_id, ACCOUNT, actor_user_id=ACCOUNT)
        with pytest.raises(EventValidationError):
            DeactivateEventUseCase(db_session).execute(event_id, ACCOUNT, actor_user_id=ACCOUNT)


# ======================================================================
# 4. Filter by category
# ======================================================================

class TestFilterCategory:
    def test_filter_by_category(self, db_session):
        """Filter events by category_id."""
        cat1 = _setup_category(db_session, 1, "Праздники", "🎉")
        cat2 = _setup_category(db_session, 2, "Работа", "💼")

        CreateEventUseCase(db_session).execute(
            account_id=ACCOUNT, title="ДР", category_id=1, actor_user_id=ACCOUNT,
        )
        CreateEventUseCase(db_session).execute(
            account_id=ACCOUNT, title="Совещание", category_id=2, actor_user_id=ACCOUNT,
        )

        # Filter by category 1
        results = db_session.query(CalendarEventModel).filter(
            CalendarEventModel.account_id == ACCOUNT,
            CalendarEventModel.is_active == True,
            CalendarEventModel.category_id == 1,
        ).all()
        assert len(results) == 1
        assert results[0].title == "ДР"


# ======================================================================
# 5. Filter by type (single/recurring)
# ======================================================================

class TestFilterType:
    def test_filter_single_only(self, db_session):
        """Filter single (non-recurring) events."""
        _setup_category(db_session)
        CreateEventUseCase(db_session).execute(
            account_id=ACCOUNT, title="Разовое", category_id=1,
            actor_user_id=ACCOUNT,
        )
        CreateEventUseCase(db_session).execute(
            account_id=ACCOUNT, title="Повторяющееся", category_id=1,
            freq="YEARLY", start_date="2026-01-01",
            by_month=1, by_monthday_for_year=1,
            actor_user_id=ACCOUNT,
        )

        singles = db_session.query(CalendarEventModel).filter(
            CalendarEventModel.account_id == ACCOUNT,
            CalendarEventModel.is_active == True,
            CalendarEventModel.repeat_rule_id == None,
        ).all()
        assert len(singles) == 1
        assert singles[0].title == "Разовое"

    def test_filter_recurring_only(self, db_session):
        """Filter recurring events."""
        _setup_category(db_session)
        CreateEventUseCase(db_session).execute(
            account_id=ACCOUNT, title="Разовое", category_id=1,
            actor_user_id=ACCOUNT,
        )
        CreateEventUseCase(db_session).execute(
            account_id=ACCOUNT, title="Повторяющееся", category_id=1,
            freq="YEARLY", start_date="2026-01-01",
            by_month=1, by_monthday_for_year=1,
            actor_user_id=ACCOUNT,
        )

        recurring = db_session.query(CalendarEventModel).filter(
            CalendarEventModel.account_id == ACCOUNT,
            CalendarEventModel.is_active == True,
            CalendarEventModel.repeat_rule_id != None,
        ).all()
        assert len(recurring) == 1
        assert recurring[0].title == "Повторяющееся"


# ======================================================================
# 6. Search by title
# ======================================================================

class TestSearch:
    def test_search_by_title(self, db_session):
        """Search events by title substring."""
        _setup_category(db_session)
        CreateEventUseCase(db_session).execute(
            account_id=ACCOUNT, title="День рождения Кати", category_id=1,
            actor_user_id=ACCOUNT,
        )
        CreateEventUseCase(db_session).execute(
            account_id=ACCOUNT, title="Совещание", category_id=1,
            actor_user_id=ACCOUNT,
        )
        CreateEventUseCase(db_session).execute(
            account_id=ACCOUNT, title="День рождения Пети", category_id=1,
            actor_user_id=ACCOUNT,
        )

        q = "рождения"
        results = db_session.query(CalendarEventModel).filter(
            CalendarEventModel.account_id == ACCOUNT,
            CalendarEventModel.is_active == True,
            CalendarEventModel.title.ilike(f"%{q}%"),
        ).all()
        assert len(results) == 2
        titles = {r.title for r in results}
        assert "День рождения Кати" in titles
        assert "День рождения Пети" in titles
        assert "Совещание" not in titles


# ======================================================================
# 7. No importance field
# ======================================================================

class TestNoImportance:
    def test_importance_not_in_model(self, db_session):
        """Verify importance field has been removed from CalendarEventModel."""
        assert not hasattr(CalendarEventModel, "importance"), \
            "importance field should be removed from CalendarEventModel"
