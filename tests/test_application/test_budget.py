"""
Tests for Budget use cases and build_budget_view.
"""
import pytest
from datetime import datetime
from decimal import Decimal

from app.infrastructure.db.models import (
    BudgetMonth, BudgetLine, BudgetPlanTemplate, CategoryInfo, TransactionFeed,
)
from app.application.budget import (
    EnsureBudgetMonthUseCase, SetBudgetLineUseCase, SaveBudgetPlanUseCase,
    CopyBudgetPlanUseCase, CopyManualPlanForwardUseCase,
    SaveAsTemplateUseCase, ApplyTemplateToPeriodUseCase,
    has_template, has_previous_period_plan, get_previous_period,
    CreateBudgetVariantUseCase,
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


# ===========================================================================
# Budget Variant — granularity restrictions
# ===========================================================================


class TestAllowedGranularities:
    """Unit tests for get_allowed_granularities and clamp_granularity."""

    def test_base_month_allows_month_and_year(self):
        from app.application.budget import get_allowed_granularities
        assert get_allowed_granularities("MONTH") == ["month", "year"]

    def test_base_week_allows_week_month_year(self):
        from app.application.budget import get_allowed_granularities
        assert get_allowed_granularities("WEEK") == ["week", "month", "year"]

    def test_base_day_allows_all(self):
        from app.application.budget import get_allowed_granularities
        assert get_allowed_granularities("DAY") == ["day", "week", "month", "year"]

    def test_base_year_allows_year_only(self):
        from app.application.budget import get_allowed_granularities
        assert get_allowed_granularities("YEAR") == ["year"]

    def test_unknown_base_defaults_to_month(self):
        from app.application.budget import get_allowed_granularities
        assert get_allowed_granularities("INVALID") == ["month", "year"]

    def test_clamp_finer_grain_to_base(self):
        from app.application.budget import clamp_granularity
        assert clamp_granularity("day", "MONTH") == "month"
        assert clamp_granularity("week", "MONTH") == "month"

    def test_clamp_allowed_grain_unchanged(self):
        from app.application.budget import clamp_granularity
        assert clamp_granularity("month", "MONTH") == "month"
        assert clamp_granularity("year", "MONTH") == "year"

    def test_clamp_case_insensitive(self):
        from app.application.budget import clamp_granularity
        assert clamp_granularity("YEAR", "month") == "year"
        assert clamp_granularity("Month", "MONTH") == "month"


class TestCreateBudgetVariant:
    """Tests for CreateBudgetVariantUseCase."""

    def test_creates_variant(self, db_session, sample_account_id):
        from app.application.budget import CreateBudgetVariantUseCase
        variant = CreateBudgetVariantUseCase(db_session).execute(
            account_id=sample_account_id,
            name="Тестовый бюджет",
            base_granularity="MONTH",
        )
        assert variant.account_id == sample_account_id
        assert variant.name == "Тестовый бюджет"
        assert variant.base_granularity == "MONTH"
        assert variant.is_archived is False
        assert variant.week_starts_on == 1

    def test_empty_name_raises(self, db_session, sample_account_id):
        from app.application.budget import CreateBudgetVariantUseCase, BudgetValidationError
        import pytest
        with pytest.raises(BudgetValidationError):
            CreateBudgetVariantUseCase(db_session).execute(
                account_id=sample_account_id, name="",
            )

    def test_invalid_granularity_raises(self, db_session, sample_account_id):
        from app.application.budget import CreateBudgetVariantUseCase, BudgetValidationError
        import pytest
        with pytest.raises(BudgetValidationError):
            CreateBudgetVariantUseCase(db_session).execute(
                account_id=sample_account_id, name="Test", base_granularity="INVALID",
            )

    def test_multiple_variants_allowed(self, db_session, sample_account_id):
        from app.application.budget import CreateBudgetVariantUseCase
        v1 = CreateBudgetVariantUseCase(db_session).execute(
            account_id=sample_account_id, name="Бюджет 1",
        )
        v2 = CreateBudgetVariantUseCase(db_session).execute(
            account_id=sample_account_id, name="Бюджет 2",
        )
        assert v1.id != v2.id


class TestAttachBudgetData:
    """Tests for AttachBudgetDataUseCase."""

    def test_attach_orphans(self, db_session, sample_account_id):
        from app.application.budget import (
            CreateBudgetVariantUseCase, AttachBudgetDataUseCase,
            EnsureBudgetMonthUseCase,
        )
        # Create a budget month without variant
        bm_id = EnsureBudgetMonthUseCase(db_session).execute(
            account_id=sample_account_id, year=2026, month=1,
        )
        # Create a variant
        variant = CreateBudgetVariantUseCase(db_session).execute(
            account_id=sample_account_id, name="Main",
        )
        # Attach orphans
        count = AttachBudgetDataUseCase(db_session).execute(
            account_id=sample_account_id, variant_id=variant.id,
        )
        assert count == 1
        from app.infrastructure.db.models import BudgetMonth
        bm = db_session.query(BudgetMonth).filter(BudgetMonth.id == bm_id).first()
        assert bm.budget_variant_id == variant.id

    def test_no_orphans(self, db_session, sample_account_id):
        from app.application.budget import (
            CreateBudgetVariantUseCase, AttachBudgetDataUseCase,
        )
        variant = CreateBudgetVariantUseCase(db_session).execute(
            account_id=sample_account_id, name="Main",
        )
        count = AttachBudgetDataUseCase(db_session).execute(
            account_id=sample_account_id, variant_id=variant.id,
        )
        assert count == 0


class TestGetActiveVariant:
    """Tests for get_active_variant helper."""

    def test_returns_none_when_no_variants(self, db_session, sample_account_id):
        from app.application.budget import get_active_variant
        assert get_active_variant(db_session, sample_account_id) is None

    def test_returns_first_non_archived(self, db_session, sample_account_id):
        from app.application.budget import get_active_variant, CreateBudgetVariantUseCase
        v1 = CreateBudgetVariantUseCase(db_session).execute(
            account_id=sample_account_id, name="First",
        )
        v2 = CreateBudgetVariantUseCase(db_session).execute(
            account_id=sample_account_id, name="Second",
        )
        db_session.flush()
        result = get_active_variant(db_session, sample_account_id)
        assert result.id == v1.id  # first by created_at

    def test_by_id(self, db_session, sample_account_id):
        from app.application.budget import get_active_variant, CreateBudgetVariantUseCase
        v1 = CreateBudgetVariantUseCase(db_session).execute(
            account_id=sample_account_id, name="First",
        )
        v2 = CreateBudgetVariantUseCase(db_session).execute(
            account_id=sample_account_id, name="Second",
        )
        db_session.flush()
        result = get_active_variant(db_session, sample_account_id, variant_id=v2.id)
        assert result.id == v2.id


class TestArchiveBudgetVariant:
    """Tests for ArchiveBudgetVariantUseCase."""

    def test_archive_variant(self, db_session, sample_account_id):
        from app.application.budget import (
            CreateBudgetVariantUseCase, ArchiveBudgetVariantUseCase,
        )
        v1 = CreateBudgetVariantUseCase(db_session).execute(
            account_id=sample_account_id, name="First",
        )
        v2 = CreateBudgetVariantUseCase(db_session).execute(
            account_id=sample_account_id, name="Second",
        )
        db_session.flush()
        ArchiveBudgetVariantUseCase(db_session).execute(
            account_id=sample_account_id, variant_id=v1.id,
        )
        assert v1.is_archived is True
        assert v2.is_archived is False

    def test_cannot_archive_last_active(self, db_session, sample_account_id):
        from app.application.budget import (
            CreateBudgetVariantUseCase, ArchiveBudgetVariantUseCase,
            BudgetValidationError,
        )
        import pytest
        v1 = CreateBudgetVariantUseCase(db_session).execute(
            account_id=sample_account_id, name="Only",
        )
        db_session.flush()
        with pytest.raises(BudgetValidationError):
            ArchiveBudgetVariantUseCase(db_session).execute(
                account_id=sample_account_id, variant_id=v1.id,
            )

    def test_cannot_archive_already_archived(self, db_session, sample_account_id):
        from app.application.budget import (
            CreateBudgetVariantUseCase, ArchiveBudgetVariantUseCase,
            BudgetValidationError,
        )
        import pytest
        v1 = CreateBudgetVariantUseCase(db_session).execute(
            account_id=sample_account_id, name="First",
        )
        v2 = CreateBudgetVariantUseCase(db_session).execute(
            account_id=sample_account_id, name="Second",
        )
        db_session.flush()
        ArchiveBudgetVariantUseCase(db_session).execute(
            account_id=sample_account_id, variant_id=v1.id,
        )
        with pytest.raises(BudgetValidationError):
            ArchiveBudgetVariantUseCase(db_session).execute(
                account_id=sample_account_id, variant_id=v1.id,
            )

    def test_archived_not_in_active_variant(self, db_session, sample_account_id):
        from app.application.budget import (
            CreateBudgetVariantUseCase, ArchiveBudgetVariantUseCase,
            get_active_variant,
        )
        v1 = CreateBudgetVariantUseCase(db_session).execute(
            account_id=sample_account_id, name="First",
        )
        v2 = CreateBudgetVariantUseCase(db_session).execute(
            account_id=sample_account_id, name="Second",
        )
        db_session.flush()
        ArchiveBudgetVariantUseCase(db_session).execute(
            account_id=sample_account_id, variant_id=v1.id,
        )
        # get_active_variant without id should return v2 (only remaining active)
        result = get_active_variant(db_session, sample_account_id)
        assert result.id == v2.id


class TestCopyBudgetPlan:
    """Tests for CopyBudgetPlanUseCase."""

    def test_copy_plan_from_previous_month(self, db_session, sample_account_id, setup_categories):
        variant = CreateBudgetVariantUseCase(db_session).execute(
            account_id=sample_account_id, name="Main",
        )
        db_session.flush()

        # Create source month with lines
        SaveBudgetPlanUseCase(db_session).execute(
            account_id=sample_account_id, year=2026, month=1,
            lines=[
                {"category_id": 1, "kind": "INCOME", "plan_amount": "100000"},
                {"category_id": 3, "kind": "EXPENSE", "plan_amount": "50000"},
            ],
            budget_variant_id=variant.id,
        )

        # Copy to next month
        count = CopyBudgetPlanUseCase(db_session).execute(
            account_id=sample_account_id,
            from_year=2026, from_month=1,
            to_year=2026, to_month=2,
            budget_variant_id=variant.id,
        )

        assert count == 2

        # Verify target lines
        target_bm = db_session.query(BudgetMonth).filter(
            BudgetMonth.account_id == sample_account_id,
            BudgetMonth.year == 2026,
            BudgetMonth.month == 2,
        ).first()
        assert target_bm is not None

        target_lines = db_session.query(BudgetLine).filter(
            BudgetLine.budget_month_id == target_bm.id,
        ).all()
        amounts = {(l.category_id, l.kind): l.plan_amount for l in target_lines}
        assert amounts[(1, "INCOME")] == Decimal("100000")
        assert amounts[(3, "EXPENSE")] == Decimal("50000")

    def test_copy_no_source_returns_zero(self, db_session, sample_account_id):
        count = CopyBudgetPlanUseCase(db_session).execute(
            account_id=sample_account_id,
            from_year=2025, from_month=12,
            to_year=2026, to_month=1,
        )
        assert count == 0

    def test_copy_overwrites_existing(self, db_session, sample_account_id, setup_categories):
        variant = CreateBudgetVariantUseCase(db_session).execute(
            account_id=sample_account_id, name="Main",
        )
        db_session.flush()

        # Create source
        SaveBudgetPlanUseCase(db_session).execute(
            account_id=sample_account_id, year=2026, month=1,
            lines=[{"category_id": 3, "kind": "EXPENSE", "plan_amount": "50000"}],
            budget_variant_id=variant.id,
        )

        # Create target with different value
        SaveBudgetPlanUseCase(db_session).execute(
            account_id=sample_account_id, year=2026, month=2,
            lines=[{"category_id": 3, "kind": "EXPENSE", "plan_amount": "30000"}],
            budget_variant_id=variant.id,
        )

        # Copy overwrites
        CopyBudgetPlanUseCase(db_session).execute(
            account_id=sample_account_id,
            from_year=2026, from_month=1,
            to_year=2026, to_month=2,
            budget_variant_id=variant.id,
        )

        target_bm = db_session.query(BudgetMonth).filter(
            BudgetMonth.account_id == sample_account_id,
            BudgetMonth.year == 2026,
            BudgetMonth.month == 2,
        ).first()
        line = db_session.query(BudgetLine).filter(
            BudgetLine.budget_month_id == target_bm.id,
            BudgetLine.category_id == 3,
        ).first()
        assert line.plan_amount == Decimal("50000")


class TestSaveAsTemplate:
    """Tests for SaveAsTemplateUseCase."""

    def test_save_template(self, db_session, sample_account_id, setup_categories):
        variant = CreateBudgetVariantUseCase(db_session).execute(
            account_id=sample_account_id, name="Main",
        )
        db_session.flush()

        # Create a period with plan
        SaveBudgetPlanUseCase(db_session).execute(
            account_id=sample_account_id, year=2026, month=1,
            lines=[
                {"category_id": 1, "kind": "INCOME", "plan_amount": "100000"},
                {"category_id": 3, "kind": "EXPENSE", "plan_amount": "50000"},
            ],
            budget_variant_id=variant.id,
        )

        # Save as template
        count = SaveAsTemplateUseCase(db_session).execute(
            account_id=sample_account_id,
            year=2026, month=1,
            budget_variant_id=variant.id,
        )
        assert count == 2

        # Verify template
        tpls = db_session.query(BudgetPlanTemplate).filter(
            BudgetPlanTemplate.budget_variant_id == variant.id,
        ).all()
        assert len(tpls) == 2
        amounts = {(t.category_id, t.kind): t.default_planned_amount for t in tpls}
        assert amounts[(1, "INCOME")] == Decimal("100000")
        assert amounts[(3, "EXPENSE")] == Decimal("50000")

    def test_save_template_replaces_old(self, db_session, sample_account_id, setup_categories):
        variant = CreateBudgetVariantUseCase(db_session).execute(
            account_id=sample_account_id, name="Main",
        )
        db_session.flush()

        # Create period 1
        SaveBudgetPlanUseCase(db_session).execute(
            account_id=sample_account_id, year=2026, month=1,
            lines=[{"category_id": 1, "kind": "INCOME", "plan_amount": "100000"}],
            budget_variant_id=variant.id,
        )
        SaveAsTemplateUseCase(db_session).execute(
            account_id=sample_account_id, year=2026, month=1,
            budget_variant_id=variant.id,
        )

        # Create period 2 with different amounts
        SaveBudgetPlanUseCase(db_session).execute(
            account_id=sample_account_id, year=2026, month=2,
            lines=[{"category_id": 3, "kind": "EXPENSE", "plan_amount": "75000"}],
            budget_variant_id=variant.id,
        )
        SaveAsTemplateUseCase(db_session).execute(
            account_id=sample_account_id, year=2026, month=2,
            budget_variant_id=variant.id,
        )

        # Template should only have period 2 lines
        tpls = db_session.query(BudgetPlanTemplate).filter(
            BudgetPlanTemplate.budget_variant_id == variant.id,
        ).all()
        assert len(tpls) == 1
        assert tpls[0].category_id == 3
        assert tpls[0].default_planned_amount == Decimal("75000")

    def test_has_template(self, db_session, sample_account_id, setup_categories):
        variant = CreateBudgetVariantUseCase(db_session).execute(
            account_id=sample_account_id, name="Main",
        )
        db_session.flush()

        assert has_template(db_session, sample_account_id, variant.id) is False

        SaveBudgetPlanUseCase(db_session).execute(
            account_id=sample_account_id, year=2026, month=1,
            lines=[{"category_id": 1, "kind": "INCOME", "plan_amount": "100000"}],
            budget_variant_id=variant.id,
        )
        SaveAsTemplateUseCase(db_session).execute(
            account_id=sample_account_id, year=2026, month=1,
            budget_variant_id=variant.id,
        )

        assert has_template(db_session, sample_account_id, variant.id) is True


class TestApplyTemplate:
    """Tests for ApplyTemplateToPeriodUseCase."""

    def test_apply_template(self, db_session, sample_account_id, setup_categories):
        variant = CreateBudgetVariantUseCase(db_session).execute(
            account_id=sample_account_id, name="Main",
        )
        db_session.flush()

        # Create and save template
        SaveBudgetPlanUseCase(db_session).execute(
            account_id=sample_account_id, year=2026, month=1,
            lines=[
                {"category_id": 1, "kind": "INCOME", "plan_amount": "120000"},
                {"category_id": 3, "kind": "EXPENSE", "plan_amount": "45000"},
            ],
            budget_variant_id=variant.id,
        )
        SaveAsTemplateUseCase(db_session).execute(
            account_id=sample_account_id, year=2026, month=1,
            budget_variant_id=variant.id,
        )

        # Apply to new period
        count = ApplyTemplateToPeriodUseCase(db_session).execute(
            account_id=sample_account_id,
            year=2026, month=3,
            budget_variant_id=variant.id,
        )
        assert count == 2

        # Verify target lines
        target_bm = db_session.query(BudgetMonth).filter(
            BudgetMonth.account_id == sample_account_id,
            BudgetMonth.year == 2026,
            BudgetMonth.month == 3,
        ).first()
        lines = db_session.query(BudgetLine).filter(
            BudgetLine.budget_month_id == target_bm.id,
        ).all()
        amounts = {(l.category_id, l.kind): l.plan_amount for l in lines}
        assert amounts[(1, "INCOME")] == Decimal("120000")
        assert amounts[(3, "EXPENSE")] == Decimal("45000")

    def test_apply_no_template_returns_zero(self, db_session, sample_account_id):
        variant = CreateBudgetVariantUseCase(db_session).execute(
            account_id=sample_account_id, name="Main",
        )
        db_session.flush()

        count = ApplyTemplateToPeriodUseCase(db_session).execute(
            account_id=sample_account_id,
            year=2026, month=1,
            budget_variant_id=variant.id,
        )
        assert count == 0


class TestGetPreviousPeriod:
    """Tests for get_previous_period helper."""

    def test_normal_month(self):
        assert get_previous_period(2026, 5) == (2026, 4)

    def test_january_wraps_to_december(self):
        assert get_previous_period(2026, 1) == (2025, 12)

    def test_has_previous_period_plan(self, db_session, sample_account_id, setup_categories):
        variant = CreateBudgetVariantUseCase(db_session).execute(
            account_id=sample_account_id, name="Main",
        )
        db_session.flush()

        # No previous plan
        assert has_previous_period_plan(
            db_session, sample_account_id, 2026, 2, variant.id,
        ) is False

        # Create plan for January
        SaveBudgetPlanUseCase(db_session).execute(
            account_id=sample_account_id, year=2026, month=1,
            lines=[{"category_id": 1, "kind": "INCOME", "plan_amount": "100000"}],
            budget_variant_id=variant.id,
        )

        # Now previous plan exists
        assert has_previous_period_plan(
            db_session, sample_account_id, 2026, 2, variant.id,
        ) is True


class TestBatchSavePlanOptimized:
    """Tests for the batch-optimized SaveBudgetPlanUseCase."""

    def test_batch_save_creates_lines(self, db_session, sample_account_id, setup_categories):
        variant = CreateBudgetVariantUseCase(db_session).execute(
            account_id=sample_account_id, name="Main",
        )
        db_session.flush()

        SaveBudgetPlanUseCase(db_session).execute(
            account_id=sample_account_id, year=2026, month=1,
            lines=[
                {"category_id": 1, "kind": "INCOME", "plan_amount": "100000"},
                {"category_id": 3, "kind": "EXPENSE", "plan_amount": "50000"},
                {"category_id": 4, "kind": "EXPENSE", "plan_amount": "20000"},
            ],
            budget_variant_id=variant.id,
        )

        bm = db_session.query(BudgetMonth).filter(
            BudgetMonth.account_id == sample_account_id,
            BudgetMonth.year == 2026,
            BudgetMonth.month == 1,
        ).first()
        lines = db_session.query(BudgetLine).filter(
            BudgetLine.budget_month_id == bm.id,
        ).all()
        assert len(lines) == 3

    def test_batch_save_updates_existing(self, db_session, sample_account_id, setup_categories):
        variant = CreateBudgetVariantUseCase(db_session).execute(
            account_id=sample_account_id, name="Main",
        )
        db_session.flush()

        # First save
        SaveBudgetPlanUseCase(db_session).execute(
            account_id=sample_account_id, year=2026, month=1,
            lines=[{"category_id": 1, "kind": "INCOME", "plan_amount": "100000"}],
            budget_variant_id=variant.id,
        )

        # Second save with updated amount
        SaveBudgetPlanUseCase(db_session).execute(
            account_id=sample_account_id, year=2026, month=1,
            lines=[{"category_id": 1, "kind": "INCOME", "plan_amount": "150000"}],
            budget_variant_id=variant.id,
        )

        bm = db_session.query(BudgetMonth).filter(
            BudgetMonth.account_id == sample_account_id,
            BudgetMonth.year == 2026,
            BudgetMonth.month == 1,
        ).first()
        line = db_session.query(BudgetLine).filter(
            BudgetLine.budget_month_id == bm.id,
            BudgetLine.category_id == 1,
        ).first()
        assert line.plan_amount == Decimal("150000")

    def test_batch_save_skips_zero_no_existing(self, db_session, sample_account_id, setup_categories):
        variant = CreateBudgetVariantUseCase(db_session).execute(
            account_id=sample_account_id, name="Main",
        )
        db_session.flush()

        SaveBudgetPlanUseCase(db_session).execute(
            account_id=sample_account_id, year=2026, month=1,
            lines=[{"category_id": 1, "kind": "INCOME", "plan_amount": "0"}],
            budget_variant_id=variant.id,
        )

        bm = db_session.query(BudgetMonth).filter(
            BudgetMonth.account_id == sample_account_id,
            BudgetMonth.year == 2026,
            BudgetMonth.month == 1,
        ).first()
        # Month is created but no line should exist
        if bm:
            lines = db_session.query(BudgetLine).filter(
                BudgetLine.budget_month_id == bm.id,
            ).all()
            assert len(lines) == 0


class TestCopyManualPlanForward:
    """Tests for CopyManualPlanForwardUseCase."""

    def test_copy_forward_3_periods(self, db_session, sample_account_id, setup_categories):
        variant = CreateBudgetVariantUseCase(db_session).execute(
            account_id=sample_account_id, name="Main",
        )
        db_session.flush()

        # Create source plan for January
        SaveBudgetPlanUseCase(db_session).execute(
            account_id=sample_account_id, year=2026, month=1,
            lines=[
                {"category_id": 1, "kind": "INCOME", "plan_amount": "100000"},
                {"category_id": 3, "kind": "EXPENSE", "plan_amount": "50000"},
            ],
            budget_variant_id=variant.id,
        )

        # Copy forward 3 periods
        count = CopyManualPlanForwardUseCase(db_session).execute(
            account_id=sample_account_id,
            from_year=2026, from_month=1,
            periods_ahead=3,
            budget_variant_id=variant.id,
        )
        assert count == 6  # 2 lines * 3 periods

        # Verify Feb, Mar, Apr have the plan
        for m in [2, 3, 4]:
            bm = db_session.query(BudgetMonth).filter(
                BudgetMonth.account_id == sample_account_id,
                BudgetMonth.year == 2026,
                BudgetMonth.month == m,
            ).first()
            assert bm is not None
            lines = db_session.query(BudgetLine).filter(
                BudgetLine.budget_month_id == bm.id,
            ).all()
            amounts = {(l.category_id, l.kind): l.plan_amount for l in lines}
            assert amounts[(1, "INCOME")] == Decimal("100000")
            assert amounts[(3, "EXPENSE")] == Decimal("50000")

    def test_skip_filled_by_default(self, db_session, sample_account_id, setup_categories):
        variant = CreateBudgetVariantUseCase(db_session).execute(
            account_id=sample_account_id, name="Main",
        )
        db_session.flush()

        # Source: Jan
        SaveBudgetPlanUseCase(db_session).execute(
            account_id=sample_account_id, year=2026, month=1,
            lines=[{"category_id": 3, "kind": "EXPENSE", "plan_amount": "50000"}],
            budget_variant_id=variant.id,
        )

        # Target Feb already has a different value
        SaveBudgetPlanUseCase(db_session).execute(
            account_id=sample_account_id, year=2026, month=2,
            lines=[{"category_id": 3, "kind": "EXPENSE", "plan_amount": "30000"}],
            budget_variant_id=variant.id,
        )

        # Copy forward 1 period (to Feb) — should skip because filled
        count = CopyManualPlanForwardUseCase(db_session).execute(
            account_id=sample_account_id,
            from_year=2026, from_month=1,
            periods_ahead=1,
            budget_variant_id=variant.id,
            overwrite=False,
        )
        assert count == 0  # skipped

        # Feb should still have 30000
        bm = db_session.query(BudgetMonth).filter(
            BudgetMonth.account_id == sample_account_id,
            BudgetMonth.year == 2026,
            BudgetMonth.month == 2,
        ).first()
        line = db_session.query(BudgetLine).filter(
            BudgetLine.budget_month_id == bm.id,
            BudgetLine.category_id == 3,
        ).first()
        assert line.plan_amount == Decimal("30000")

    def test_overwrite_mode(self, db_session, sample_account_id, setup_categories):
        variant = CreateBudgetVariantUseCase(db_session).execute(
            account_id=sample_account_id, name="Main",
        )
        db_session.flush()

        # Source: Jan
        SaveBudgetPlanUseCase(db_session).execute(
            account_id=sample_account_id, year=2026, month=1,
            lines=[{"category_id": 3, "kind": "EXPENSE", "plan_amount": "50000"}],
            budget_variant_id=variant.id,
        )

        # Target Feb
        SaveBudgetPlanUseCase(db_session).execute(
            account_id=sample_account_id, year=2026, month=2,
            lines=[{"category_id": 3, "kind": "EXPENSE", "plan_amount": "30000"}],
            budget_variant_id=variant.id,
        )

        # Copy forward with overwrite=True
        count = CopyManualPlanForwardUseCase(db_session).execute(
            account_id=sample_account_id,
            from_year=2026, from_month=1,
            periods_ahead=1,
            budget_variant_id=variant.id,
            overwrite=True,
        )
        assert count == 1

        # Feb should now have 50000
        bm = db_session.query(BudgetMonth).filter(
            BudgetMonth.account_id == sample_account_id,
            BudgetMonth.year == 2026,
            BudgetMonth.month == 2,
        ).first()
        line = db_session.query(BudgetLine).filter(
            BudgetLine.budget_month_id == bm.id,
            BudgetLine.category_id == 3,
        ).first()
        assert line.plan_amount == Decimal("50000")

    def test_invalid_periods_ahead(self, db_session, sample_account_id):
        variant = CreateBudgetVariantUseCase(db_session).execute(
            account_id=sample_account_id, name="Main",
        )
        db_session.flush()

        import pytest
        with pytest.raises(BudgetValidationError):
            CopyManualPlanForwardUseCase(db_session).execute(
                account_id=sample_account_id,
                from_year=2026, from_month=1,
                periods_ahead=0,
                budget_variant_id=variant.id,
            )
        with pytest.raises(BudgetValidationError):
            CopyManualPlanForwardUseCase(db_session).execute(
                account_id=sample_account_id,
                from_year=2026, from_month=1,
                periods_ahead=25,
                budget_variant_id=variant.id,
            )

    def test_no_source_plan_returns_zero(self, db_session, sample_account_id):
        variant = CreateBudgetVariantUseCase(db_session).execute(
            account_id=sample_account_id, name="Main",
        )
        db_session.flush()

        count = CopyManualPlanForwardUseCase(db_session).execute(
            account_id=sample_account_id,
            from_year=2026, from_month=1,
            periods_ahead=3,
            budget_variant_id=variant.id,
        )
        assert count == 0


class TestMatrixPlanBreakdown:
    """Tests for plan_manual/plan_planned breakdown in matrix cells."""

    def test_cell_has_plan_breakdown(self, db_session, sample_account_id, setup_categories):
        from app.application.budget_matrix import BudgetMatrixService
        variant = CreateBudgetVariantUseCase(db_session).execute(
            account_id=sample_account_id, name="Main",
        )
        db_session.flush()

        # Set manual plan
        SaveBudgetPlanUseCase(db_session).execute(
            account_id=sample_account_id, year=2026, month=2,
            lines=[{"category_id": 1, "kind": "INCOME", "plan_amount": "100000"}],
            budget_variant_id=variant.id,
        )

        view = BudgetMatrixService(db_session).build(
            account_id=sample_account_id,
            grain="month",
            range_count=1,
            anchor_year=2026,
            anchor_month=2,
            budget_variant_id=variant.id,
        )

        # Find the income row for category 1
        row = next(r for r in view["income_rows"] if r["category_id"] == 1)
        cell = row["cells"][0]
        assert "plan_manual" in cell
        assert "plan_planned" in cell
        assert cell["plan_manual"] == Decimal("100000")
        assert cell["plan_planned"] == Decimal("0")
        assert cell["plan"] == Decimal("100000")
