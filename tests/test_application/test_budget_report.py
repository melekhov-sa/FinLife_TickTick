"""
Tests for BudgetReportService.
"""
import pytest
from datetime import datetime
from decimal import Decimal

from app.infrastructure.db.models import (
    BudgetMonth, BudgetLine, BudgetGoalPlan, BudgetGoalWithdrawalPlan,
    CategoryInfo, TransactionFeed, GoalInfo, WalletBalance,
)
from app.application.budget_report import BudgetReportService


_NOW = datetime(2025, 10, 15, 12, 0, 0)
_D = Decimal


@pytest.fixture
def cats(db_session, sample_account_id):
    """Create expense + income categories."""
    items = [
        CategoryInfo(
            category_id=1, account_id=sample_account_id,
            title="Зарплата", category_type="INCOME",
            is_archived=False, is_system=False, sort_order=0, created_at=_NOW,
        ),
        CategoryInfo(
            category_id=2, account_id=sample_account_id,
            title="Фриланс", category_type="INCOME",
            is_archived=False, is_system=False, sort_order=1, created_at=_NOW,
        ),
        CategoryInfo(
            category_id=10, account_id=sample_account_id,
            title="Еда", category_type="EXPENSE",
            is_archived=False, is_system=False, sort_order=0, created_at=_NOW,
        ),
        CategoryInfo(
            category_id=11, account_id=sample_account_id,
            title="Транспорт", category_type="EXPENSE",
            is_archived=False, is_system=False, sort_order=1, created_at=_NOW,
        ),
        CategoryInfo(
            category_id=12, account_id=sample_account_id,
            title="Развлечения", category_type="EXPENSE",
            is_archived=False, is_system=False, sort_order=2, created_at=_NOW,
        ),
        CategoryInfo(
            category_id=13, account_id=sample_account_id,
            title="Одежда", category_type="EXPENSE",
            is_archived=False, is_system=False, sort_order=3, created_at=_NOW,
        ),
        CategoryInfo(
            category_id=14, account_id=sample_account_id,
            title="Здоровье", category_type="EXPENSE",
            is_archived=False, is_system=False, sort_order=4, created_at=_NOW,
        ),
    ]
    db_session.add_all(items)
    db_session.flush()
    return items


@pytest.fixture
def wallets(db_session, sample_account_id):
    """Create REGULAR + SAVINGS wallets."""
    w = [
        WalletBalance(
            wallet_id=100, account_id=sample_account_id,
            title="Основной", currency="RUB", wallet_type="REGULAR",
            balance=_D("0"), is_archived=False, created_at=_NOW, updated_at=_NOW,
        ),
        WalletBalance(
            wallet_id=200, account_id=sample_account_id,
            title="Накопления", currency="RUB", wallet_type="SAVINGS",
            balance=_D("0"), is_archived=False, created_at=_NOW, updated_at=_NOW,
        ),
    ]
    db_session.add_all(w)
    db_session.flush()
    return w


@pytest.fixture
def goal(db_session, sample_account_id):
    g = GoalInfo(
        goal_id=1, account_id=sample_account_id,
        title="Отпуск", currency="RUB", target_amount=_D("100000"),
        is_system=False, is_archived=False, created_at=_NOW, updated_at=_NOW,
    )
    db_session.add(g)
    db_session.flush()
    return g


def _add_budget_month(db, account_id, year, month, variant_id=None):
    bm = BudgetMonth(
        account_id=account_id, year=year, month=month,
        budget_variant_id=variant_id, created_at=_NOW,
    )
    db.add(bm)
    db.flush()
    return bm


def _add_plan(db, bm_id, category_id, kind, amount, account_id=1):
    line = BudgetLine(
        budget_month_id=bm_id, category_id=category_id, account_id=account_id,
        kind=kind, plan_amount=_D(str(amount)),
    )
    db.add(line)
    db.flush()
    return line


def _add_expense(db, account_id, category_id, amount, dt):
    tx_id = db.query(TransactionFeed).count() + 1
    t = TransactionFeed(
        transaction_id=tx_id, account_id=account_id,
        operation_type="EXPENSE", amount=_D(str(amount)), currency="RUB",
        wallet_id=100, category_id=category_id,
        description="", occurred_at=dt,
    )
    db.add(t)
    db.flush()
    return t


