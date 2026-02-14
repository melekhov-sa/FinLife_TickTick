"""
Tests for Budget use cases and build_budget_view.
"""
import pytest
from datetime import datetime
from decimal import Decimal

from app.infrastructure.db.models import (
    BudgetMonth, BudgetLine, CategoryInfo, TransactionFeed,
)
from app.application.budget import (
    EnsureBudgetMonthUseCase, SetBudgetLineUseCase, SaveBudgetPlanUseCase,
    BudgetValidationError, build_budget_view,
)


_NOW = datetime(2026, 2, 14, 12, 0, 0)


@pytest.fixture
def setup_categories(db_session, sample_account_id):
    """Create basic financial categories."""
    cats = [
        CategoryInfo(
            category_id=1, account_id=sample_account_id,
            title="Зарплата", category_type="INCOME",
            is_archived=False, is_system=False, sort_order=0,
            created_at=_NOW,
        ),
        CategoryInfo(
            category_id=2, account_id=sample_account_id,
            title="Фриланс", category_type="INCOME",
            is_archived=False, is_system=False, sort_order=1,
            created_at=_NOW,
        ),
        CategoryInfo(
            category_id=3, account_id=sample_account_id,
            title="Еда", category_type="EXPENSE",
            is_archived=False, is_system=False, sort_order=0,
            created_at=_NOW,
        ),
        CategoryInfo(
            category_id=4, account_id=sample_account_id,
            title="Транспорт", category_type="EXPENSE",
            is_archived=False, is_system=False, sort_order=1,
            created_at=_NOW,
        ),
        CategoryInfo(
            category_id=90, account_id=sample_account_id,
            title="Прочие доходы", category_type="INCOME",
            is_archived=False, is_system=True, sort_order=99,
            created_at=_NOW,
        ),
        CategoryInfo(
            category_id=91, account_id=sample_account_id,
            title="Прочие расходы", category_type="EXPENSE",
            is_archived=False, is_system=True, sort_order=99,
            created_at=_NOW,
        ),
    ]
    db_session.add_all(cats)
    db_session.flush()
    return cats


@pytest.fixture
def archived_category(db_session, sample_account_id):
    """Create an archived category."""
    cat = CategoryInfo(
        category_id=50, account_id=sample_account_id,
        title="Старая категория", category_type="EXPENSE",
        is_archived=True, is_system=False, sort_order=0,
        created_at=_NOW,
    )
    db_session.add(cat)
    db_session.flush()
    return cat


class TestEnsureBudgetMonth:
    def test_creates_new_month(self, db_session, sample_account_id):
        uc = EnsureBudgetMonthUseCase(db_session)
        mid = uc.execute(sample_account_id, 2026, 2)

        assert mid > 0
        bm = db_session.query(BudgetMonth).filter(BudgetMonth.id == mid).first()
        assert bm is not None
        assert bm.year == 2026
        assert bm.month == 2
        assert bm.account_id == sample_account_id

    def test_returns_existing_month(self, db_session, sample_account_id):
        uc = EnsureBudgetMonthUseCase(db_session)
        mid1 = uc.execute(sample_account_id, 2026, 3)
        mid2 = uc.execute(sample_account_id, 2026, 3)

        assert mid1 == mid2

        count = db_session.query(BudgetMonth).filter(
            BudgetMonth.account_id == sample_account_id,
            BudgetMonth.year == 2026,
            BudgetMonth.month == 3,
        ).count()
        assert count == 1


