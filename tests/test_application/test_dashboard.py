"""Tests for DashboardService V2."""
import pytest
from datetime import date, datetime, timedelta
from decimal import Decimal

from app.infrastructure.db.models import (
    TaskModel, TaskTemplateModel, TaskOccurrence,
    HabitModel, HabitOccurrence,
    OperationTemplateModel, OperationOccurrence,
    CalendarEventModel, EventOccurrenceModel,
    TransactionFeed, RecurrenceRuleModel, WorkCategory,
)
from app.application.dashboard import DashboardService


TODAY = date(2026, 2, 14)
YESTERDAY = TODAY - timedelta(days=1)
TOMORROW = TODAY + timedelta(days=1)
ACCOUNT = 1


# ---- helpers ----

def _add_task(db, task_id, due_date=None, status="ACTIVE", title="Task", category_id=None):
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


def _add_event(db, event_id, title="Event", category_id=None, is_active=True):
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


def _add_tx(db, tx_id, kind, amount, occurred_at, wallet_id=1, category_id=1):
    db.add(TransactionFeed(
        transaction_id=tx_id, account_id=ACCOUNT,
        operation_type=kind, amount=Decimal(str(amount)), currency="RUB",
        wallet_id=wallet_id, category_id=category_id, description="test",
        occurred_at=occurred_at,
    ))
    db.flush()


# ======================================================================
# get_today_block
# ======================================================================

class TestTodayBlockEmpty:
    def test_empty_state(self, db_session):
        svc = DashboardService(db_session)
        block = svc.get_today_block(ACCOUNT, TODAY)
        assert block["overdue"] == []
        assert block["active"] == []
        assert block["done"] == []
        assert block["progress"] == {"total": 0, "done": 0, "left": 0}


class TestTodayBlockOverdue:
    def test_overdue_task(self, db_session):
        """One-off task with due_date < today → appears in overdue."""
        _add_task(db_session, 1, due_date=YESTERDAY, title="Overdue task")
        block = DashboardService(db_session).get_today_block(ACCOUNT, TODAY)
        assert len(block["overdue"]) == 1
        assert block["overdue"][0]["title"] == "Overdue task"
        assert block["overdue"][0]["is_overdue"] is True

    def test_overdue_task_occ(self, db_session):
        """Recurring task occurrence scheduled < today → overdue."""
        r = _add_rule(db_session, 1)
        _add_task_template(db_session, 10, r.rule_id, title="Rec overdue")
        _add_task_occ(db_session, 100, 10, YESTERDAY)
        block = DashboardService(db_session).get_today_block(ACCOUNT, TODAY)
        assert len(block["overdue"]) == 1
        assert block["overdue"][0]["kind"] == "task_occ"

    def test_overdue_planned_op(self, db_session):
        """Planned op scheduled < today → overdue."""
        r = _add_rule(db_session, 1)
        _add_op_template(db_session, 10, r.rule_id, title="Rent", amount=50000)
        _add_op_occ(db_session, 100, 10, YESTERDAY)
        block = DashboardService(db_session).get_today_block(ACCOUNT, TODAY)
        assert len(block["overdue"]) == 1
        assert block["overdue"][0]["kind"] == "planned_op"
        assert block["overdue"][0]["meta"]["amount"] == Decimal("50000")

    def test_overdue_excluded_from_progress(self, db_session):
        """Overdue items don't inflate progress.total."""
        _add_task(db_session, 1, due_date=YESTERDAY)
        _add_task(db_session, 2, due_date=TODAY)
        block = DashboardService(db_session).get_today_block(ACCOUNT, TODAY)
        assert len(block["overdue"]) == 1
        assert len(block["active"]) == 1
        # Progress counts only today's items
        assert block["progress"]["total"] == 1
        assert block["progress"]["done"] == 0


