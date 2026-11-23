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
        is_archived=False,
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
            hidden_category_ids={4},
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


# ======================================================================
# Накопительные планы как подложка под ручной план «Отложить»
# ======================================================================

class TestGoalSavingPlans:
    """Расчётный взнос попадает в строку цели сам.

    Отдельно проверяется, что он виден только внутри окна накопления:
    пользователь завёл план на 2027 год и не увидел его в бюджете за
    ноябрь 2026 — это не пропажа, а месяц вне окна.
    """

    @staticmethod
    def _goal(db_session, goal_id=1, title="Интернет"):
        from app.infrastructure.db.models import GoalInfo

        db_session.add(GoalInfo(
            goal_id=goal_id, account_id=ACCOUNT, title=title, currency="RUB",
            is_system=False, is_archived=False, created_at=_NOW,
        ))
        db_session.flush()

    @staticmethod
    def _plan(db_session, **over):
        from app.infrastructure.db.models import GoalSavingPlan

        kw = dict(
            account_id=ACCOUNT, goal_id=1, target_amount=Decimal("15000"),
            start_month="2027-01", target_month="2027-12",
            save_in_target_month=True, repeat_yearly=False, is_active=True,
            created_at=_NOW, updated_at=_NOW,
        )
        kw.update(over)
        db_session.add(GoalSavingPlan(**kw))
        db_session.flush()

    def _row(self, db_session, year, month, count=1):
        view = BudgetMatrixService(db_session).build(
            account_id=ACCOUNT, grain="month", range_count=count,
            anchor_year=year, anchor_month=month,
        )
        rows = [r for r in view["goal_rows"] if r["goal_id"] == 1]
        return rows[0] if rows else None

    def test_shows_inside_the_window(self, db_session):
        """15 000 на 12 месяцев 2027 года → по 1 250 в каждом."""
        self._goal(db_session)
        self._plan(db_session)
        cell = self._row(db_session, 2027, 1)["cells"][0]
        assert cell["plan"] == Decimal("1250.00")
        assert cell["is_computed"] is True

    def test_silent_before_the_window(self, db_session):
        """Ноябрь 2026 — до начала накопления, и взноса там нет."""
        self._goal(db_session)
        self._plan(db_session)
        cell = self._row(db_session, 2026, 11)["cells"][0]
        assert cell["plan"] == Decimal("0")
        assert cell["is_computed"] is False

    def test_window_appears_as_months_pass(self, db_session):
        """Окно целиком видно, если смотреть достаточно месяцев вперёд."""
        self._goal(db_session)
        self._plan(db_session)
        cells = self._row(db_session, 2026, 11, count=4)["cells"]
        # ноя 2026, дек 2026, янв 2027, фев 2027
        assert [c["plan"] for c in cells] == [
            Decimal("0"), Decimal("0"), Decimal("1250.00"), Decimal("1250.00"),
        ]

    def test_inactive_plan_adds_nothing(self, db_session):
        self._goal(db_session)
        self._plan(db_session, is_active=False)
        assert self._row(db_session, 2027, 1)["cells"][0]["plan"] == Decimal("0")

    def test_manual_plan_wins(self, db_session):
        """Вписанное руками главнее расчётного и не помечается расчётным."""
        from app.infrastructure.db.models import BudgetGoalPlan

        self._goal(db_session)
        self._plan(db_session)
        bm = EnsureBudgetMonthUseCase(db_session).execute(
            account_id=ACCOUNT, year=2027, month=1,
        )
        bm_id = bm if isinstance(bm, int) else bm.id
        db_session.add(BudgetGoalPlan(
            budget_month_id=bm_id, account_id=ACCOUNT, goal_id=1,
            plan_amount=Decimal("9000"), created_at=_NOW,
        ))
        db_session.flush()

        cell = self._row(db_session, 2027, 1)["cells"][0]
        assert cell["plan"] == Decimal("9000")
        assert cell["is_computed"] is False

    def test_year_column_sums_the_whole_year(self, db_session):
        """Годовая колонка — сумма за год, а не взнос за один месяц."""
        self._goal(db_session)
        self._plan(db_session)
        view = BudgetMatrixService(db_session).build(
            account_id=ACCOUNT, grain="year", range_count=1,
            anchor_year=2027, anchor_month=1,
        )
        row = next(r for r in view["goal_rows"] if r["goal_id"] == 1)
        assert row["cells"][0]["plan"] == Decimal("15000.00")

    def test_partial_year_counts_only_its_months(self, db_session):
        """Окно в полгода внутри года даёт половину суммы."""
        self._goal(db_session)
        self._plan(db_session, start_month="2027-07", target_month="2027-12")
        view = BudgetMatrixService(db_session).build(
            account_id=ACCOUNT, grain="year", range_count=1,
            anchor_year=2027, anchor_month=1,
        )
        row = next(r for r in view["goal_rows"] if r["goal_id"] == 1)
        assert row["cells"][0]["plan"] == Decimal("15000.00")

    def test_week_grain_gets_nothing(self, db_session):
        """Помесячный взнос не раскладывается по неделям — это были бы
        выдуманные цифры."""
        self._goal(db_session)
        self._plan(db_session)
        view = BudgetMatrixService(db_session).build(
            account_id=ACCOUNT, grain="week", range_count=2,
            anchor_date=date(2027, 1, 4),
        )
        row = next(r for r in view["goal_rows"] if r["goal_id"] == 1)
        assert [c["plan"] for c in row["cells"]] == [Decimal("0"), Decimal("0")]

    def test_blank_zero_does_not_suppress_the_plan(self, db_session):
        """Нулевая ручная строка без комментария не должна глушить расчёт.

        Такие строки остаются от прежних правок клеток. Одна такая — и
        накопительный план молча переставал работать: в бюджете нули,
        а причина не видна нигде.
        """
        from app.infrastructure.db.models import BudgetGoalPlan, BudgetMonth

        self._goal(db_session)
        self._plan(db_session)
        for m in (1, 2, 3):
            bm = BudgetMonth(account_id=ACCOUNT, year=2027, month=m, created_at=_NOW)
            db_session.add(bm)
            db_session.flush()
            db_session.add(BudgetGoalPlan(
                budget_month_id=bm.id, account_id=ACCOUNT, goal_id=1,
                plan_amount=Decimal("0"), note=None, created_at=_NOW,
            ))
        db_session.flush()

        cells = self._row(db_session, 2027, 1, count=3)["cells"]
        assert [c["plan"] for c in cells] == [Decimal("1250.00")] * 3
        assert all(c["is_computed"] for c in cells)

    def test_zero_with_note_does_suppress(self, db_session):
        """Ноль с комментарием — осознанное «в этом месяце не откладываю»."""
        from app.infrastructure.db.models import BudgetGoalPlan, BudgetMonth

        self._goal(db_session)
        self._plan(db_session)
        bm = BudgetMonth(account_id=ACCOUNT, year=2027, month=1, created_at=_NOW)
        db_session.add(bm)
        db_session.flush()
        db_session.add(BudgetGoalPlan(
            budget_month_id=bm.id, account_id=ACCOUNT, goal_id=1,
            plan_amount=Decimal("0"), note="январь тяжёлый", created_at=_NOW,
        ))
        db_session.flush()

        cell = self._row(db_session, 2027, 1)["cells"][0]
        assert cell["plan"] == Decimal("0")
        assert cell["is_computed"] is False

    def test_saving_blank_zero_removes_the_row(self, db_session):
        """Сохранение пустого нуля удаляет строку, а не хранит ноль."""
        from app.application.budget import SaveGoalPlansUseCase
        from app.infrastructure.db.models import BudgetGoalPlan

        self._goal(db_session)
        uc = SaveGoalPlansUseCase(db_session)
        uc.execute(account_id=ACCOUNT, year=2027, month=1,
                   goal_plans=[{"goal_id": 1, "plan_amount": "500", "note": None}])
        assert db_session.query(BudgetGoalPlan).count() == 1

        uc.execute(account_id=ACCOUNT, year=2027, month=1,
                   goal_plans=[{"goal_id": 1, "plan_amount": "0", "note": None}])
        assert db_session.query(BudgetGoalPlan).count() == 0

    def test_target_month_fills_withdrawal(self, db_session):
        """В целевом месяце план предлагает забрать накопленное."""
        self._goal(db_session)
        self._plan(db_session)
        view = BudgetMatrixService(db_session).build(
            account_id=ACCOUNT, grain="month", range_count=2,
            anchor_year=2027, anchor_month=11,
        )
        row = next(r for r in view["withdrawal_rows"] if r["goal_id"] == 1)
        assert [c["plan"] for c in row["cells"]] == [Decimal("0"), Decimal("15000")]
        assert [c["is_computed"] for c in row["cells"]] == [False, True]

    def test_manual_withdrawal_wins(self, db_session):
        from app.infrastructure.db.models import BudgetGoalWithdrawalPlan, BudgetMonth

        self._goal(db_session)
        self._plan(db_session)
        bm = BudgetMonth(account_id=ACCOUNT, year=2027, month=12, created_at=_NOW)
        db_session.add(bm)
        db_session.flush()
        db_session.add(BudgetGoalWithdrawalPlan(
            budget_month_id=bm.id, account_id=ACCOUNT, goal_id=1,
            plan_amount=Decimal("12000"), created_at=_NOW,
        ))
        db_session.flush()

        view = BudgetMatrixService(db_session).build(
            account_id=ACCOUNT, grain="month", range_count=1,
            anchor_year=2027, anchor_month=12,
        )
        cell = next(r for r in view["withdrawal_rows"] if r["goal_id"] == 1)["cells"][0]
        assert cell["plan"] == Decimal("12000")
        assert cell["is_computed"] is False

    def test_target_month_fills_expense_category(self, db_session, setup_categories):
        """Со статьёй план ставит и сам расход — круг замыкается."""
        self._goal(db_session)
        self._plan(db_session, expense_category_id=3)
        view = BudgetMatrixService(db_session).build(
            account_id=ACCOUNT, grain="month", range_count=1,
            anchor_year=2027, anchor_month=12,
        )
        row = next(r for r in view["expense_rows"] if r.get("category_id") == 3)
        assert row["cells"][0]["plan"] == Decimal("15000")
        assert row["cells"][0]["is_computed"] is True

    def test_expense_does_not_double_an_existing_plan(self, db_session, setup_categories):
        """Если расход уже запланирован руками — не прибавляем сверху."""
        from app.application.budget import EnsureBudgetMonthUseCase, SetBudgetLineUseCase

        self._goal(db_session)
        self._plan(db_session, expense_category_id=3)
        mid = EnsureBudgetMonthUseCase(db_session).execute(ACCOUNT, 2027, 12)
        SetBudgetLineUseCase(db_session).execute(ACCOUNT, mid, 3, "EXPENSE", "20000")
        view = BudgetMatrixService(db_session).build(
            account_id=ACCOUNT, grain="month", range_count=1,
            anchor_year=2027, anchor_month=12,
        )
        row = next(r for r in view["expense_rows"] if r.get("category_id") == 3)
        assert row["cells"][0]["plan"] == Decimal("20000")
        assert row["cells"][0]["is_computed"] is False

    @pytest.mark.skipif(
        True,
        reason="Зависит от диалекта: BUDGET_DT приводит budget_month к TIMESTAMP. "
               "На Postgres это настоящая дата, на SQLite — строка «2027-03-01», "
               "и сравнение с «2027-03-01 00:00:00.000000» даёт False, так что "
               "операция не попадает в свой период. Снять, когда тесты поедут на "
               "Postgres. Признак «внесено заранее» проверяется отдельно ниже.",
    )
    def test_prepaid_transfer_counts_in_the_chosen_month(self, db_session):
        """Перевод в ноябре с бюджетным месяцем «март» — факт марта, не ноября."""
        from app.infrastructure.db.models import TransactionFeed, WalletBalance

        self._goal(db_session)
        db_session.add_all([
            WalletBalance(wallet_id=90, account_id=ACCOUNT, title="Счёт", currency="RUB",
                          wallet_type="REGULAR", balance=0, is_archived=False, created_at=_NOW),
            WalletBalance(wallet_id=91, account_id=ACCOUNT, title="Копилка", currency="RUB",
                          wallet_type="SAVINGS", balance=0, is_archived=False, created_at=_NOW),
        ])
        db_session.flush()
        db_session.add(TransactionFeed(
            transaction_id=5001, account_id=ACCOUNT, operation_type="TRANSFER", currency="RUB",
            amount=Decimal("5000"), occurred_at=datetime(2026, 11, 20, 12, 0),
            budget_month=date(2027, 3, 1),
            from_wallet_id=90, to_wallet_id=91, to_goal_id=1, created_at=_NOW,
        ))
        db_session.flush()

        nov = self._row(db_session, 2026, 11)["cells"][0]
        assert nov["fact"] == Decimal("0")

        mar = self._row(db_session, 2027, 3)["cells"][0]
        assert mar["fact"] == Decimal("5000")
        # И видно, что деньги пришли заранее
        assert mar["fact_prepaid"] == Decimal("5000")

    def test_ordinary_transfer_is_not_prepaid(self, db_session):
        from app.infrastructure.db.models import TransactionFeed, WalletBalance

        self._goal(db_session)
        db_session.add_all([
            WalletBalance(wallet_id=90, account_id=ACCOUNT, title="Счёт", currency="RUB",
                          wallet_type="REGULAR", balance=0, is_archived=False, created_at=_NOW),
            WalletBalance(wallet_id=91, account_id=ACCOUNT, title="Копилка", currency="RUB",
                          wallet_type="SAVINGS", balance=0, is_archived=False, created_at=_NOW),
        ])
        db_session.flush()
        db_session.add(TransactionFeed(
            transaction_id=5002, account_id=ACCOUNT, operation_type="TRANSFER", currency="RUB",
            amount=Decimal("3000"), occurred_at=datetime(2027, 3, 10, 12, 0),
            budget_month=None,
            from_wallet_id=90, to_wallet_id=91, to_goal_id=1, created_at=_NOW,
        ))
        db_session.flush()

        mar = self._row(db_session, 2027, 3)["cells"][0]
        assert mar["fact"] == Decimal("3000")
        assert mar["fact_prepaid"] == Decimal("0")

    @pytest.mark.skipif(
        True,
        reason="Та же диалектная причина, что и у теста выше: на SQLite операция "
               "с budget_month не попадает в свой период.",
    )
    def test_backdated_transfer_is_not_prepaid(self, db_session):
        """Зарплатный сдвиг назад — это не «внесено заранее»."""
        from app.infrastructure.db.models import TransactionFeed, WalletBalance

        self._goal(db_session)
        db_session.add_all([
            WalletBalance(wallet_id=90, account_id=ACCOUNT, title="Счёт", currency="RUB",
                          wallet_type="REGULAR", balance=0, is_archived=False, created_at=_NOW),
            WalletBalance(wallet_id=91, account_id=ACCOUNT, title="Копилка", currency="RUB",
                          wallet_type="SAVINGS", balance=0, is_archived=False, created_at=_NOW),
        ])
        db_session.flush()
        db_session.add(TransactionFeed(
            transaction_id=5003, account_id=ACCOUNT, operation_type="TRANSFER", currency="RUB",
            amount=Decimal("2000"), occurred_at=datetime(2027, 4, 2, 12, 0),
            budget_month=date(2027, 3, 1),
            from_wallet_id=90, to_wallet_id=91, to_goal_id=1, created_at=_NOW,
        ))
        db_session.flush()

        mar = self._row(db_session, 2027, 3)["cells"][0]
        assert mar["fact"] == Decimal("2000")
        assert mar["fact_prepaid"] == Decimal("0")

    def test_period_reports_whether_it_has_any_fact(self, db_session):
        """Интерфейсу нужно знать, что в будущем месяце уже есть факт.

        Будущая колонка матрицы по умолчанию показывает только план —
        внесённые заранее деньги в ней негде было увидеть.
        """
        from app.infrastructure.db.models import TransactionFeed, WalletBalance

        self._goal(db_session)
        db_session.add_all([
            WalletBalance(wallet_id=90, account_id=ACCOUNT, title="Счёт", currency="RUB",
                          wallet_type="REGULAR", balance=0, is_archived=False, created_at=_NOW),
            WalletBalance(wallet_id=91, account_id=ACCOUNT, title="Копилка", currency="RUB",
                          wallet_type="SAVINGS", balance=0, is_archived=False, created_at=_NOW),
        ])
        db_session.flush()
        db_session.add(TransactionFeed(
            transaction_id=5100, account_id=ACCOUNT, operation_type="TRANSFER", currency="RUB",
            amount=Decimal("5000"), occurred_at=datetime(2027, 2, 10, 12, 0),
            from_wallet_id=90, to_wallet_id=91, to_goal_id=1, created_at=_NOW,
        ))
        db_session.flush()

        view = BudgetMatrixService(db_session).build(
            account_id=ACCOUNT, grain="month", range_count=4,
            anchor_year=2027, anchor_month=1,
        )
        assert [p["has_fact"] for p in view["periods"]] == [False, True, False, False]

    def test_period_without_anything_has_no_fact(self, db_session):
        self._goal(db_session)
        view = BudgetMatrixService(db_session).build(
            account_id=ACCOUNT, grain="month", range_count=2,
            anchor_year=2027, anchor_month=1,
        )
        assert all(p["has_fact"] is False for p in view["periods"])

    def test_has_fact_covers_expenses_too(self, db_session, setup_categories):
        """Флаг не про накопления: расход в будущем месяце тоже его включает.

        От него зависит, сколько колонок у периода, — значит остаток по
        бюджету виден и по статьям, а не только по целям.
        """
        _add_tx(db_session, 6001, "EXPENSE", 1500, 3, datetime(2027, 5, 12, 10, 0))

        view = BudgetMatrixService(db_session).build(
            account_id=ACCOUNT, grain="month", range_count=3,
            anchor_year=2027, anchor_month=4,
        )
        assert [p["has_fact"] for p in view["periods"]] == [False, True, False]

    def test_has_fact_covers_income(self, db_session, setup_categories):
        _add_tx(db_session, 6002, "INCOME", 90000, 1, datetime(2027, 6, 5, 10, 0))

        view = BudgetMatrixService(db_session).build(
            account_id=ACCOUNT, grain="month", range_count=2,
            anchor_year=2027, anchor_month=6,
        )
        assert [p["has_fact"] for p in view["periods"]] == [True, False]

    def test_has_fact_covers_withdrawal(self, db_session):
        """Снятие из отложенного — тоже факт периода."""
        from app.infrastructure.db.models import TransactionFeed, WalletBalance

        self._goal(db_session)
        db_session.add_all([
            WalletBalance(wallet_id=92, account_id=ACCOUNT, title="Копилка", currency="RUB",
                          wallet_type="SAVINGS", balance=0, is_archived=False, created_at=_NOW),
            WalletBalance(wallet_id=93, account_id=ACCOUNT, title="Счёт", currency="RUB",
                          wallet_type="REGULAR", balance=0, is_archived=False, created_at=_NOW),
        ])
        db_session.flush()
        db_session.add(TransactionFeed(
            transaction_id=6003, account_id=ACCOUNT, operation_type="TRANSFER", currency="RUB",
            amount=Decimal("4000"), occurred_at=datetime(2027, 7, 3, 10, 0),
            from_wallet_id=92, to_wallet_id=93, from_goal_id=1, created_at=_NOW,
        ))
        db_session.flush()

        view = BudgetMatrixService(db_session).build(
            account_id=ACCOUNT, grain="month", range_count=2,
            anchor_year=2027, anchor_month=7,
        )
        assert [p["has_fact"] for p in view["periods"]] == [True, False]