def _add_income(db, account_id, category_id, amount, dt):
    tx_id = db.query(TransactionFeed).count() + 1
    t = TransactionFeed(
        transaction_id=tx_id, account_id=account_id,
        operation_type="INCOME", amount=_D(str(amount)), currency="RUB",
        wallet_id=100, category_id=category_id,
        description="", occurred_at=dt,
    )
    db.add(t)
    db.flush()
    return t


def _add_goal_deposit(db, account_id, goal_id, amount, dt, from_wid=100, to_wid=200):
    tx_id = db.query(TransactionFeed).count() + 1
    t = TransactionFeed(
        transaction_id=tx_id, account_id=account_id,
        operation_type="TRANSFER", amount=_D(str(amount)), currency="RUB",
        from_wallet_id=from_wid, to_wallet_id=to_wid,
        to_goal_id=goal_id,
        description="", occurred_at=dt,
    )
    db.add(t)
    db.flush()
    return t


def _add_goal_withdrawal(db, account_id, goal_id, amount, dt, from_wid=200, to_wid=100):
    tx_id = db.query(TransactionFeed).count() + 1
    t = TransactionFeed(
        transaction_id=tx_id, account_id=account_id,
        operation_type="TRANSFER", amount=_D(str(amount)), currency="RUB",
        from_wallet_id=from_wid, to_wallet_id=to_wid,
        from_goal_id=goal_id,
        description="", occurred_at=dt,
    )
    db.add(t)
    db.flush()
    return t


# ──────────────────────────────────────────────────────────────
# Tests: Expense aggregation
# ──────────────────────────────────────────────────────────────

class TestBudgetReportExpenses:

    def test_empty_report_zeros(self, db_session, sample_account_id, cats):
        svc = BudgetReportService(db_session)
        r = svc.build(sample_account_id, 2025, 9, 2025, 11)

        assert r["month_count"] == 3
        assert r["summary"]["expense_plan"] == _D("0")
        assert r["summary"]["expense_fact"] == _D("0")
        assert r["quality"]["score"] == 100
        # Categories exist but all have zero values
        for row in r["category_rows"]:
            assert row["plan"] == _D("0")
            assert row["fact"] == _D("0")

    def test_plan_and_fact_aggregation_3months(self, db_session, sample_account_id, cats):
        """Plans and facts summed correctly across 3 months."""
        for m in [9, 10, 11]:
            bm = _add_budget_month(db_session, sample_account_id, 2025, m)
            _add_plan(db_session, bm.id, 10, "EXPENSE", 10000)  # Еда
            _add_plan(db_session, bm.id, 11, "EXPENSE", 5000)   # Транспорт

        _add_expense(db_session, sample_account_id, 10, 9000, datetime(2025, 9, 5))
        _add_expense(db_session, sample_account_id, 10, 11000, datetime(2025, 10, 5))
        _add_expense(db_session, sample_account_id, 10, 10000, datetime(2025, 11, 5))
        _add_expense(db_session, sample_account_id, 11, 4000, datetime(2025, 9, 10))
        _add_expense(db_session, sample_account_id, 11, 6000, datetime(2025, 10, 10))
        _add_expense(db_session, sample_account_id, 11, 5000, datetime(2025, 11, 10))
        db_session.flush()

        svc = BudgetReportService(db_session)
        r = svc.build(sample_account_id, 2025, 9, 2025, 11)

        assert r["summary"]["expense_plan"] == _D("45000")  # 3*(10000+5000)
        assert r["summary"]["expense_fact"] == _D("45000")   # 9+11+10+4+6+5=45
        assert r["summary"]["expense_delta"] == _D("0")

    def test_per_category_aggregation(self, db_session, sample_account_id, cats):
        """Each category row has correct plan/fact/delta."""
        bm = _add_budget_month(db_session, sample_account_id, 2025, 10)
        _add_plan(db_session, bm.id, 10, "EXPENSE", 10000)
        _add_plan(db_session, bm.id, 11, "EXPENSE", 5000)

        _add_expense(db_session, sample_account_id, 10, 12000, datetime(2025, 10, 5))
        _add_expense(db_session, sample_account_id, 11, 3000, datetime(2025, 10, 10))
        db_session.flush()

        svc = BudgetReportService(db_session)
        r = svc.build(sample_account_id, 2025, 10, 2025, 10)

        by_cat = {row["category_id"]: row for row in r["category_rows"]}
        assert by_cat[10]["plan"] == _D("10000")
        assert by_cat[10]["fact"] == _D("12000")
        assert by_cat[10]["delta"] == _D("2000")
        assert by_cat[10]["is_over"] is True

        assert by_cat[11]["plan"] == _D("5000")
        assert by_cat[11]["fact"] == _D("3000")
        assert by_cat[11]["delta"] == _D("-2000")
        assert by_cat[11]["is_over"] is False

    def test_per_month_aggregation(self, db_session, sample_account_id, cats):
        """Category rows have per-month data."""
        for m in [9, 10]:
            bm = _add_budget_month(db_session, sample_account_id, 2025, m)
            _add_plan(db_session, bm.id, 10, "EXPENSE", 10000)

        _add_expense(db_session, sample_account_id, 10, 8000, datetime(2025, 9, 5))
        _add_expense(db_session, sample_account_id, 10, 12000, datetime(2025, 10, 5))
        db_session.flush()

        svc = BudgetReportService(db_session)
        r = svc.build(sample_account_id, 2025, 9, 2025, 10)

        food_row = [row for row in r["category_rows"] if row["category_id"] == 10][0]
        assert len(food_row["months"]) == 2
        assert food_row["months"][0]["fact"] == _D("8000")
        assert food_row["months"][1]["fact"] == _D("12000")

    def test_income_totals(self, db_session, sample_account_id, cats):
        """Income plan/fact included in summary."""
        bm = _add_budget_month(db_session, sample_account_id, 2025, 10)
        _add_plan(db_session, bm.id, 1, "INCOME", 100000)

        _add_income(db_session, sample_account_id, 1, 95000, datetime(2025, 10, 1))
        db_session.flush()

        svc = BudgetReportService(db_session)
        r = svc.build(sample_account_id, 2025, 10, 2025, 10)

        assert r["summary"]["income_plan"] == _D("100000")
        assert r["summary"]["income_fact"] == _D("95000")

    def test_net_result(self, db_session, sample_account_id, cats):
        """Net result = income_fact - expense_fact."""
        bm = _add_budget_month(db_session, sample_account_id, 2025, 10)
        _add_plan(db_session, bm.id, 1, "INCOME", 100000)
        _add_plan(db_session, bm.id, 10, "EXPENSE", 50000)

        _add_income(db_session, sample_account_id, 1, 100000, datetime(2025, 10, 1))
        _add_expense(db_session, sample_account_id, 10, 40000, datetime(2025, 10, 5))
        db_session.flush()

        svc = BudgetReportService(db_session)
        r = svc.build(sample_account_id, 2025, 10, 2025, 10)

        assert r["summary"]["net_result"] == _D("60000")