class TestSetBudgetLine:
    def test_set_plan_creates_line(self, db_session, sample_account_id):
        uc_month = EnsureBudgetMonthUseCase(db_session)
        mid = uc_month.execute(sample_account_id, 2026, 2)

        uc = SetBudgetLineUseCase(db_session)
        uc.execute(sample_account_id, mid, category_id=1, kind="INCOME", plan_amount="50000")

        line = db_session.query(BudgetLine).filter(
            BudgetLine.budget_month_id == mid,
            BudgetLine.category_id == 1,
            BudgetLine.kind == "INCOME",
        ).first()
        assert line is not None
        assert line.plan_amount == Decimal("50000")

    def test_set_plan_updates_existing(self, db_session, sample_account_id):
        uc_month = EnsureBudgetMonthUseCase(db_session)
        mid = uc_month.execute(sample_account_id, 2026, 2)

        uc = SetBudgetLineUseCase(db_session)
        uc.execute(sample_account_id, mid, category_id=1, kind="INCOME", plan_amount="50000")
        uc.execute(sample_account_id, mid, category_id=1, kind="INCOME", plan_amount="60000")

        lines = db_session.query(BudgetLine).filter(
            BudgetLine.budget_month_id == mid,
            BudgetLine.category_id == 1,
            BudgetLine.kind == "INCOME",
        ).all()
        assert len(lines) == 1
        assert lines[0].plan_amount == Decimal("60000")

    def test_negative_plan_fails(self, db_session, sample_account_id):
        uc_month = EnsureBudgetMonthUseCase(db_session)
        mid = uc_month.execute(sample_account_id, 2026, 2)

        uc = SetBudgetLineUseCase(db_session)
        with pytest.raises(BudgetValidationError, match="plan_amount must be >= 0"):
            uc.execute(sample_account_id, mid, category_id=1, kind="INCOME", plan_amount="-100")

    def test_invalid_kind_fails(self, db_session, sample_account_id):
        uc_month = EnsureBudgetMonthUseCase(db_session)
        mid = uc_month.execute(sample_account_id, 2026, 2)

        uc = SetBudgetLineUseCase(db_session)
        with pytest.raises(BudgetValidationError, match="kind must be INCOME or EXPENSE"):
            uc.execute(sample_account_id, mid, category_id=1, kind="TRANSFER", plan_amount="100")


