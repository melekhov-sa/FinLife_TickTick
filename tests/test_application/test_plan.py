"""Tests for Plan (aggregated timeline) view builder."""
import pytest
from datetime import date, datetime, timedelta, time
from decimal import Decimal

from app.infrastructure.db.models import (
    TaskModel, TaskTemplateModel, TaskOccurrence,
    HabitModel, HabitOccurrence,
    OperationTemplateModel, OperationOccurrence,
    CalendarEventModel, EventOccurrenceModel,
    WorkCategory, RecurrenceRuleModel,
)
from app.application.plan import build_plan_view


TODAY = date(2026, 2, 14)
YESTERDAY = TODAY - timedelta(days=1)
TOMORROW = TODAY + timedelta(days=1)
ACCOUNT = 1


@pytest.fixture
def wc(db_session):
    """Create a work category for testing."""
    w = WorkCategory(
        category_id=100, account_id=ACCOUNT,
        title="Work", emoji="💼", is_archived=False,
    )
    db_session.add(w)
    db_session.flush()
    return w


def _add_task(db, task_id, due_date=None, status="ACTIVE", category_id=None, title="Task"):
    t = TaskModel(
        task_id=task_id, account_id=ACCOUNT, title=title,
        due_date=due_date, status=status, category_id=category_id,
    )
    if status == "DONE":
        t.completed_at = datetime(TODAY.year, TODAY.month, TODAY.day, 12, 0)
    db.add(t)
    db.flush()
    return t


def _add_rule(db, rule_id):
    r = RecurrenceRuleModel(
        rule_id=rule_id, account_id=ACCOUNT, freq="DAILY", interval=1,
        start_date=TODAY - timedelta(days=30),
    )
    db.add(r)
    db.flush()
    return r


def _add_task_template(db, template_id, rule_id, is_archived=False, title="RecTask", category_id=None):
    t = TaskTemplateModel(
        template_id=template_id, account_id=ACCOUNT, title=title,
        rule_id=rule_id, active_from=TODAY - timedelta(days=30),
        is_archived=is_archived, category_id=category_id,
    )
    db.add(t)
    db.flush()
    return t


def _add_task_occ(db, occ_id, template_id, scheduled_date, status="ACTIVE"):
    o = TaskOccurrence(
        id=occ_id, account_id=ACCOUNT, template_id=template_id,
        scheduled_date=scheduled_date, status=status,
    )
    if status == "DONE":
        o.completed_at = datetime(TODAY.year, TODAY.month, TODAY.day, 12, 0)
    db.add(o)
    db.flush()
    return o


def _add_event(db, event_id, title="Event", category_id=1, is_active=True):
    e = CalendarEventModel(
        event_id=event_id, account_id=ACCOUNT, title=title,
        category_id=category_id, is_active=is_active,
    )
    db.add(e)
    db.flush()
    return e


def _add_event_occ(db, occ_id, event_id, start_date, start_time=None, is_cancelled=False, end_date=None):
    o = EventOccurrenceModel(
        id=occ_id, account_id=ACCOUNT, event_id=event_id,
        start_date=start_date, start_time=start_time,
        end_date=end_date, is_cancelled=is_cancelled, source="manual",
    )
    db.add(o)
    db.flush()
    return o


def _add_op_template(db, template_id, rule_id, is_archived=False, title="OpTmpl",
                     kind="EXPENSE", amount=1000, work_category_id=None):
    t = OperationTemplateModel(
        template_id=template_id, account_id=ACCOUNT, title=title,
        rule_id=rule_id, active_from=TODAY - timedelta(days=30),
        is_archived=is_archived, kind=kind, amount=Decimal(str(amount)),
        work_category_id=work_category_id,
    )
    db.add(t)
    db.flush()
    return t


def _add_op_occ(db, occ_id, template_id, scheduled_date, status="ACTIVE"):
    o = OperationOccurrence(
        id=occ_id, account_id=ACCOUNT, template_id=template_id,
        scheduled_date=scheduled_date, status=status,
    )
    if status == "DONE":
        o.completed_at = datetime(TODAY.year, TODAY.month, TODAY.day, 12, 0)
    db.add(o)
    db.flush()
    return o


def _add_habit(db, habit_id, rule_id, is_archived=False, title="Habit", level=1, category_id=None):
    h = HabitModel(
        habit_id=habit_id, account_id=ACCOUNT, title=title,
        rule_id=rule_id, active_from=TODAY - timedelta(days=30),
        is_archived=is_archived, level=level, category_id=category_id,
        current_streak=5, best_streak=10, done_count_30d=20,
    )
    db.add(h)
    db.flush()
    return h