# ──────────────────────────────────────────────────────────────
# Tests: Quality Score
# ──────────────────────────────────────────────────────────────

class TestQualityScore:

    def test_perfect_score_under_budget(self, db_session, sample_account_id, cats):
        """All categories under budget across equal months → score near 100."""
        for m in [9, 10, 11]:
            bm = _add_budget_month(db_session, sample_account_id, 2025, m)
            _add_plan(db_session, bm.id, 10, "EXPENSE", 10000)
            _add_plan(db_session, bm.id, 11, "EXPENSE", 5000)

        # Spend exactly under plan, equally each month
        for m in [9, 10, 11]:
            _add_expense(db_session, sample_account_id, 10, 9000, datetime(2025, m, 5))
            _add_expense(db_session, sample_account_id, 11, 4000, datetime(2025, m, 10))
        db_session.flush()

        svc = BudgetReportService(db_session)
        r = svc.build(sample_account_id, 2025, 9, 2025, 11)

        q = r["quality"]
        assert q["penalty_over"] == 0.0
        assert q["score"] >= 70

    def test_low_score_massive_overbudget(self, db_session, sample_account_id, cats):
        """Massive overbudget → penalty_over=50, penalty_plan=25 → score=25 (1 month, no stability penalty)."""
        bm = _add_budget_month(db_session, sample_account_id, 2025, 10)
        _add_plan(db_session, bm.id, 10, "EXPENSE", 1000)

        _add_expense(db_session, sample_account_id, 10, 100000, datetime(2025, 10, 5))
        db_session.flush()

        svc = BudgetReportService(db_session)
        r = svc.build(sample_account_id, 2025, 10, 2025, 10)

        assert r["quality"]["penalty_over"] == 50.0
        assert r["quality"]["penalty_plan"] == 25.0
        assert r["quality"]["score"] == 25

    def test_penalty_over_calculation(self, db_session, sample_account_id, cats):
        """Penalty_over = overbudget_share * 100, capped at 50."""
        bm = _add_budget_month(db_session, sample_account_id, 2025, 10)
        _add_plan(db_session, bm.id, 10, "EXPENSE", 10000)
        _add_plan(db_session, bm.id, 11, "EXPENSE", 10000)

        # Еда: 15000 (over by 5000), Транспорт: 10000 (exact)
        _add_expense(db_session, sample_account_id, 10, 15000, datetime(2025, 10, 5))
        _add_expense(db_session, sample_account_id, 11, 10000, datetime(2025, 10, 10))
        db_session.flush()

        svc = BudgetReportService(db_session)
        r = svc.build(sample_account_id, 2025, 10, 2025, 10)

        # over_budget = 5000, total_fact = 25000, share = 0.2 → penalty = 20
        assert r["quality"]["penalty_over"] == 20.0

    def test_penalty_stability_cv(self, db_session, sample_account_id, cats):
        """High month-to-month variance penalizes stability."""
        for m in [9, 10, 11]:
            bm = _add_budget_month(db_session, sample_account_id, 2025, m)
            _add_plan(db_session, bm.id, 10, "EXPENSE", 10000)

        # Very unequal: 1000, 10000, 19000
        _add_expense(db_session, sample_account_id, 10, 1000, datetime(2025, 9, 5))
        _add_expense(db_session, sample_account_id, 10, 10000, datetime(2025, 10, 5))
        _add_expense(db_session, sample_account_id, 10, 19000, datetime(2025, 11, 5))
        db_session.flush()

        svc = BudgetReportService(db_session)
        r = svc.build(sample_account_id, 2025, 9, 2025, 11)

        assert r["quality"]["penalty_stability"] > 0

    def test_no_plan_no_crash(self, db_session, sample_account_id, cats):
        """No plan data → should still return valid report."""
        _add_expense(db_session, sample_account_id, 10, 5000, datetime(2025, 10, 5))
        db_session.flush()

        svc = BudgetReportService(db_session)
        r = svc.build(sample_account_id, 2025, 10, 2025, 10)

        assert r["quality"]["score"] >= 0
        assert r["summary"]["expense_fact"] == _D("5000")
        assert r["summary"]["expense_plan"] == _D("0")


