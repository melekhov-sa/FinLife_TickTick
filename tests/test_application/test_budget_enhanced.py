"""
Tests for Budget Enhancement: multi-grain view, category filter, planned occurrences, ordering.
"""
import pytest
from datetime import datetime, date, timedelta
from decimal import Decimal

from app.infrastructure.db.models import (
    BudgetMonth, BudgetLine, CategoryInfo, TransactionFeed,
    OperationTemplateModel, OperationOccurrence, RecurrenceRuleModel,
)
from app.application.budget import (
    EnsureBudgetMonthUseCase, SetBudgetLineUseCase,
    BudgetViewService, ensure_budget_positions, swap_budget_position,
)


_NOW = datetime(2026, 2, 14, 12, 0, 0)
ACCOUNT = 1


@pytest.fixture
def setup_categories(db_session):
    """Create basic financial categories."""
    cats = [
        CategoryInfo(
            category_id=1, account_id=ACCOUNT,
            title="Зарплата", category_type="INCOME",
            is_archived=False, is_system=False, sort_order=0,
            created_at=_NOW,
        ),
        CategoryInfo(
            category_id=2, account_id=ACCOUNT,
            title="Фриланс", category_type="INCOME",
            is_archived=False, is_system=False, sort_order=1,
            created_at=_NOW,
        ),
        CategoryInfo(
            category_id=3, account_id=ACCOUNT,
            title="Еда", category_type="EXPENSE",
            is_archived=False, is_system=False, sort_order=0,
            created_at=_NOW,
        ),
        CategoryInfo(
            category_id=4, account_id=ACCOUNT,
            title="Транспорт", category_type="EXPENSE",
            is_archived=False, is_system=False, sort_order=1,
            created_at=_NOW,
        ),
        CategoryInfo(
            category_id=90, account_id=ACCOUNT,
            title="Прочие доходы", category_type="INCOME",
            is_archived=False, is_system=True, sort_order=99,
            created_at=_NOW,
        ),
        CategoryInfo(
            category_id=91, account_id=ACCOUNT,
            title="Прочие расходы", category_type="EXPENSE",
            is_archived=False, is_system=True, sort_order=99,
            created_at=_NOW,
        ),
    ]
    db_session.add_all(cats)
    db_session.flush()
    return cats


def _add_recurrence_rule(db, rule_id: int, freq: str = "MONTHLY", start: str = "2026-01-01"):
    rule = RecurrenceRuleModel(
        rule_id=rule_id,
        account_id=ACCOUNT,
        freq=freq,
        interval=1,
        start_date=date.fromisoformat(start),
    )
    db.add(rule)
    db.flush()
    return rule_id


def _add_operation_template(db, template_id: int, rule_id: int, kind: str, amount: Decimal, category_id: int):
    tmpl = OperationTemplateModel(
        template_id=template_id,
        account_id=ACCOUNT,
        title=f"Template {template_id}",
        rule_id=rule_id,
        active_from=date(2026, 1, 1),
        kind=kind,
        amount=amount,
        category_id=category_id,
    )
    db.add(tmpl)
    db.flush()
    return template_id


def _add_operation_occurrence(db, occ_id: int, template_id: int, scheduled: date, status: str = "ACTIVE"):
    occ = OperationOccurrence(
        id=occ_id,
        account_id=ACCOUNT,
        template_id=template_id,
        scheduled_date=scheduled,
        status=status,
    )
    db.add(occ)
    db.flush()
    return occ


# ===========================================================================
# Month grain tests
# ===========================================================================