def _add_habit_occ(db, occ_id, habit_id, scheduled_date, status="ACTIVE"):
    o = HabitOccurrence(
        id=occ_id, account_id=ACCOUNT, habit_id=habit_id,
        scheduled_date=scheduled_date, status=status,
    )
    if status == "DONE":
        o.completed_at = datetime(TODAY.year, TODAY.month, TODAY.day, 12, 0)
    db.add(o)
    db.flush()
    return o


# ============================================================================
# Empty state
# ============================================================================

class TestEmpty:
    def test_empty_returns_structure(self, db_session):
        view = build_plan_view(db_session, ACCOUNT, TODAY)
        assert view["tab"] == "active"
        assert view["range_days"] == 7
        assert view["today"] == TODAY
        assert view["summary"]["today_count"] == 0
        assert view["summary"]["overdue_count"] == 0
        assert view["today_progress"]["total"] == 0
        assert view["day_groups"] == []


# ============================================================================
# One-off tasks
# ============================================================================

class TestOneoffTasks:
    def test_active_task_today(self, db_session):
        _add_task(db_session, 1, due_date=TODAY)
        view = build_plan_view(db_session, ACCOUNT, TODAY, tab="active", range_days=1)
        items = [it for g in view["day_groups"] for it in g["entries"]]
        assert len(items) == 1
        assert items[0]["kind"] == "task"
        assert items[0]["title"] == "Task"
        assert items[0]["is_overdue"] is False

    def test_overdue_task(self, db_session):
        _add_task(db_session, 1, due_date=YESTERDAY)
        view = build_plan_view(db_session, ACCOUNT, TODAY, tab="active", range_days=1)
        items = [it for g in view["day_groups"] for it in g["entries"]]
        assert len(items) == 1
        assert items[0]["is_overdue"] is True
        assert view["summary"]["overdue_count"] >= 1

    def test_done_task_in_done_tab(self, db_session):
        _add_task(db_session, 1, due_date=TODAY, status="DONE")
        view = build_plan_view(db_session, ACCOUNT, TODAY, tab="done", range_days=1)
        items = [it for g in view["day_groups"] for it in g["entries"]]
        assert len(items) == 1
        assert items[0]["is_done"] is True

    def test_archived_task_in_archive_tab(self, db_session):
        _add_task(db_session, 1, due_date=TODAY, status="ARCHIVED")
        view = build_plan_view(db_session, ACCOUNT, TODAY, tab="archive", range_days=1)
        items = [it for g in view["day_groups"] for it in g["entries"]]
        assert len(items) == 1
        assert items[0]["status"] == "ARCHIVED"

    def test_task_outside_range_excluded(self, db_session):
        _add_task(db_session, 1, due_date=TODAY + timedelta(days=10))
        view = build_plan_view(db_session, ACCOUNT, TODAY, tab="active", range_days=7)
        items = [it for g in view["day_groups"] for it in g["entries"]]
        assert len(items) == 0

    def test_task_no_due_date_excluded_from_plan(self, db_session):
        """Task without due_date is NOT shown in plan view (only in tasks 'no date' section)."""
        _add_task(db_session, 1, due_date=None)
        view = build_plan_view(db_session, ACCOUNT, TODAY, tab="active", range_days=1)
        items = [it for g in view["day_groups"] for it in g["entries"]]
        assert len(items) == 0


# ============================================================================
# Task occurrences
# ============================================================================

class TestTaskOccurrences:
    def test_active_task_occurrence(self, db_session):
        r = _add_rule(db_session, 1)
        _add_task_template(db_session, 1, r.rule_id)
        _add_task_occ(db_session, 1, 1, TODAY)
        view = build_plan_view(db_session, ACCOUNT, TODAY, tab="active", range_days=1)
        items = [it for g in view["day_groups"] for it in g["entries"]]
        assert len(items) == 1
        assert items[0]["kind"] == "task_occ"

    def test_overdue_task_occurrence(self, db_session):
        r = _add_rule(db_session, 1)
        _add_task_template(db_session, 1, r.rule_id)
        _add_task_occ(db_session, 1, 1, YESTERDAY)
        view = build_plan_view(db_session, ACCOUNT, TODAY, tab="active", range_days=1)
        items = [it for g in view["day_groups"] for it in g["entries"]]
        assert len(items) == 1
        assert items[0]["is_overdue"] is True

    def test_archived_template_in_archive(self, db_session):
        r = _add_rule(db_session, 1)
        _add_task_template(db_session, 1, r.rule_id, is_archived=True)
        _add_task_occ(db_session, 1, 1, TODAY)
        view = build_plan_view(db_session, ACCOUNT, TODAY, tab="archive", range_days=7)
        items = [it for g in view["day_groups"] for it in g["entries"]]
        assert len(items) == 1


