"""
Tests for habit use cases: toggle, streak, today filter, validation
"""
import pytest
from datetime import date, timedelta

from app.infrastructure.db.models import HabitModel, HabitOccurrence, RecurrenceRuleModel
from app.application.habits import (
    CreateHabitUseCase,
    ToggleHabitOccurrenceUseCase,
    UnarchiveHabitUseCase,
    ArchiveHabitUseCase,
    HabitValidationError,
    get_today_habits,
    get_habits_analytics,
    get_habits_grid,
    TOGGLE_WINDOW_DAYS,
)


# --- Fixtures ---

@pytest.fixture
def daily_habit(db_session, sample_account_id):
    """Create a daily habit with recurrence rule and occurrences for last 20 days."""
    rule = RecurrenceRuleModel(
        rule_id=1, account_id=sample_account_id,
        freq="DAILY", interval=1, start_date=date(2026, 1, 1),
    )
    db_session.add(rule)
    db_session.flush()

    habit = HabitModel(
        habit_id=1, account_id=sample_account_id,
        title="Зарядка", rule_id=1, active_from=date(2026, 1, 1),
        is_archived=False, current_streak=0, best_streak=0, done_count_30d=0,
    )
    db_session.add(habit)
    db_session.flush()

    today = date(2026, 2, 14)
    for i in range(20):
        d = today - timedelta(days=i)
        db_session.add(HabitOccurrence(
            account_id=sample_account_id, habit_id=1,
            scheduled_date=d, status="ACTIVE",
        ))
    db_session.flush()
    return habit


@pytest.fixture
def weekly_habit(db_session, sample_account_id):
    """Create a weekly habit (MO,WE,FR) with occurrences."""
    rule = RecurrenceRuleModel(
        rule_id=2, account_id=sample_account_id,
        freq="WEEKLY", interval=1, start_date=date(2026, 1, 1),
        by_weekday="MO,WE,FR",
    )
    db_session.add(rule)
    db_session.flush()

    habit = HabitModel(
        habit_id=2, account_id=sample_account_id,
        title="Бег", rule_id=2, active_from=date(2026, 1, 1),
        is_archived=False, current_streak=0, best_streak=0, done_count_30d=0,
    )
    db_session.add(habit)
    db_session.flush()

    # 2026-02-14 is Saturday -> not a MO/WE/FR day
    # Add some occurrences on MO/WE/FR
    for d in [date(2026, 2, 9), date(2026, 2, 11), date(2026, 2, 13)]:  # Mon, Wed, Fri
        db_session.add(HabitOccurrence(
            account_id=sample_account_id, habit_id=2,
            scheduled_date=d, status="ACTIVE",
        ))
    db_session.flush()
    return habit


# --- Toggle tests ---

class TestToggleOccurrence:
    def test_toggle_active_to_done(self, db_session, sample_account_id, daily_habit):
        """Toggle ACTIVE -> DONE within 14 days."""
        today = date(2026, 2, 14)
        occ = db_session.query(HabitOccurrence).filter(
            HabitOccurrence.scheduled_date == today
        ).first()

        uc = ToggleHabitOccurrenceUseCase(db_session)
        result = uc.execute(occ.id, sample_account_id, today=today)
        assert result == "DONE"

        db_session.expire_all()
        occ = db_session.query(HabitOccurrence).filter(HabitOccurrence.id == occ.id).first()
        assert occ.status == "DONE"

    def test_toggle_done_to_active(self, db_session, sample_account_id, daily_habit):
        """Toggle DONE -> ACTIVE."""
        today = date(2026, 2, 14)
        occ = db_session.query(HabitOccurrence).filter(
            HabitOccurrence.scheduled_date == today
        ).first()
        occ.status = "DONE"
        db_session.flush()

        uc = ToggleHabitOccurrenceUseCase(db_session)
        result = uc.execute(occ.id, sample_account_id, today=today)
        assert result == "ACTIVE"

    def test_toggle_yesterday_ok(self, db_session, sample_account_id, daily_habit):
        """Toggle yesterday within 14-day window."""
        today = date(2026, 2, 14)
        occ = db_session.query(HabitOccurrence).filter(
            HabitOccurrence.scheduled_date == today - timedelta(days=1)
        ).first()

        uc = ToggleHabitOccurrenceUseCase(db_session)
        result = uc.execute(occ.id, sample_account_id, today=today)
        assert result == "DONE"

    def test_toggle_13_days_ago_ok(self, db_session, sample_account_id, daily_habit):
        """Toggle 13 days ago (boundary of 14-day window)."""
        today = date(2026, 2, 14)
        target = today - timedelta(days=13)
        occ = db_session.query(HabitOccurrence).filter(
            HabitOccurrence.scheduled_date == target
        ).first()

        uc = ToggleHabitOccurrenceUseCase(db_session)
        result = uc.execute(occ.id, sample_account_id, today=today)
        assert result == "DONE"

    def test_toggle_14_days_ago_fails(self, db_session, sample_account_id, daily_habit):
        """Toggle 14 days ago -> error (outside 14-day window)."""
        today = date(2026, 2, 14)
        target = today - timedelta(days=14)
        occ = db_session.query(HabitOccurrence).filter(
            HabitOccurrence.scheduled_date == target
        ).first()

        uc = ToggleHabitOccurrenceUseCase(db_session)
        with pytest.raises(HabitValidationError, match="14 дней"):
            uc.execute(occ.id, sample_account_id, today=today)

    def test_toggle_future_fails(self, db_session, sample_account_id):
        """Toggle future date -> error."""
        today = date(2026, 2, 14)
        rule = RecurrenceRuleModel(
            rule_id=10, account_id=sample_account_id,
            freq="DAILY", interval=1, start_date=date(2026, 1, 1),
        )
        db_session.add(rule)
        habit = HabitModel(
            habit_id=10, account_id=sample_account_id,
            title="Future", rule_id=10, active_from=date(2026, 1, 1),
            is_archived=False, current_streak=0, best_streak=0, done_count_30d=0,
        )
        db_session.add(habit)
        future_occ = HabitOccurrence(
            account_id=sample_account_id, habit_id=10,
            scheduled_date=today + timedelta(days=1), status="ACTIVE",
        )
        db_session.add(future_occ)
        db_session.flush()

        uc = ToggleHabitOccurrenceUseCase(db_session)
        with pytest.raises(HabitValidationError, match="будущих"):
            uc.execute(future_occ.id, sample_account_id, today=today)