class TestBuildBudgetView:
    def test_empty_budget(self, db_session, sample_account_id, setup_categories):
        view = build_budget_view(db_session, sample_account_id, 2026, 2)

        assert view["year"] == 2026
        assert view["month"] == 2
        assert view["month_name"] == "Февраль"
        assert len(view["income_lines"]) > 0  # categories exist
        assert all(l["plan"] == 0 and l["fact"] == 0 for l in view["income_lines"])
        assert all(l["plan"] == 0 and l["fact"] == 0 for l in view["expense_lines"])

    def test_plan_only(self, db_session, sample_account_id, setup_categories):
        uc_month = EnsureBudgetMonthUseCase(db_session)
        mid = uc_month.execute(sample_account_id, 2026, 2)

        uc = SetBudgetLineUseCase(db_session)
        uc.execute(sample_account_id, mid, category_id=1, kind="INCOME", plan_amount="50000")
        uc.execute(sample_account_id, mid, category_id=3, kind="EXPENSE", plan_amount="20000")

        view = build_budget_view(db_session, sample_account_id, 2026, 2)

        salary_line = next(l for l in view["income_lines"] if l["category_id"] == 1)
        assert salary_line["plan"] == Decimal("50000")
        assert salary_line["fact"] == Decimal("0")
        assert salary_line["deviation"] == Decimal("-50000")

        food_line = next(l for l in view["expense_lines"] if l["category_id"] == 3)
        assert food_line["plan"] == Decimal("20000")
        assert food_line["fact"] == Decimal("0")

        assert view["totals"]["plan_income"] == Decimal("50000")
        assert view["totals"]["plan_expense"] == Decimal("20000")
        assert view["totals"]["plan_result"] == Decimal("30000")

    def test_fact_only(self, db_session, sample_account_id, setup_categories):
        # Add transactions
        db_session.add(TransactionFeed(
            transaction_id=1, account_id=sample_account_id,
            operation_type="INCOME", amount=Decimal("45000"), currency="RUB",
            wallet_id=1, category_id=1, description="Зарплата",
            occurred_at=datetime(2026, 2, 10),
        ))
        db_session.add(TransactionFeed(
            transaction_id=2, account_id=sample_account_id,
            operation_type="EXPENSE", amount=Decimal("5000"), currency="RUB",
            wallet_id=1, category_id=3, description="Продукты",
            occurred_at=datetime(2026, 2, 12),
        ))
        db_session.flush()

        view = build_budget_view(db_session, sample_account_id, 2026, 2)

        salary_line = next(l for l in view["income_lines"] if l["category_id"] == 1)
        assert salary_line["fact"] == Decimal("45000")
        assert salary_line["plan"] == Decimal("0")

        food_line = next(l for l in view["expense_lines"] if l["category_id"] == 3)
        assert food_line["fact"] == Decimal("5000")

        assert view["totals"]["fact_income"] == Decimal("45000")
        assert view["totals"]["fact_expense"] == Decimal("5000")
        assert view["totals"]["fact_result"] == Decimal("40000")

    def test_plan_and_fact(self, db_session, sample_account_id, setup_categories):
        uc_month = EnsureBudgetMonthUseCase(db_session)
        mid = uc_month.execute(sample_account_id, 2026, 2)

        uc = SetBudgetLineUseCase(db_session)
        uc.execute(sample_account_id, mid, category_id=1, kind="INCOME", plan_amount="50000")
        uc.execute(sample_account_id, mid, category_id=3, kind="EXPENSE", plan_amount="20000")

        db_session.add(TransactionFeed(
            transaction_id=10, account_id=sample_account_id,
            operation_type="INCOME", amount=Decimal("55000"), currency="RUB",
            wallet_id=1, category_id=1, description="Зарплата",
            occurred_at=datetime(2026, 2, 10),
        ))
        db_session.add(TransactionFeed(
            transaction_id=11, account_id=sample_account_id,
            operation_type="EXPENSE", amount=Decimal("18000"), currency="RUB",
            wallet_id=1, category_id=3, description="Продукты",
            occurred_at=datetime(2026, 2, 15),
        ))
        db_session.flush()

        view = build_budget_view(db_session, sample_account_id, 2026, 2)

        salary = next(l for l in view["income_lines"] if l["category_id"] == 1)
        assert salary["plan"] == Decimal("50000")
        assert salary["fact"] == Decimal("55000")
        assert salary["deviation"] == Decimal("5000")

        food = next(l for l in view["expense_lines"] if l["category_id"] == 3)
        assert food["plan"] == Decimal("20000")
        assert food["fact"] == Decimal("18000")
        assert food["deviation"] == Decimal("-2000")

    def test_deviation_positive(self, db_session, sample_account_id, setup_categories):
        """fact > plan → positive deviation for income."""
        uc_month = EnsureBudgetMonthUseCase(db_session)
        mid = uc_month.execute(sample_account_id, 2026, 2)
        SetBudgetLineUseCase(db_session).execute(sample_account_id, mid, 1, "INCOME", "1000")

        db_session.add(TransactionFeed(
            transaction_id=20, account_id=sample_account_id,
            operation_type="INCOME", amount=Decimal("1500"), currency="RUB",
            wallet_id=1, category_id=1, description="Test",
            occurred_at=datetime(2026, 2, 10),
        ))
        db_session.flush()

        view = build_budget_view(db_session, sample_account_id, 2026, 2)
        line = next(l for l in view["income_lines"] if l["category_id"] == 1)
        assert line["deviation"] == Decimal("500")

    def test_deviation_negative(self, db_session, sample_account_id, setup_categories):
        """fact < plan → negative deviation."""
        uc_month = EnsureBudgetMonthUseCase(db_session)
        mid = uc_month.execute(sample_account_id, 2026, 2)
        SetBudgetLineUseCase(db_session).execute(sample_account_id, mid, 1, "INCOME", "2000")

        db_session.add(TransactionFeed(
            transaction_id=30, account_id=sample_account_id,
            operation_type="INCOME", amount=Decimal("1200"), currency="RUB",
            wallet_id=1, category_id=1, description="Test",
            occurred_at=datetime(2026, 2, 10),
        ))
        db_session.flush()

        view = build_budget_view(db_session, sample_account_id, 2026, 2)
        line = next(l for l in view["income_lines"] if l["category_id"] == 1)
        assert line["deviation"] == Decimal("-800")

    def test_archived_category_to_other(self, db_session, sample_account_id, setup_categories, archived_category):
        """Transactions with archived category go to 'Прочие расходы'."""
        db_session.add(TransactionFeed(
            transaction_id=40, account_id=sample_account_id,
            operation_type="EXPENSE", amount=Decimal("3000"), currency="RUB",
            wallet_id=1, category_id=50, description="Старый расход",
            occurred_at=datetime(2026, 2, 5),
        ))
        db_session.flush()

        view = build_budget_view(db_session, sample_account_id, 2026, 2)
        assert view["other_expense"]["fact"] == Decimal("3000")

    def test_no_category_to_other(self, db_session, sample_account_id, setup_categories):
        """Transactions without category_id go to 'Прочие'."""
        db_session.add(TransactionFeed(
            transaction_id=41, account_id=sample_account_id,
            operation_type="INCOME", amount=Decimal("500"), currency="RUB",
            wallet_id=1, category_id=None, description="Без категории",
            occurred_at=datetime(2026, 2, 8),
        ))
        db_session.flush()

        view = build_budget_view(db_session, sample_account_id, 2026, 2)
        assert view["other_income"]["fact"] == Decimal("500")

    def test_no_duplicate_line(self, db_session, sample_account_id):
        """SetBudgetLine for same category+kind updates, not duplicates."""
        uc_month = EnsureBudgetMonthUseCase(db_session)
        mid = uc_month.execute(sample_account_id, 2026, 2)

        uc = SetBudgetLineUseCase(db_session)
        uc.execute(sample_account_id, mid, category_id=1, kind="INCOME", plan_amount="100")
        uc.execute(sample_account_id, mid, category_id=1, kind="INCOME", plan_amount="200")
        uc.execute(sample_account_id, mid, category_id=1, kind="INCOME", plan_amount="300")

        count = db_session.query(BudgetLine).filter(
            BudgetLine.budget_month_id == mid,
            BudgetLine.category_id == 1,
            BudgetLine.kind == "INCOME",
        ).count()
        assert count == 1

    def test_percentage_calculation(self, db_session, sample_account_id, setup_categories):
        uc_month = EnsureBudgetMonthUseCase(db_session)
        mid = uc_month.execute(sample_account_id, 2026, 2)
        SetBudgetLineUseCase(db_session).execute(sample_account_id, mid, 1, "INCOME", "200")

        db_session.add(TransactionFeed(
            transaction_id=50, account_id=sample_account_id,
            operation_type="INCOME", amount=Decimal("150"), currency="RUB",
            wallet_id=1, category_id=1, description="Test",
            occurred_at=datetime(2026, 2, 10),
        ))
        db_session.flush()

        view = build_budget_view(db_session, sample_account_id, 2026, 2)
        line = next(l for l in view["income_lines"] if l["category_id"] == 1)
        assert line["pct"] == Decimal("75")  # 150/200*100

    def test_totals_correct(self, db_session, sample_account_id, setup_categories):
        uc_month = EnsureBudgetMonthUseCase(db_session)
        mid = uc_month.execute(sample_account_id, 2026, 2)

        uc = SetBudgetLineUseCase(db_session)
        uc.execute(sample_account_id, mid, 1, "INCOME", "50000")
        uc.execute(sample_account_id, mid, 2, "INCOME", "10000")
        uc.execute(sample_account_id, mid, 3, "EXPENSE", "20000")
        uc.execute(sample_account_id, mid, 4, "EXPENSE", "5000")

        db_session.add_all([
            TransactionFeed(
                transaction_id=60, account_id=sample_account_id,
                operation_type="INCOME", amount=Decimal("48000"), currency="RUB",
                wallet_id=1, category_id=1, description="Зарплата",
                occurred_at=datetime(2026, 2, 10),
            ),
            TransactionFeed(
                transaction_id=61, account_id=sample_account_id,
                operation_type="INCOME", amount=Decimal("12000"), currency="RUB",
                wallet_id=1, category_id=2, description="Фриланс",
                occurred_at=datetime(2026, 2, 12),
            ),
            TransactionFeed(
                transaction_id=62, account_id=sample_account_id,
                operation_type="EXPENSE", amount=Decimal("22000"), currency="RUB",
                wallet_id=1, category_id=3, description="Еда",
                occurred_at=datetime(2026, 2, 14),
            ),
            TransactionFeed(
                transaction_id=63, account_id=sample_account_id,
                operation_type="EXPENSE", amount=Decimal("4500"), currency="RUB",
                wallet_id=1, category_id=4, description="Метро",
                occurred_at=datetime(2026, 2, 15),
            ),
        ])
        db_session.flush()

        view = build_budget_view(db_session, sample_account_id, 2026, 2)

        assert view["totals"]["plan_income"] == Decimal("60000")
        assert view["totals"]["fact_income"] == Decimal("60000")
        assert view["totals"]["plan_expense"] == Decimal("25000")
        assert view["totals"]["fact_expense"] == Decimal("26500")
        assert view["totals"]["plan_result"] == Decimal("35000")
        assert view["totals"]["fact_result"] == Decimal("33500")

    def test_different_month_transactions_excluded(self, db_session, sample_account_id, setup_categories):
        """Transactions from other months don't affect the budget view."""
        # January transaction
        db_session.add(TransactionFeed(
            transaction_id=70, account_id=sample_account_id,
            operation_type="INCOME", amount=Decimal("99999"), currency="RUB",
            wallet_id=1, category_id=1, description="Январь",
            occurred_at=datetime(2026, 1, 15),
        ))
        # March transaction
        db_session.add(TransactionFeed(
            transaction_id=71, account_id=sample_account_id,
            operation_type="INCOME", amount=Decimal("88888"), currency="RUB",
            wallet_id=1, category_id=1, description="Март",
            occurred_at=datetime(2026, 3, 15),
        ))
        db_session.flush()

        view = build_budget_view(db_session, sample_account_id, 2026, 2)

        # February should have no fact
        salary = next(l for l in view["income_lines"] if l["category_id"] == 1)
        assert salary["fact"] == Decimal("0")