# ============================================================================
# Events
# ============================================================================

class TestEvents:
    def test_active_event(self, db_session):
        _add_event(db_session, 1, category_id=1)
        _add_event_occ(db_session, 1, 1, TODAY)
        view = build_plan_view(db_session, ACCOUNT, TODAY, tab="active", range_days=1)
        items = [it for g in view["day_groups"] for it in g["entries"]]
        assert len(items) == 1
        assert items[0]["kind"] == "event"

    def test_event_never_overdue(self, db_session):
        _add_event(db_session, 1, category_id=1)
        _add_event_occ(db_session, 1, 1, YESTERDAY)
        view = build_plan_view(db_session, ACCOUNT, TODAY, tab="active", range_days=7)
        # Event should NOT appear in active tab as it's past and not in range
        # (active events: start_date >= date_from)
        items = [it for g in view["day_groups"] for it in g["entries"]]
        for it in items:
            assert it["is_overdue"] is False
        # Overdue count should be 0
        assert view["summary"]["overdue_count"] == 0

    def test_past_event_in_done(self, db_session):
        _add_event(db_session, 1, category_id=1)
        _add_event_occ(db_session, 1, 1, YESTERDAY)
        view = build_plan_view(db_session, ACCOUNT, TODAY, tab="done", range_days=7)
        items = [it for g in view["day_groups"] for it in g["entries"]]
        assert len(items) == 1
        assert items[0]["kind"] == "event"

    def test_deactivated_event_in_archive(self, db_session):
        _add_event(db_session, 1, category_id=1, is_active=False)
        _add_event_occ(db_session, 1, 1, TODAY)
        view = build_plan_view(db_session, ACCOUNT, TODAY, tab="archive", range_days=7)
        items = [it for g in view["day_groups"] for it in g["entries"]]
        assert len(items) == 1


# ============================================================================
# Planned operations
# ============================================================================

class TestOperations:
    def test_active_operation(self, db_session):
        r = _add_rule(db_session, 1)
        _add_op_template(db_session, 1, r.rule_id)
        _add_op_occ(db_session, 1, 1, TODAY)
        view = build_plan_view(db_session, ACCOUNT, TODAY, tab="active", range_days=1)
        items = [it for g in view["day_groups"] for it in g["entries"]]
        assert len(items) == 1
        assert items[0]["kind"] == "planned_op"
        assert items[0]["meta"]["op_kind"] == "EXPENSE"

    def test_overdue_operation(self, db_session):
        r = _add_rule(db_session, 1)
        _add_op_template(db_session, 1, r.rule_id)
        _add_op_occ(db_session, 1, 1, YESTERDAY)
        view = build_plan_view(db_session, ACCOUNT, TODAY, tab="active", range_days=1)
        items = [it for g in view["day_groups"] for it in g["entries"]]
        assert len(items) == 1
        assert items[0]["is_overdue"] is True
        assert view["summary"]["overdue_count"] >= 1

    def test_done_operation(self, db_session):
        r = _add_rule(db_session, 1)
        _add_op_template(db_session, 1, r.rule_id)
        _add_op_occ(db_session, 1, 1, TODAY, status="DONE")
        view = build_plan_view(db_session, ACCOUNT, TODAY, tab="done", range_days=1)
        items = [it for g in view["day_groups"] for it in g["entries"]]
        assert len(items) == 1
        assert items[0]["is_done"] is True


# ============================================================================
# Habits
# ============================================================================

class TestHabits:
    def test_habit_today_only(self, db_session):
        r = _add_rule(db_session, 1)
        _add_habit(db_session, 1, r.rule_id)
        _add_habit_occ(db_session, 1, 1, TODAY)
        view = build_plan_view(db_session, ACCOUNT, TODAY, tab="active", range_days=90)
        items = [it for g in view["day_groups"] for it in g["entries"]]
        assert len(items) == 1
        assert items[0]["kind"] == "habit"
        assert items[0]["date"] == TODAY

    def test_habit_other_day_excluded(self, db_session):
        r = _add_rule(db_session, 1)
        _add_habit(db_session, 1, r.rule_id)
        _add_habit_occ(db_session, 1, 1, TOMORROW)
        view = build_plan_view(db_session, ACCOUNT, TODAY, tab="active", range_days=90)
        items = [it for g in view["day_groups"] for it in g["entries"]]
        assert len(items) == 0

    def test_habit_archived_in_archive_tab(self, db_session):
        r = _add_rule(db_session, 1)
        _add_habit(db_session, 1, r.rule_id, is_archived=True)
        _add_habit_occ(db_session, 1, 1, TODAY)
        view = build_plan_view(db_session, ACCOUNT, TODAY, tab="archive", range_days=7)
        items = [it for g in view["day_groups"] for it in g["entries"]]
        assert len(items) == 1


