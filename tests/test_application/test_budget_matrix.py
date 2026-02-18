"""
Tests for BudgetMatrixService: multi-period matrix budget view.
"""
import pytest
from datetime import datetime, date, timedelta
from decimal import Decimal

from app.infrastructure.db.models import (
    BudgetMonth, BudgetLine, CategoryInfo, TransactionFeed,
    OperationTemplateModel, OperationOccurrence, RecurrenceRuleModel,
)
from app.application.budget import EnsureBudgetMonthUseCase, SetBudgetLineUseCase
from app.application.budget_matrix import BudgetMatrixService


_NOW = datetime(2026, 2, 14, 12, 0, 0)
ACCOUNT = 1


@pytest.fixture
def setup_categories(db_session):
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


def _add_tx(db, tx_id, kind, amount, cat_id, occurred_at):
    db.add(TransactionFeed(
        transaction_id=tx_id, account_id=ACCOUNT,
        operation_type=kind, amount=Decimal(str(amount)), currency="RUB",
        wallet_id=1, category_id=cat_id, description="test",
        occurred_at=occurred_at,
    ))
    db.flush()


def _add_recurrence_rule(db, rule_id, freq="MONTHLY", start="2026-01-01"):
    rule = RecurrenceRuleModel(
        rule_id=rule_id, account_id=ACCOUNT,
        freq=freq, interval=1,
        start_date=date.fromisoformat(start),
    )
    db.add(rule)
    db.flush()
    return rule_id


def _add_operation_template(db, template_id, rule_id, kind, amount, category_id):
    tmpl = OperationTemplateModel(
        template_id=template_id, account_id=ACCOUNT,
        title=f"Template {template_id}", rule_id=rule_id,
        active_from=date(2026, 1, 1),
        kind=kind, amount=Decimal(str(amount)),
        category_id=category_id,
    )
    db.add(tmpl)
    db.flush()
    return template_id


def _add_occurrence(db, occ_id, template_id, scheduled, status="ACTIVE"):
    db.add(OperationOccurrence(
        id=occ_id, account_id=ACCOUNT,
        template_id=template_id,
        scheduled_date=scheduled,
        status=status,
    ))
    db.flush()


# ======================================================================
# Period computation
# ======================================================================

class TestPeriodComputation:
    def test_matrix_month_3_periods(self, db_session, setup_categories):
        """3 months starting Jan 2026 → 3 periods with correct labels."""
        view = BudgetMatrixService(db_session).build(
            account_id=ACCOUNT, grain="month", range_count=3,
            anchor_year=2026, anchor_month=1,
        )
        assert len(view["periods"]) == 3
        assert view["periods"][0]["label"] == "Январь 2026"
        assert view["periods"][1]["label"] == "Февраль 2026"
        assert view["periods"][2]["label"] == "Март 2026"
        assert view["periods"][0]["range_start"] == date(2026, 1, 1)
        assert view["periods"][0]["range_end"] == date(2026, 2, 1)

    def test_matrix_day_7_periods(self, db_session, setup_categories):
        """7 days starting Feb 10 → 7 consecutive day columns."""
        view = BudgetMatrixService(db_session).build(
            account_id=ACCOUNT, grain="day", range_count=7,
            anchor_date=date(2026, 2, 10),
        )
        assert len(view["periods"]) == 7
        assert view["periods"][0]["range_start"] == date(2026, 2, 10)
        assert view["periods"][6]["range_start"] == date(2026, 2, 16)
        # Each day period is 1 day wide
        for p in view["periods"]:
            assert p["range_end"] - p["range_start"] == timedelta(days=1)

    def test_matrix_week_3_periods(self, db_session, setup_categories):
        """3 weeks from Feb 9 (Mon) → Mon-Sun ranges."""
        view = BudgetMatrixService(db_session).build(
            account_id=ACCOUNT, grain="week", range_count=3,
            anchor_date=date(2026, 2, 9),  # Monday
        )
        assert len(view["periods"]) == 3
        # Week 1: Feb 9 (Mon) - Feb 16 (Mon exclusive)
        assert view["periods"][0]["range_start"] == date(2026, 2, 9)
        assert view["periods"][0]["range_end"] == date(2026, 2, 16)
        # Week 2: Feb 16 - Feb 23
        assert view["periods"][1]["range_start"] == date(2026, 2, 16)
        # Week 3: Feb 23 - Mar 2
        assert view["periods"][2]["range_start"] == date(2026, 2, 23)

    def test_matrix_year_grain(self, db_session, setup_categories):
        """Year grain with range_count=2 → 2 years."""
        view = BudgetMatrixService(db_session).build(
            account_id=ACCOUNT, grain="year", range_count=2,
            anchor_year=2026,
        )
        assert len(view["periods"]) == 2
        assert view["periods"][0]["label"] == "2026"
        assert view["periods"][1]["label"] == "2027"
        assert view["periods"][0]["range_start"] == date(2026, 1, 1)
        assert view["periods"][0]["range_end"] == date(2027, 1, 1)