class TestTodayBlockActive:
    def test_active_task_today(self, db_session):
        """Task with due_date == today → active."""
        _add_task(db_session, 1, due_date=TODAY, title="Today task")
        block = DashboardService(db_session).get_today_block(ACCOUNT, TODAY)
        assert len(block["active"]) == 1
        assert block["active"][0]["title"] == "Today task"

    def test_active_task_no_due_date(self, db_session):
        """Task without due_date → active today."""
        _add_task(db_session, 1, due_date=None, title="No-date task")
        block = DashboardService(db_session).get_today_block(ACCOUNT, TODAY)
        assert len(block["active"]) == 1

    def test_active_event_today(self, db_session):
        """Event with start_date == today → active."""
        _add_event(db_session, 1, title="Meeting", category_id=1)
        _add_event_occ(db_session, 1, 1, TODAY)
        block = DashboardService(db_session).get_today_block(ACCOUNT, TODAY)
        events = [it for it in block["active"] if it["kind"] == "event"]
        assert len(events) == 1
        assert events[0]["title"] == "Meeting"

    def test_active_habit_today(self, db_session):
        """Habit occurrence for today, ACTIVE status → active."""
        r = _add_rule(db_session, 1)
        _add_habit(db_session, 1, r.rule_id, title="Meditate")
        _add_habit_occ(db_session, 1, 1, TODAY, status="ACTIVE")
        block = DashboardService(db_session).get_today_block(ACCOUNT, TODAY)
        habits = [it for it in block["active"] if it["kind"] == "habit"]
        assert len(habits) == 1
        assert habits[0]["title"] == "Meditate"

    def test_active_planned_op_today(self, db_session):
        """Planned op for today → active."""
        r = _add_rule(db_session, 1)
        _add_op_template(db_session, 10, r.rule_id, title="Subscription")
        _add_op_occ(db_session, 100, 10, TODAY)
        block = DashboardService(db_session).get_today_block(ACCOUNT, TODAY)
        ops = [it for it in block["active"] if it["kind"] == "planned_op"]
        assert len(ops) == 1


class TestTodayBlockDone:
    def test_done_task_today(self, db_session):
        """Completed task with completed_at == today → done."""
        _add_task(db_session, 1, due_date=TODAY, status="DONE", title="Done task")
        block = DashboardService(db_session).get_today_block(ACCOUNT, TODAY)
        assert len(block["done"]) == 1
        assert block["done"][0]["title"] == "Done task"
        assert block["done"][0]["is_done"] is True

    def test_done_habit_today(self, db_session):
        """Habit occurrence DONE for today → done list."""
        r = _add_rule(db_session, 1)
        _add_habit(db_session, 1, r.rule_id, title="Run")
        _add_habit_occ(db_session, 1, 1, TODAY, status="DONE")
        block = DashboardService(db_session).get_today_block(ACCOUNT, TODAY)
        done_habits = [it for it in block["done"] if it["kind"] == "habit"]
        assert len(done_habits) == 1

    def test_done_task_occ_today(self, db_session):
        """Recurring task occurrence DONE + scheduled today → done."""
        r = _add_rule(db_session, 1)
        _add_task_template(db_session, 10, r.rule_id)
        _add_task_occ(db_session, 100, 10, TODAY, status="DONE")
        block = DashboardService(db_session).get_today_block(ACCOUNT, TODAY)
        assert len(block["done"]) == 1