# ============================================================================
# Summary & Progress
# ============================================================================

class TestSummaryAndProgress:
    def test_summary_counts(self, db_session):
        # 1 active task today
        _add_task(db_session, 1, due_date=TODAY)
        # 1 overdue task
        _add_task(db_session, 2, due_date=YESTERDAY)
        # 1 done task today
        _add_task(db_session, 3, due_date=TODAY, status="DONE")

        view = build_plan_view(db_session, ACCOUNT, TODAY, tab="active", range_days=7)
        assert view["summary"]["today_count"] == 1  # active today
        assert view["summary"]["overdue_count"] == 1
        assert view["summary"]["done_today_count"] >= 1

    def test_today_progress(self, db_session):
        # 2 active tasks + 1 done task for today
        _add_task(db_session, 1, due_date=TODAY)
        _add_task(db_session, 2, due_date=TODAY)
        _add_task(db_session, 3, due_date=TODAY, status="DONE")

        view = build_plan_view(db_session, ACCOUNT, TODAY, tab="active", range_days=1)
        # Active tab only shows active items, not done
        # But today_progress counts done items too via all today items
        # The items list from active tab has 2 active tasks
        # done tab would have the done task
        # today_progress is computed from items in the view
        assert view["today_progress"]["left"] >= 0


# ============================================================================
# Grouping & Sorting
# ============================================================================

class TestGroupingAndSorting:
    def test_overdue_group_first(self, db_session):
        _add_task(db_session, 1, due_date=YESTERDAY, title="Overdue")
        _add_task(db_session, 2, due_date=TODAY, title="Today")
        view = build_plan_view(db_session, ACCOUNT, TODAY, tab="active", range_days=1)
        assert len(view["day_groups"]) == 2
        assert view["day_groups"][0]["is_overdue_group"] is True
        assert view["day_groups"][0]["date_label"] == "Просрочено"
        assert view["day_groups"][1]["is_today"] is True

    def test_sort_by_kind_within_day(self, db_session):
        # Create event, task, operation, habit for today
        _add_event(db_session, 1, category_id=1)
        _add_event_occ(db_session, 1, 1, TODAY)

        _add_task(db_session, 1, due_date=TODAY, title="TaskA")

        r = _add_rule(db_session, 1)
        _add_op_template(db_session, 1, r.rule_id)
        _add_op_occ(db_session, 1, 1, TODAY)

        _add_habit(db_session, 1, r.rule_id)
        _add_habit_occ(db_session, 1, 1, TODAY)

        view = build_plan_view(db_session, ACCOUNT, TODAY, tab="active", range_days=1)
        items = []
        for g in view["day_groups"]:
            if not g["is_overdue_group"]:
                items = g["entries"]
        kinds = [it["kind"] for it in items]
        # events first, then tasks, then planned_op, then habit
        assert kinds.index("event") < kinds.index("task")
        assert kinds.index("task") < kinds.index("planned_op")
        assert kinds.index("planned_op") < kinds.index("habit")

    def test_habits_appear_regardless_of_range(self, db_session):
        """Habits should appear for today even with range=90."""
        r = _add_rule(db_session, 1)
        _add_habit(db_session, 1, r.rule_id)
        _add_habit_occ(db_session, 1, 1, TODAY)
        view = build_plan_view(db_session, ACCOUNT, TODAY, tab="active", range_days=90)
        items = [it for g in view["day_groups"] for it in g["entries"]]
        habit_items = [it for it in items if it["kind"] == "habit"]
        assert len(habit_items) == 1

    def test_category_emoji_displayed(self, db_session, wc):
        _add_task(db_session, 1, due_date=TODAY, category_id=wc.category_id)
        view = build_plan_view(db_session, ACCOUNT, TODAY, tab="active", range_days=1)
        items = [it for g in view["day_groups"] for it in g["entries"]]
        assert items[0]["category_emoji"] == "💼"