# --- Today filter tests ---

class TestTodayHabits:
    def test_today_shows_habit_with_occurrence(self, db_session, sample_account_id, daily_habit):
        """Daily habit has occurrence today -> visible in today_habits."""
        today = date(2026, 2, 14)
        result = get_today_habits(db_session, sample_account_id, today)
        assert len(result) == 1
        assert result[0]["habit"].habit_id == 1

    def test_today_excludes_habit_without_occurrence(self, db_session, sample_account_id, weekly_habit):
        """Weekly habit with no occurrence today -> not in today_habits."""
        # 2026-02-14 is Saturday, weekly habit is MO,WE,FR
        today = date(2026, 2, 14)
        result = get_today_habits(db_session, sample_account_id, today)
        # weekly_habit has no occurrence on Saturday
        habit_ids = [r["habit"].habit_id for r in result]
        assert 2 not in habit_ids

    def test_today_excludes_archived(self, db_session, sample_account_id, daily_habit):
        """Archived habit not in today_habits."""
        daily_habit.is_archived = True
        db_session.flush()
        today = date(2026, 2, 14)
        result = get_today_habits(db_session, sample_account_id, today)
        assert len(result) == 0


# --- Analytics tests ---

class TestAnalytics:
    def test_analytics_empty(self, db_session, sample_account_id):
        """No habits -> zero analytics."""
        today = date(2026, 2, 14)
        result = get_habits_analytics(db_session, sample_account_id, today)
        assert result["today_done"] == 0
        assert result["today_total"] == 0

    def test_analytics_today_count(self, db_session, sample_account_id, daily_habit):
        """Today count reflects done/total."""
        today = date(2026, 2, 14)
        occ = db_session.query(HabitOccurrence).filter(
            HabitOccurrence.scheduled_date == today
        ).first()
        occ.status = "DONE"
        db_session.flush()

        result = get_habits_analytics(db_session, sample_account_id, today)
        assert result["today_done"] == 1
        assert result["today_total"] == 1


# --- Grid tests ---

class TestGrid:
    def test_grid_14_days(self, db_session, sample_account_id, daily_habit):
        """Grid returns 14 days for each habit."""
        today = date(2026, 2, 14)
        result = get_habits_grid(db_session, sample_account_id, today)
        assert len(result) == 1
        assert len(result[0]["days"]) == 14


# --- Validation tests ---

class TestCreateValidation:
    def test_empty_title_fails(self, db_session, sample_account_id):
        """Empty title -> error."""
        uc = CreateHabitUseCase(db_session)
        with pytest.raises(HabitValidationError, match="пустым"):
            uc.execute(
                account_id=sample_account_id, title="  ", freq="DAILY",
                interval=1, start_date="2026-03-01",
            )

    def test_weekly_without_days_fails(self, db_session, sample_account_id):
        """WEEKLY without weekdays -> error."""
        uc = CreateHabitUseCase(db_session)
        with pytest.raises(HabitValidationError, match="день недели"):
            uc.execute(
                account_id=sample_account_id, title="Тест", freq="WEEKLY",
                interval=1, start_date="2026-03-01", by_weekday=None,
            )

    def test_monthly_invalid_day_fails(self, db_session, sample_account_id):
        """MONTHLY with day > 31 -> error."""
        uc = CreateHabitUseCase(db_session)
        with pytest.raises(HabitValidationError, match="День месяца"):
            uc.execute(
                account_id=sample_account_id, title="Тест", freq="MONTHLY",
                interval=1, start_date="2026-03-01", by_monthday=32,
            )


# --- Unarchive tests ---

class TestUnarchive:
    def test_unarchive_restores_habit(self, db_session, sample_account_id, daily_habit):
        """Unarchive sets is_archived=False."""
        daily_habit.is_archived = True
        db_session.flush()

        # Need event log entry for the archive to work through projector
        uc = UnarchiveHabitUseCase(db_session)
        uc.execute(daily_habit.habit_id, sample_account_id)
        db_session.expire_all()
        habit = db_session.query(HabitModel).filter(HabitModel.habit_id == 1).first()
        assert habit.is_archived is False

    def test_unarchive_not_archived_fails(self, db_session, sample_account_id, daily_habit):
        """Unarchive active habit -> error."""
        uc = UnarchiveHabitUseCase(db_session)
        with pytest.raises(HabitValidationError, match="не в архиве"):
            uc.execute(daily_habit.habit_id, sample_account_id)