class TestMonthView:
    def test_month_view_with_manual_plan(self, db_session, setup_categories):
        """Month grain: manual plan from BudgetLine works as before."""
        mid = EnsureBudgetMonthUseCase(db_session).execute(ACCOUNT, 2026, 2)
        SetBudgetLineUseCase(db_session).execute(ACCOUNT, mid, 1, "INCOME", "50000")

        view = BudgetViewService(db_session).build(
            account_id=ACCOUNT, grain="month", year=2026, month=2,
        )

        salary = next(l for l in view["income_lines"] if l["category_id"] == 1)
        assert salary["plan_manual"] == Decimal("50000")
        assert salary["plan"] == Decimal("50000")
        assert view["has_manual_plan"] is True

    def test_month_view_with_planned_occurrences(self, db_session, setup_categories):
        """Month grain: planned operations add to plan column."""
        rule_id = _add_recurrence_rule(db_session, 100)
        tmpl_id = _add_operation_template(db_session, 200, rule_id, "INCOME", Decimal("15000"), category_id=1)
        _add_operation_occurrence(db_session, 300, tmpl_id, date(2026, 2, 15))

        view = BudgetViewService(db_session).build(
            account_id=ACCOUNT, grain="month", year=2026, month=2,
        )

        salary = next(l for l in view["income_lines"] if l["category_id"] == 1)
        assert salary["plan_planned"] == Decimal("15000")
        assert salary["plan"] == Decimal("15000")  # no manual plan

    def test_month_view_combines_manual_and_planned(self, db_session, setup_categories):
        """Month grain: manual plan + planned occurrences sum correctly."""
        mid = EnsureBudgetMonthUseCase(db_session).execute(ACCOUNT, 2026, 2)
        SetBudgetLineUseCase(db_session).execute(ACCOUNT, mid, 1, "INCOME", "50000")

        rule_id = _add_recurrence_rule(db_session, 101)
        tmpl_id = _add_operation_template(db_session, 201, rule_id, "INCOME", Decimal("10000"), category_id=1)
        _add_operation_occurrence(db_session, 301, tmpl_id, date(2026, 2, 10))

        view = BudgetViewService(db_session).build(
            account_id=ACCOUNT, grain="month", year=2026, month=2,
        )

        salary = next(l for l in view["income_lines"] if l["category_id"] == 1)
        assert salary["plan_manual"] == Decimal("50000")
        assert salary["plan_planned"] == Decimal("10000")
        assert salary["plan"] == Decimal("60000")


# ===========================================================================
# Day grain tests
# ===========================================================================

class TestDayView:
    def test_day_view_plan_from_occurrences_only(self, db_session, setup_categories):
        """Day grain: plan comes from planned occurrences only, no manual plan."""
        # Set manual plan (should NOT appear in day view)
        mid = EnsureBudgetMonthUseCase(db_session).execute(ACCOUNT, 2026, 2)
        SetBudgetLineUseCase(db_session).execute(ACCOUNT, mid, 3, "EXPENSE", "20000")

        # Add planned occurrence for Feb 14
        rule_id = _add_recurrence_rule(db_session, 102)
        tmpl_id = _add_operation_template(db_session, 202, rule_id, "EXPENSE", Decimal("500"), category_id=3)
        _add_operation_occurrence(db_session, 302, tmpl_id, date(2026, 2, 14))

        view = BudgetViewService(db_session).build(
            account_id=ACCOUNT, grain="day", date_param=date(2026, 2, 14),
        )

        food = next(l for l in view["expense_lines"] if l["category_id"] == 3)
        assert food["plan"] == Decimal("500")  # only from occurrence
        assert food["plan_manual"] == Decimal("0")  # no manual plan for day
        assert view["has_manual_plan"] is False

    def test_day_view_fact_from_transactions(self, db_session, setup_categories):
        """Day grain: fact comes only from transactions on that day."""
        # Feb 14 transaction
        db_session.add(TransactionFeed(
            transaction_id=100, account_id=ACCOUNT,
            operation_type="EXPENSE", amount=Decimal("1200"), currency="RUB",
            wallet_id=1, category_id=3, description="Обед",
            occurred_at=datetime(2026, 2, 14, 13, 0),
        ))
        # Feb 15 transaction (should NOT appear)
        db_session.add(TransactionFeed(
            transaction_id=101, account_id=ACCOUNT,
            operation_type="EXPENSE", amount=Decimal("9999"), currency="RUB",
            wallet_id=1, category_id=3, description="Другой день",
            occurred_at=datetime(2026, 2, 15, 10, 0),
        ))
        db_session.flush()

        view = BudgetViewService(db_session).build(
            account_id=ACCOUNT, grain="day", date_param=date(2026, 2, 14),
        )

        food = next(l for l in view["expense_lines"] if l["category_id"] == 3)
        assert food["fact"] == Decimal("1200")