class TestTodayBlockProgress:
    def test_progress_calculation(self, db_session):
        """Progress = active + done (today only), excludes overdue."""
        _add_task(db_session, 1, due_date=YESTERDAY)       # overdue
        _add_task(db_session, 2, due_date=TODAY)            # active
        _add_task(db_session, 3, due_date=TODAY, status="DONE")  # done
        r = _add_rule(db_session, 1)
        _add_habit(db_session, 1, r.rule_id)
        _add_habit_occ(db_session, 1, 1, TODAY, status="DONE")  # done habit
        _add_habit(db_session, 2, r.rule_id, title="Habit2")
        _add_habit_occ(db_session, 2, 2, TODAY, status="ACTIVE")  # active habit

        block = DashboardService(db_session).get_today_block(ACCOUNT, TODAY)
        # active: task#2 + habit#2 = 2
        # done: task#3 + habit#1 = 2
        # total = 4, done = 2, left = 2
        assert block["progress"]["total"] == 4
        assert block["progress"]["done"] == 2
        assert block["progress"]["left"] == 2

    def test_archived_templates_excluded(self, db_session):
        """Archived templates should not appear in any list."""
        r = _add_rule(db_session, 1)
        _add_task_template(db_session, 10, r.rule_id, is_archived=True)
        _add_task_occ(db_session, 100, 10, TODAY)
        _add_op_template(db_session, 20, r.rule_id, is_archived=True)
        _add_op_occ(db_session, 200, 20, TODAY)
        _add_habit(db_session, 1, r.rule_id, is_archived=True)
        _add_habit_occ(db_session, 1, 1, TODAY)

        block = DashboardService(db_session).get_today_block(ACCOUNT, TODAY)
        assert block["active"] == []
        assert block["overdue"] == []
        assert block["done"] == []


# ======================================================================
# get_upcoming_payments
# ======================================================================

class TestUpcomingPayments:
    def test_empty(self, db_session):
        result = DashboardService(db_session).get_upcoming_payments(ACCOUNT, TODAY)
        assert result == []

    def test_returns_future_ops_sorted(self, db_session):
        """Future ops sorted by date, limited by count."""
        r = _add_rule(db_session, 1)
        _add_op_template(db_session, 10, r.rule_id, title="Rent", amount=50000)
        _add_op_template(db_session, 11, r.rule_id, title="Internet", amount=800)
        _add_op_occ(db_session, 100, 10, TODAY + timedelta(days=3))
        _add_op_occ(db_session, 101, 11, TODAY + timedelta(days=1))

        result = DashboardService(db_session).get_upcoming_payments(ACCOUNT, TODAY, limit=3)
        assert len(result) == 2
        assert result[0]["title"] == "Internet"  # closer
        assert result[1]["title"] == "Rent"
        assert result[0]["days_until"] == 1
        assert result[1]["days_until"] == 3

    def test_limit_respected(self, db_session):
        r = _add_rule(db_session, 1)
        _add_op_template(db_session, 10, r.rule_id, title="Op1")
        for i in range(5):
            _add_op_occ(db_session, 100 + i, 10, TODAY + timedelta(days=i + 1))

        result = DashboardService(db_session).get_upcoming_payments(ACCOUNT, TODAY, limit=2)
        assert len(result) == 2

    def test_excludes_today_and_past(self, db_session):
        """Only future (> today), not today or past."""
        r = _add_rule(db_session, 1)
        _add_op_template(db_session, 10, r.rule_id)
        _add_op_occ(db_session, 100, 10, YESTERDAY)
        _add_op_occ(db_session, 101, 10, TODAY)
        _add_op_occ(db_session, 102, 10, TOMORROW)

        result = DashboardService(db_session).get_upcoming_payments(ACCOUNT, TODAY)
        assert len(result) == 1
        assert result[0]["scheduled_date"] == TOMORROW

    def test_excludes_archived_templates(self, db_session):
        r = _add_rule(db_session, 1)
        _add_op_template(db_session, 10, r.rule_id, is_archived=True)
        _add_op_occ(db_session, 100, 10, TOMORROW)

        result = DashboardService(db_session).get_upcoming_payments(ACCOUNT, TODAY)
        assert result == []

    def test_payment_meta(self, db_session):
        """Check that meta fields are populated correctly."""
        r = _add_rule(db_session, 1)
        _add_op_template(db_session, 10, r.rule_id, title="Salary", kind="INCOME", amount=100000)
        _add_op_occ(db_session, 100, 10, TOMORROW)

        result = DashboardService(db_session).get_upcoming_payments(ACCOUNT, TODAY)
        assert len(result) == 1
        pay = result[0]
        assert pay["kind"] == "INCOME"
        assert pay["kind_label"] == "Доход"
        assert pay["amount"] == Decimal("100000")
        assert pay["amount_formatted"] == "100 000"