# ──────────────────────────────────────────────────────────────
# Tests: Top-5
# ──────────────────────────────────────────────────────────────

class TestTop5:

    def test_correct_ranking(self, db_session, sample_account_id, cats):
        """Top-5 overbudget sorted by delta desc, savings by delta asc."""
        bm = _add_budget_month(db_session, sample_account_id, 2025, 10)
        # cat 10: plan 10000, fact 15000 → delta +5000
        # cat 11: plan 10000, fact 12000 → delta +2000
        # cat 12: plan 10000, fact 8000  → delta -2000
        # cat 13: plan 10000, fact 3000  → delta -7000
        # cat 14: plan 10000, fact 10000 → delta 0
        for cid in [10, 11, 12, 13, 14]:
            _add_plan(db_session, bm.id, cid, "EXPENSE", 10000)

        _add_expense(db_session, sample_account_id, 10, 15000, datetime(2025, 10, 1))
        _add_expense(db_session, sample_account_id, 11, 12000, datetime(2025, 10, 2))
        _add_expense(db_session, sample_account_id, 12, 8000, datetime(2025, 10, 3))
        _add_expense(db_session, sample_account_id, 13, 3000, datetime(2025, 10, 4))
        _add_expense(db_session, sample_account_id, 14, 10000, datetime(2025, 10, 5))
        db_session.flush()

        svc = BudgetReportService(db_session)
        r = svc.build(sample_account_id, 2025, 10, 2025, 10)

        over = r["top5_over"]
        assert len(over) == 2
        assert over[0]["title"] == "Еда"
        assert over[0]["delta"] == _D("5000")
        assert over[1]["title"] == "Транспорт"

        savings = r["top5_savings"]
        assert len(savings) == 2
        assert savings[0]["title"] == "Одежда"  # delta -7000
        assert savings[1]["title"] == "Развлечения"  # delta -2000