# ======================================================================
# Fact bucketing
# ======================================================================

class TestFactBucketing:
    def test_fact_bucketed_correctly(self, db_session, setup_categories):
        """Transactions in Jan, Feb, Mar land in correct columns."""
        _add_tx(db_session, 1, "INCOME", 10000, 1, datetime(2026, 1, 15))
        _add_tx(db_session, 2, "INCOME", 20000, 1, datetime(2026, 2, 15))
        _add_tx(db_session, 3, "INCOME", 30000, 1, datetime(2026, 3, 15))

        view = BudgetMatrixService(db_session).build(
            account_id=ACCOUNT, grain="month", range_count=3,
            anchor_year=2026, anchor_month=1,
        )

        salary = next(r for r in view["income_rows"] if r["category_id"] == 1)
        assert salary["cells"][0]["fact"] == Decimal("10000")
        assert salary["cells"][1]["fact"] == Decimal("20000")
        assert salary["cells"][2]["fact"] == Decimal("30000")

    def test_empty_periods_produce_zeros(self, db_session, setup_categories):
        """Periods without data → zero cells, not missing."""
        view = BudgetMatrixService(db_session).build(
            account_id=ACCOUNT, grain="month", range_count=3,
            anchor_year=2026, anchor_month=1,
        )
        for row in view["income_rows"]:
            assert len(row["cells"]) == 3
            for cell in row["cells"]:
                assert cell["fact"] == Decimal("0")
                assert cell["plan"] == Decimal("0")


# ======================================================================
# Planned occurrence bucketing
# ======================================================================

class TestPlannedBucketing:
    def test_planned_bucketed_correctly(self, db_session, setup_categories):
        """Planned occurrences in different months go to correct cells."""
        rule_id = _add_recurrence_rule(db_session, 100)
        tmpl_id = _add_operation_template(db_session, 200, rule_id, "EXPENSE", 5000, 3)
        _add_occurrence(db_session, 301, tmpl_id, date(2026, 1, 20))
        _add_occurrence(db_session, 302, tmpl_id, date(2026, 3, 20))

        view = BudgetMatrixService(db_session).build(
            account_id=ACCOUNT, grain="month", range_count=3,
            anchor_year=2026, anchor_month=1,
        )

        food = next(r for r in view["expense_rows"] if r["category_id"] == 3)
        assert food["cells"][0]["plan"] == Decimal("5000")  # Jan
        assert food["cells"][1]["plan"] == Decimal("0")     # Feb — no occurrence
        assert food["cells"][2]["plan"] == Decimal("5000")  # Mar

    def test_no_manual_plan_day_grain(self, db_session, setup_categories):
        """Day grain: plan comes only from occurrences, not BudgetLine."""
        # Set manual plan for Feb 2026
        mid = EnsureBudgetMonthUseCase(db_session).execute(ACCOUNT, 2026, 2)
        SetBudgetLineUseCase(db_session).execute(ACCOUNT, mid, 3, "EXPENSE", "20000")

        # Planned occurrence on Feb 14
        rule_id = _add_recurrence_rule(db_session, 101)
        tmpl_id = _add_operation_template(db_session, 201, rule_id, "EXPENSE", 500, 3)
        _add_occurrence(db_session, 303, tmpl_id, date(2026, 2, 14))

        view = BudgetMatrixService(db_session).build(
            account_id=ACCOUNT, grain="day", range_count=3,
            anchor_date=date(2026, 2, 14),
        )

        food = next(r for r in view["expense_rows"] if r["category_id"] == 3)
        # Day 1 (Feb 14): plan from occurrence only, not BudgetLine
        assert food["cells"][0]["plan"] == Decimal("500")
        # Day 2, Day 3 — no occurrence
        assert food["cells"][1]["plan"] == Decimal("0")
        assert food["cells"][2]["plan"] == Decimal("0")


# ======================================================================
# Manual plan (month grain)
# ======================================================================