# ======================================================================
# get_habit_heatmap
# ======================================================================

class TestHabitHeatmap:
    def test_empty_no_habits(self, db_session):
        result = DashboardService(db_session).get_habit_heatmap(ACCOUNT, TODAY, days=15)
        assert result == []

    def test_15_days_returned(self, db_session):
        r = _add_rule(db_session, 1)
        _add_habit(db_session, 1, r.rule_id, title="Walk")
        result = DashboardService(db_session).get_habit_heatmap(ACCOUNT, TODAY, days=15)
        assert len(result) == 15
        assert result[0]["date"] == TODAY - timedelta(days=14)
        assert result[-1]["date"] == TODAY

    def test_level_calculation(self, db_session):
        """100% done → level 4, 0% → level 0."""
        r = _add_rule(db_session, 1)
        _add_habit(db_session, 1, r.rule_id, title="H1")
        _add_habit(db_session, 2, r.rule_id, title="H2")

        # Yesterday: 2/2 done → level 4
        _add_habit_occ(db_session, 10, 1, YESTERDAY, status="DONE")
        _add_habit_occ(db_session, 11, 2, YESTERDAY, status="DONE")

        # Today: 1/2 done → level 2 (50%)
        _add_habit_occ(db_session, 20, 1, TODAY, status="DONE")
        _add_habit_occ(db_session, 21, 2, TODAY, status="ACTIVE")

        result = DashboardService(db_session).get_habit_heatmap(ACCOUNT, TODAY, days=15)
        yesterday_cell = next(c for c in result if c["date"] == YESTERDAY)
        today_cell = next(c for c in result if c["date"] == TODAY)

        assert yesterday_cell["done_count"] == 2
        assert yesterday_cell["due_count"] == 2
        assert yesterday_cell["level"] == 4

        assert today_cell["done_count"] == 1
        assert today_cell["due_count"] == 2
        assert today_cell["level"] == 2  # 50% → level 2

    def test_no_occurrences_level_0(self, db_session):
        """Days with no occurrences → level 0."""
        r = _add_rule(db_session, 1)
        _add_habit(db_session, 1, r.rule_id)
        # Only add occurrence for today
        _add_habit_occ(db_session, 1, 1, TODAY, status="ACTIVE")

        result = DashboardService(db_session).get_habit_heatmap(ACCOUNT, TODAY, days=15)
        for cell in result:
            if cell["date"] != TODAY:
                assert cell["level"] == 0
                assert cell["due_count"] == 0

    def test_archived_habits_excluded(self, db_session):
        r = _add_rule(db_session, 1)
        _add_habit(db_session, 1, r.rule_id, is_archived=True)
        result = DashboardService(db_session).get_habit_heatmap(ACCOUNT, TODAY, days=15)
        assert result == []

    def test_ratio_field(self, db_session):
        """Verify ratio = done/due."""
        r = _add_rule(db_session, 1)
        _add_habit(db_session, 1, r.rule_id)
        _add_habit(db_session, 2, r.rule_id, title="H2")
        _add_habit(db_session, 3, r.rule_id, title="H3")
        _add_habit_occ(db_session, 1, 1, TODAY, status="DONE")
        _add_habit_occ(db_session, 2, 2, TODAY, status="ACTIVE")
        _add_habit_occ(db_session, 3, 3, TODAY, status="ACTIVE")

        result = DashboardService(db_session).get_habit_heatmap(ACCOUNT, TODAY, days=1)
        assert len(result) == 1
        cell = result[0]
        assert cell["done_count"] == 1
        assert cell["due_count"] == 3
        assert abs(cell["ratio"] - 1 / 3) < 0.01
        assert cell["level"] == 1  # <34% → level 1


