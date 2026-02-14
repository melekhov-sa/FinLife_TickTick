"""
Tests for habits stage 2: level, heatmap, milestones
"""
import pytest
from datetime import date, datetime, timedelta

from app.infrastructure.db.models import HabitModel, HabitOccurrence, RecurrenceRuleModel, EventLog
from app.application.habits import (
    CreateHabitUseCase,
    HabitValidationError,
    get_today_habits,
    get_habits_grid,
    get_global_heatmap,
    get_habit_heatmap,
    check_and_emit_milestones,
    get_habit_milestones,
    get_recent_milestones,
    HEATMAP_DAYS,
    MILESTONE_THRESHOLDS,
)


# --- Fixtures ---

@pytest.fixture
def daily_rule(db_session, sample_account_id):
    rule = RecurrenceRuleModel(
        rule_id=100, account_id=sample_account_id,
        freq="DAILY", interval=1, start_date=date(2026, 1, 1),
    )
    db_session.add(rule)
    db_session.flush()
    return rule


@pytest.fixture
def habit_level2(db_session, sample_account_id, daily_rule):
    """Daily habit with level=2."""
    habit = HabitModel(
        habit_id=100, account_id=sample_account_id,
        title="Медитация", rule_id=100, active_from=date(2026, 1, 1),
        is_archived=False, level=2, current_streak=0, best_streak=0, done_count_30d=0,
    )
    db_session.add(habit)
    db_session.flush()
    return habit


@pytest.fixture
def habit_level3(db_session, sample_account_id):
    """Daily habit with level=3."""
    rule = RecurrenceRuleModel(
        rule_id=101, account_id=sample_account_id,
        freq="DAILY", interval=1, start_date=date(2026, 1, 1),
    )
    db_session.add(rule)
    db_session.flush()
    habit = HabitModel(
        habit_id=101, account_id=sample_account_id,
        title="Спорт", rule_id=101, active_from=date(2026, 1, 1),
        is_archived=False, level=3, current_streak=5, best_streak=5, done_count_30d=5,
    )
    db_session.add(habit)
    db_session.flush()
    return habit


@pytest.fixture
def habit_with_occurrences(db_session, sample_account_id, daily_rule, habit_level2):
    """Habit with 20 days of occurrences, some DONE."""
    today = date(2026, 2, 14)
    for i in range(20):
        d = today - timedelta(days=i)
        status = "DONE" if i < 7 else "ACTIVE"  # last 7 days DONE
        db_session.add(HabitOccurrence(
            account_id=sample_account_id, habit_id=100,
            scheduled_date=d, status=status,
        ))
    db_session.flush()
    return habit_level2


# --- Level tests ---

class TestLevel:
    def test_create_habit_with_level(self, db_session, sample_account_id):
        """Create habit with level=3."""
        uc = CreateHabitUseCase(db_session)
        habit_id = uc.execute(
            account_id=sample_account_id, title="Тест L3", freq="DAILY",
            interval=1, start_date="2026-03-01", level=3,
        )
        habit = db_session.query(HabitModel).filter(HabitModel.habit_id == habit_id).first()
        assert habit.level == 3

    def test_create_habit_default_level(self, db_session, sample_account_id):
        """Default level is 1."""
        uc = CreateHabitUseCase(db_session)
        habit_id = uc.execute(
            account_id=sample_account_id, title="Тест L1", freq="DAILY",
            interval=1, start_date="2026-03-01",
        )
        habit = db_session.query(HabitModel).filter(HabitModel.habit_id == habit_id).first()
        assert habit.level == 1

    def test_invalid_level_fails(self, db_session, sample_account_id):
        """Level 5 -> error."""
        uc = CreateHabitUseCase(db_session)
        with pytest.raises(HabitValidationError, match="Уровень"):
            uc.execute(
                account_id=sample_account_id, title="Тест", freq="DAILY",
                interval=1, start_date="2026-03-01", level=5,
            )

    def test_level_zero_fails(self, db_session, sample_account_id):
        """Level 0 -> error."""
        uc = CreateHabitUseCase(db_session)
        with pytest.raises(HabitValidationError, match="Уровень"):
            uc.execute(
                account_id=sample_account_id, title="Тест", freq="DAILY",
                interval=1, start_date="2026-03-01", level=0,
            )

    def test_sorting_by_level_desc(self, db_session, sample_account_id, habit_level2, habit_level3):
        """Habits sorted by level desc, then streak desc."""
        today = date(2026, 2, 14)
        # Add occurrence for today for both habits
        for hid in [100, 101]:
            db_session.add(HabitOccurrence(
                account_id=sample_account_id, habit_id=hid,
                scheduled_date=today, status="ACTIVE",
            ))
        db_session.flush()

        result = get_today_habits(db_session, sample_account_id, today)
        assert len(result) == 2
        assert result[0]["habit"].habit_id == 101  # level 3 first
        assert result[1]["habit"].habit_id == 100  # level 2 second

    def test_grid_sorting_by_level(self, db_session, sample_account_id, habit_level2, habit_level3):
        """Grid sorted by level desc."""
        today = date(2026, 2, 14)
        result = get_habits_grid(db_session, sample_account_id, today)
        assert len(result) == 2
        assert result[0]["habit"].habit_id == 101  # level 3


# --- Heatmap tests ---