# ===========================================================================
# Week grain tests
# ===========================================================================

class TestWeekView:
    def test_week_range_monday_to_sunday(self, db_session, setup_categories):
        """Week grain: date range is Monday through Sunday."""
        # Feb 14, 2026 is a Saturday. Week = Mon Feb 9 - Sun Feb 15
        # Add transaction on Feb 10 (Tuesday) — should be included
        db_session.add(TransactionFeed(
            transaction_id=200, account_id=ACCOUNT,
            operation_type="INCOME", amount=Decimal("5000"), currency="RUB",
            wallet_id=1, category_id=1, description="Тест",
            occurred_at=datetime(2026, 2, 10, 10, 0),
        ))
        # Transaction on Feb 16 (Monday next week) — should NOT be included
        db_session.add(TransactionFeed(
            transaction_id=201, account_id=ACCOUNT,
            operation_type="INCOME", amount=Decimal("9999"), currency="RUB",
            wallet_id=1, category_id=1, description="След неделя",
            occurred_at=datetime(2026, 2, 16, 10, 0),
        ))
        db_session.flush()

        view = BudgetViewService(db_session).build(
            account_id=ACCOUNT, grain="week", date_param=date(2026, 2, 14),
        )

        salary = next(l for l in view["income_lines"] if l["category_id"] == 1)
        assert salary["fact"] == Decimal("5000")
        assert view["grain"] == "week"


# ===========================================================================
# Year grain tests
# ===========================================================================

class TestYearView:
    def test_year_view_aggregates_all_months(self, db_session, setup_categories):
        """Year grain: fact aggregates transactions across the full year."""
        db_session.add(TransactionFeed(
            transaction_id=300, account_id=ACCOUNT,
            operation_type="EXPENSE", amount=Decimal("1000"), currency="RUB",
            wallet_id=1, category_id=3, description="Январь",
            occurred_at=datetime(2026, 1, 15),
        ))
        db_session.add(TransactionFeed(
            transaction_id=301, account_id=ACCOUNT,
            operation_type="EXPENSE", amount=Decimal("2000"), currency="RUB",
            wallet_id=1, category_id=3, description="Июнь",
            occurred_at=datetime(2026, 6, 15),
        ))
        db_session.add(TransactionFeed(
            transaction_id=302, account_id=ACCOUNT,
            operation_type="EXPENSE", amount=Decimal("3000"), currency="RUB",
            wallet_id=1, category_id=3, description="Декабрь",
            occurred_at=datetime(2026, 12, 30),
        ))
        db_session.flush()

        view = BudgetViewService(db_session).build(
            account_id=ACCOUNT, grain="year", year=2026,
        )

        food = next(l for l in view["expense_lines"] if l["category_id"] == 3)
        assert food["fact"] == Decimal("6000")
        assert view["has_manual_plan"] is False


# ===========================================================================
# Category filter tests
# ===========================================================================