# ──────────────────────────────────────────────────────────────
# Tests: Savings block
# ──────────────────────────────────────────────────────────────

class TestSavingsBlock:

    def test_deposits_withdrawals_net(self, db_session, sample_account_id, cats, wallets, goal):
        """Deposits and withdrawals aggregate correctly."""
        bm = _add_budget_month(db_session, sample_account_id, 2025, 10)
        # Goal deposit plan
        gdp = BudgetGoalPlan(
            budget_month_id=bm.id, account_id=sample_account_id,
            goal_id=1, plan_amount=_D("20000"),
        )
        db_session.add(gdp)
        db_session.flush()

        # Actual deposits/withdrawals
        _add_goal_deposit(db_session, sample_account_id, 1, 15000, datetime(2025, 10, 5))
        _add_goal_withdrawal(db_session, sample_account_id, 1, 5000, datetime(2025, 10, 20))
        db_session.flush()

        svc = BudgetReportService(db_session)
        r = svc.build(sample_account_id, 2025, 10, 2025, 10)

        sv = r["savings"]
        assert sv["total_deposited"] == _D("15000")
        assert sv["total_withdrawn"] == _D("5000")
        assert sv["net"] == _D("10000")
        assert sv["deposit_plan"] == _D("20000")

        assert len(sv["monthly"]) == 1
        assert sv["monthly"][0]["deposited"] == _D("15000")
        assert sv["monthly"][0]["withdrawn"] == _D("5000")


# ──────────────────────────────────────────────────────────────
# Tests: Monthly dynamics
# ──────────────────────────────────────────────────────────────

class TestMonthlyDynamics:

    def test_monthly_rows(self, db_session, sample_account_id, cats):
        """Monthly dynamics table has correct per-month values."""
        for m in [9, 10]:
            bm = _add_budget_month(db_session, sample_account_id, 2025, m)
            _add_plan(db_session, bm.id, 10, "EXPENSE", 10000)
            _add_plan(db_session, bm.id, 1, "INCOME", 50000)

        _add_expense(db_session, sample_account_id, 10, 9000, datetime(2025, 9, 5))
        _add_expense(db_session, sample_account_id, 10, 11000, datetime(2025, 10, 5))
        _add_income(db_session, sample_account_id, 1, 50000, datetime(2025, 9, 1))
        _add_income(db_session, sample_account_id, 1, 55000, datetime(2025, 10, 1))
        db_session.flush()

        svc = BudgetReportService(db_session)
        r = svc.build(sample_account_id, 2025, 9, 2025, 10)

        dyn = r["monthly_dynamics"]
        assert len(dyn) == 2

        # Sep
        assert dyn[0]["expense_plan"] == _D("10000")
        assert dyn[0]["expense_fact"] == _D("9000")
        assert dyn[0]["income_fact"] == _D("50000")
        assert dyn[0]["net_result"] == _D("41000")  # 50000 - 9000

        # Oct
        assert dyn[1]["expense_fact"] == _D("11000")
        assert dyn[1]["income_fact"] == _D("55000")
        assert dyn[1]["net_result"] == _D("44000")  # 55000 - 11000


# ──────────────────────────────────────────────────────────────
# Tests: Share percentage
# ──────────────────────────────────────────────────────────────

class TestSharePercent:

    def test_share_pct_sums_to_100(self, db_session, sample_account_id, cats):
        """Share percentages across all categories sum to ~100%."""
        bm = _add_budget_month(db_session, sample_account_id, 2025, 10)
        _add_plan(db_session, bm.id, 10, "EXPENSE", 10000)
        _add_plan(db_session, bm.id, 11, "EXPENSE", 5000)

        _add_expense(db_session, sample_account_id, 10, 8000, datetime(2025, 10, 5))
        _add_expense(db_session, sample_account_id, 11, 2000, datetime(2025, 10, 10))
        db_session.flush()

        svc = BudgetReportService(db_session)
        r = svc.build(sample_account_id, 2025, 10, 2025, 10)

        total_share = sum(row["share_pct"] for row in r["category_rows"])
        assert abs(total_share - 100.0) < 0.1

        # Еда: 8000/10000 = 80%
        food = [row for row in r["category_rows"] if row["category_id"] == 10][0]
        assert abs(food["share_pct"] - 80.0) < 0.1