class TestManualPlan:
    def test_manual_plan_month_grain(self, db_session, setup_categories):
        """Month grain: BudgetLine amounts show in correct period cells."""
        mid1 = EnsureBudgetMonthUseCase(db_session).execute(ACCOUNT, 2026, 1)
        SetBudgetLineUseCase(db_session).execute(ACCOUNT, mid1, 1, "INCOME", "50000")

        mid2 = EnsureBudgetMonthUseCase(db_session).execute(ACCOUNT, 2026, 2)
        SetBudgetLineUseCase(db_session).execute(ACCOUNT, mid2, 1, "INCOME", "55000")

        view = BudgetMatrixService(db_session).build(
            account_id=ACCOUNT, grain="month", range_count=3,
            anchor_year=2026, anchor_month=1,
        )

        salary = next(r for r in view["income_rows"] if r["category_id"] == 1)
        assert salary["cells"][0]["plan"] == Decimal("50000")  # Jan
        assert salary["cells"][1]["plan"] == Decimal("55000")  # Feb
        assert salary["cells"][2]["plan"] == Decimal("0")      # Mar — no BudgetLine


# ======================================================================
# Totals
# ======================================================================

class TestTotals:
    def test_totals_equal_sum_of_cells(self, db_session, setup_categories):
        """Row total = sum of all cell values."""
        _add_tx(db_session, 10, "INCOME", 1000, 1, datetime(2026, 1, 5))
        _add_tx(db_session, 11, "INCOME", 2000, 1, datetime(2026, 2, 5))
        _add_tx(db_session, 12, "INCOME", 3000, 1, datetime(2026, 3, 5))

        view = BudgetMatrixService(db_session).build(
            account_id=ACCOUNT, grain="month", range_count=3,
            anchor_year=2026, anchor_month=1,
        )

        salary = next(r for r in view["income_rows"] if r["category_id"] == 1)
        assert salary["total"]["fact"] == sum(c["fact"] for c in salary["cells"])
        assert salary["total"]["fact"] == Decimal("6000")

        # Section totals also consistent
        it = view["income_totals"]
        assert it["total"]["fact"] == sum(c["fact"] for c in it["cells"])


# ======================================================================
# Category filter
# ======================================================================

class TestCategoryFilter:
    def test_category_filter(self, db_session, setup_categories):
        """Filtered output only contains selected categories."""
        _add_tx(db_session, 20, "EXPENSE", 500, 3, datetime(2026, 1, 10))
        _add_tx(db_session, 21, "EXPENSE", 300, 4, datetime(2026, 1, 10))

        view = BudgetMatrixService(db_session).build(
            account_id=ACCOUNT, grain="month", range_count=1,
            anchor_year=2026, anchor_month=1,
            category_ids=[3],
        )

        cat_ids = [r["category_id"] for r in view["expense_rows"]]
        assert 3 in cat_ids
        assert 4 not in cat_ids


class TestYearAggregation:
    """Test that YEAR grain aggregates monthly plans when base=MONTH."""

    def test_year_view_sums_monthly_plans(self, db_session, setup_categories):
        """With base_granularity=MONTH and grain=year, monthly plans are summed."""
        svc = BudgetMatrixService(db_session)

        # Create plans for Jan, Feb, Mar 2026
        for m in (1, 2, 3):
            mid = EnsureBudgetMonthUseCase(db_session).execute(ACCOUNT, 2026, m)
            SetBudgetLineUseCase(db_session).execute(ACCOUNT, mid, 1, "INCOME", "10000")
            SetBudgetLineUseCase(db_session).execute(ACCOUNT, mid, 3, "EXPENSE", "5000")

        view = svc.build(
            account_id=ACCOUNT,
            grain="year",
            range_count=1,
            anchor_year=2026,
            base_granularity="MONTH",
        )

        # Income row for cat 1: plan should be 10000 * 3 = 30000
        income_row = next(r for r in view["income_rows"] if r["category_id"] == 1)
        assert income_row["cells"][0]["plan"] == Decimal("30000")
        assert income_row["total"]["plan"] == Decimal("30000")

        # Expense row for cat 3: plan should be 5000 * 3 = 15000
        expense_row = next(r for r in view["expense_rows"] if r["category_id"] == 3)
        assert expense_row["cells"][0]["plan"] == Decimal("15000")

    def test_year_view_without_base_has_no_plan(self, db_session, setup_categories):
        """With base_granularity=YEAR (no monthly plans), plan should be zero."""
        svc = BudgetMatrixService(db_session)

        mid = EnsureBudgetMonthUseCase(db_session).execute(ACCOUNT, 2026, 1)
        SetBudgetLineUseCase(db_session).execute(ACCOUNT, mid, 1, "INCOME", "10000")

        view = svc.build(
            account_id=ACCOUNT,
            grain="year",
            range_count=1,
            anchor_year=2026,
            base_granularity="YEAR",
        )

        # With base=YEAR, monthly plans are NOT loaded (has_manual=False)
        income_row = next(r for r in view["income_rows"] if r["category_id"] == 1)
        assert income_row["cells"][0]["plan"] == Decimal("0")