class TestCategoryFilter:
    def test_category_filter_limits_lines(self, db_session, setup_categories):
        """Category filter: only selected categories in output."""
        db_session.add(TransactionFeed(
            transaction_id=400, account_id=ACCOUNT,
            operation_type="EXPENSE", amount=Decimal("500"), currency="RUB",
            wallet_id=1, category_id=3, description="Еда",
            occurred_at=datetime(2026, 2, 10),
        ))
        db_session.add(TransactionFeed(
            transaction_id=401, account_id=ACCOUNT,
            operation_type="EXPENSE", amount=Decimal("300"), currency="RUB",
            wallet_id=1, category_id=4, description="Метро",
            occurred_at=datetime(2026, 2, 10),
        ))
        db_session.flush()

        # Filter to only category 3 (Еда)
        view = BudgetViewService(db_session).build(
            account_id=ACCOUNT, grain="month", year=2026, month=2,
            category_ids=[3],
        )

        expense_cat_ids = [l["category_id"] for l in view["expense_lines"]]
        assert 3 in expense_cat_ids
        assert 4 not in expense_cat_ids

    def test_category_filter_totals_recalculated(self, db_session, setup_categories):
        """Category filter: totals reflect filtered set only."""
        mid = EnsureBudgetMonthUseCase(db_session).execute(ACCOUNT, 2026, 2)
        SetBudgetLineUseCase(db_session).execute(ACCOUNT, mid, 1, "INCOME", "50000")
        SetBudgetLineUseCase(db_session).execute(ACCOUNT, mid, 2, "INCOME", "10000")

        # Filter to only category 1
        view = BudgetViewService(db_session).build(
            account_id=ACCOUNT, grain="month", year=2026, month=2,
            category_ids=[1],
        )

        # Total income plan should be 50000, not 60000
        assert view["totals"]["plan_income"] == Decimal("50000")


# ===========================================================================
# Ordering tests
# ===========================================================================

class TestOrdering:
    def _setup_lines(self, db_session, setup_categories):
        mid = EnsureBudgetMonthUseCase(db_session).execute(ACCOUNT, 2026, 2)
        SetBudgetLineUseCase(db_session).execute(ACCOUNT, mid, 3, "EXPENSE", "20000")
        SetBudgetLineUseCase(db_session).execute(ACCOUNT, mid, 4, "EXPENSE", "5000")
        return mid

    def test_position_initial_assignment(self, db_session, setup_categories):
        """First access auto-assigns sequential positions."""
        mid = self._setup_lines(db_session, setup_categories)

        ensure_budget_positions(db_session, mid, "EXPENSE")

        lines = db_session.query(BudgetLine).filter(
            BudgetLine.budget_month_id == mid,
            BudgetLine.kind == "EXPENSE",
        ).order_by(BudgetLine.position).all()

        positions = [l.position for l in lines]
        assert positions == [1, 2]

    def test_position_swap_down(self, db_session, setup_categories):
        """Category moves down, adjacent moves up."""
        mid = self._setup_lines(db_session, setup_categories)
        ensure_budget_positions(db_session, mid, "EXPENSE")

        # Get the first line
        first_line = db_session.query(BudgetLine).filter(
            BudgetLine.budget_month_id == mid,
            BudgetLine.kind == "EXPENSE",
            BudgetLine.position == 1,
        ).first()
        first_cat_id = first_line.category_id

        # Move first down
        result = swap_budget_position(db_session, mid, first_cat_id, "EXPENSE", "down")
        assert result is True

        # First line should now be position 2
        updated = db_session.query(BudgetLine).filter(
            BudgetLine.budget_month_id == mid,
            BudgetLine.kind == "EXPENSE",
            BudgetLine.category_id == first_cat_id,
        ).first()
        assert updated.position == 2

    def test_position_swap_up(self, db_session, setup_categories):
        """Category moves up, adjacent moves down."""
        mid = self._setup_lines(db_session, setup_categories)
        ensure_budget_positions(db_session, mid, "EXPENSE")

        # Get the second line
        second_line = db_session.query(BudgetLine).filter(
            BudgetLine.budget_month_id == mid,
            BudgetLine.kind == "EXPENSE",
            BudgetLine.position == 2,
        ).first()
        second_cat_id = second_line.category_id

        # Move second up
        result = swap_budget_position(db_session, mid, second_cat_id, "EXPENSE", "up")
        assert result is True

        # Second line should now be position 1
        updated = db_session.query(BudgetLine).filter(
            BudgetLine.budget_month_id == mid,
            BudgetLine.kind == "EXPENSE",
            BudgetLine.category_id == second_cat_id,
        ).first()
        assert updated.position == 1