# ======================================================================
# get_financial_summary
# ======================================================================

class TestFinancialSummary:
    def test_empty(self, db_session):
        result = DashboardService(db_session).get_financial_summary(ACCOUNT, TODAY)
        assert result["income"] == Decimal("0")
        assert result["expense"] == Decimal("0")
        assert result["difference"] == Decimal("0")

    def test_current_month_aggregation(self, db_session):
        """Only current month transactions counted."""
        _add_tx(db_session, 1, "INCOME", 100000, datetime(2026, 2, 5, 10, 0))
        _add_tx(db_session, 2, "INCOME", 50000, datetime(2026, 2, 10, 10, 0))
        _add_tx(db_session, 3, "EXPENSE", 30000, datetime(2026, 2, 8, 10, 0))
        # Previous month — should NOT count
        _add_tx(db_session, 4, "INCOME", 999999, datetime(2026, 1, 15, 10, 0))

        result = DashboardService(db_session).get_financial_summary(ACCOUNT, TODAY)
        assert result["income"] == Decimal("150000")
        assert result["expense"] == Decimal("30000")
        assert result["difference"] == Decimal("120000")

    def test_transfers_not_counted(self, db_session):
        """Transfers don't affect income or expense."""
        _add_tx(db_session, 1, "TRANSFER", 50000, datetime(2026, 2, 5, 10, 0))
        result = DashboardService(db_session).get_financial_summary(ACCOUNT, TODAY)
        assert result["income"] == Decimal("0")
        assert result["expense"] == Decimal("0")


# ======================================================================
# Integration: mixed scenario
# ======================================================================

class TestIntegrationMixed:
    def test_full_scenario(self, db_session):
        """A realistic day with all item types."""
        r = _add_rule(db_session, 1)

        # Overdue task
        _add_task(db_session, 1, due_date=YESTERDAY, title="Pay bill")
        # Active task today
        _add_task(db_session, 2, due_date=TODAY, title="Buy groceries")
        # Done task
        _add_task(db_session, 3, due_date=TODAY, status="DONE", title="Call doctor")

        # Overdue planned op
        _add_op_template(db_session, 10, r.rule_id, title="Rent", amount=50000)
        _add_op_occ(db_session, 100, 10, YESTERDAY)

        # Active planned op today
        _add_op_template(db_session, 11, r.rule_id, title="Phone", amount=500)
        _add_op_occ(db_session, 101, 11, TODAY)

        # Event today
        _add_event(db_session, 1, title="Meeting", category_id=1)
        _add_event_occ(db_session, 1, 1, TODAY)

        # Habits
        _add_habit(db_session, 1, r.rule_id, title="Meditate")
        _add_habit_occ(db_session, 1, 1, TODAY, status="ACTIVE")
        _add_habit(db_session, 2, r.rule_id, title="Exercise")
        _add_habit_occ(db_session, 2, 2, TODAY, status="DONE")

        # Upcoming payments
        _add_op_template(db_session, 12, r.rule_id, title="Internet", amount=800)
        _add_op_occ(db_session, 102, 12, TOMORROW)

        svc = DashboardService(db_session)
        block = svc.get_today_block(ACCOUNT, TODAY)

        # Overdue: task#1 + op#100
        assert len(block["overdue"]) == 2
        # Active: task#2 + op#101 + event#1 + habit#1
        assert len(block["active"]) == 4
        # Done: task#3 + habit#2
        assert len(block["done"]) == 2
        # Progress: total = active(4) + done(2) = 6, done = 2
        assert block["progress"]["total"] == 6
        assert block["progress"]["done"] == 2

        # Upcoming
        upcoming = svc.get_upcoming_payments(ACCOUNT, TODAY)
        assert len(upcoming) == 1
        assert upcoming[0]["title"] == "Internet"