class TestGlobalHeatmap:
    def test_heatmap_empty(self, db_session, sample_account_id):
        """No habits -> empty heatmap."""
        today = date(2026, 2, 14)
        result = get_global_heatmap(db_session, sample_account_id, today)
        assert result == []

    def test_heatmap_90_cells(self, db_session, sample_account_id, habit_with_occurrences):
        """Heatmap returns 90 cells."""
        today = date(2026, 2, 14)
        result = get_global_heatmap(db_session, sample_account_id, today)
        assert len(result) == HEATMAP_DAYS

    def test_heatmap_levels(self, db_session, sample_account_id, habit_with_occurrences):
        """Level 4 for 100% done, level 0 for no occurrences."""
        today = date(2026, 2, 14)
        result = get_global_heatmap(db_session, sample_account_id, today)

        # Today (index 89): has 1 occurrence, status DONE -> level 4
        today_cell = result[-1]
        assert today_cell["date"] == today
        assert today_cell["level"] == 4

        # 10 days ago (index 79): status ACTIVE (not done) -> level 0
        ten_ago = result[HEATMAP_DAYS - 11]
        assert ten_ago["level"] == 0

        # A day with no occurrences (far back) -> level 0
        far_back = result[0]
        assert far_back["level"] == 0


class TestHabitHeatmap:
    def test_habit_heatmap_90_cells(self, db_session, sample_account_id, habit_with_occurrences):
        """Per-habit heatmap returns 90 cells."""
        today = date(2026, 2, 14)
        result = get_habit_heatmap(db_session, sample_account_id, 100, today)
        assert len(result) == HEATMAP_DAYS

    def test_habit_heatmap_done_status(self, db_session, sample_account_id, habit_with_occurrences):
        """Today is DONE -> status='done'."""
        today = date(2026, 2, 14)
        result = get_habit_heatmap(db_session, sample_account_id, 100, today)
        today_cell = result[-1]
        assert today_cell["status"] == "done"

    def test_habit_heatmap_undone_status(self, db_session, sample_account_id, habit_with_occurrences):
        """10 days ago is ACTIVE -> status='undone'."""
        today = date(2026, 2, 14)
        result = get_habit_heatmap(db_session, sample_account_id, 100, today)
        # 10 days ago = index HEATMAP_DAYS - 11 = 79
        cell_10_ago = result[HEATMAP_DAYS - 11]
        assert cell_10_ago["status"] == "undone"

    def test_habit_heatmap_nonexistent(self, db_session, sample_account_id):
        """Nonexistent habit -> empty list."""
        today = date(2026, 2, 14)
        result = get_habit_heatmap(db_session, sample_account_id, 9999, today)
        assert result == []


# --- Milestone tests ---

class TestMilestones:
    def test_milestone_emitted_at_threshold(self, db_session, sample_account_id, habit_level2):
        """Streak=7 emits milestone for threshold 7."""
        result = check_and_emit_milestones(db_session, sample_account_id, 100, 7)
        assert 7 in result

        # Verify event in event_log
        events = db_session.query(EventLog).filter(
            EventLog.event_type == "habit_milestone_reached",
        ).all()
        assert len(events) == 1
        assert events[0].payload_json["threshold"] == 7
        assert events[0].payload_json["habit_id"] == 100

    def test_milestone_multiple_thresholds(self, db_session, sample_account_id, habit_level2):
        """Streak=30 emits milestones for 7, 14, 30."""
        result = check_and_emit_milestones(db_session, sample_account_id, 100, 30)
        assert sorted(result) == [7, 14, 30]

    def test_milestone_deduplication(self, db_session, sample_account_id, habit_level2):
        """Second call with same streak does NOT emit duplicates."""
        check_and_emit_milestones(db_session, sample_account_id, 100, 7)
        result2 = check_and_emit_milestones(db_session, sample_account_id, 100, 7)
        assert result2 == []

        events = db_session.query(EventLog).filter(
            EventLog.event_type == "habit_milestone_reached",
        ).all()
        assert len(events) == 1

    def test_milestone_not_deleted_on_streak_break(self, db_session, sample_account_id, habit_level2):
        """Milestones persist even if streak drops to 0."""
        check_and_emit_milestones(db_session, sample_account_id, 100, 7)

        # Streak drops
        result_after_break = check_and_emit_milestones(db_session, sample_account_id, 100, 0)
        assert result_after_break == []

        # Original milestone still in event_log
        events = db_session.query(EventLog).filter(
            EventLog.event_type == "habit_milestone_reached",
        ).all()
        assert len(events) == 1
        assert events[0].payload_json["threshold"] == 7

    def test_milestone_re_earned_after_break(self, db_session, sample_account_id, habit_level2):
        """After streak break and rebuild, milestone for same threshold is NOT re-emitted."""
        check_and_emit_milestones(db_session, sample_account_id, 100, 7)
        # Streak breaks and comes back to 7
        result = check_and_emit_milestones(db_session, sample_account_id, 100, 7)
        assert result == []  # Already reached, no duplicate

    def test_get_habit_milestones(self, db_session, sample_account_id, habit_level2):
        """get_habit_milestones returns sorted thresholds."""
        check_and_emit_milestones(db_session, sample_account_id, 100, 14)
        milestones = get_habit_milestones(db_session, sample_account_id, 100)
        assert milestones == [7, 14]

    def test_get_recent_milestones(self, db_session, sample_account_id, habit_level2):
        """get_recent_milestones returns milestone info with habit titles."""
        check_and_emit_milestones(db_session, sample_account_id, 100, 7)
        db_session.flush()

        recent = get_recent_milestones(db_session, sample_account_id, limit=5)
        assert len(recent) == 1
        assert recent[0]["habit_title"] == "Медитация"
        assert recent[0]["threshold"] == 7

    def test_below_threshold_no_milestone(self, db_session, sample_account_id, habit_level2):
        """Streak=6 doesn't emit any milestone."""
        result = check_and_emit_milestones(db_session, sample_account_id, 100, 6)
        assert result == []
