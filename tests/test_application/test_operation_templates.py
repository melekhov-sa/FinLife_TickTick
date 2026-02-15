"""
Tests for operation template validation rules
"""
import pytest
from datetime import date, datetime

from app.infrastructure.db.models import WalletBalance, CategoryInfo
from app.application.operation_templates import (
    CreateOperationTemplateUseCase,
    OperationTemplateValidationError,
)

_NOW = datetime(2026, 1, 1, 0, 0, 0)


@pytest.fixture
def setup_wallets(db_session, sample_account_id):
    """Create regular, savings, and credit wallets."""
    regular = WalletBalance(
        wallet_id=1, account_id=sample_account_id,
        title="Наличные", currency="RUB", wallet_type="REGULAR", balance=10000,
        created_at=_NOW,
    )
    savings = WalletBalance(
        wallet_id=2, account_id=sample_account_id,
        title="Накопления", currency="RUB", wallet_type="SAVINGS", balance=50000,
        created_at=_NOW,
    )
    credit = WalletBalance(
        wallet_id=3, account_id=sample_account_id,
        title="Кредитка", currency="RUB", wallet_type="CREDIT", balance=-5000,
        created_at=_NOW,
    )
    db_session.add_all([regular, savings, credit])
    db_session.flush()
    return {"regular": regular, "savings": savings, "credit": credit}


@pytest.fixture
def setup_category(db_session, sample_account_id):
    """Create a financial category."""
    cat = CategoryInfo(
        category_id=1, account_id=sample_account_id,
        title="Зарплата", category_type="INCOME",
        is_system=False, is_archived=False,
        created_at=_NOW,
    )
    db_session.add(cat)
    db_session.flush()
    return cat


class TestExpenseValidation:
    def test_expense_without_category_fails(self, db_session, sample_account_id, setup_wallets):
        """EXPENSE без category_id -> ошибка."""
        uc = CreateOperationTemplateUseCase(db_session)
        with pytest.raises(OperationTemplateValidationError, match="Категория обязательна"):
            uc.execute(
                account_id=sample_account_id, title="Обед", freq="MONTHLY",
                interval=1, start_date="2026-03-01", kind="EXPENSE",
                amount="500", wallet_id=1, category_id=None,
            )

    def test_expense_without_wallet_fails(self, db_session, sample_account_id, setup_wallets, setup_category):
        """EXPENSE без wallet_id -> ошибка."""
        uc = CreateOperationTemplateUseCase(db_session)
        with pytest.raises(OperationTemplateValidationError, match="Кошелёк обязателен"):
            uc.execute(
                account_id=sample_account_id, title="Обед", freq="MONTHLY",
                interval=1, start_date="2026-03-01", kind="EXPENSE",
                amount="500", wallet_id=None, category_id=1,
            )


class TestIncomeValidation:
    def test_income_without_category_fails(self, db_session, sample_account_id, setup_wallets):
        """INCOME без category_id -> ошибка."""
        uc = CreateOperationTemplateUseCase(db_session)
        with pytest.raises(OperationTemplateValidationError, match="Категория обязательна"):
            uc.execute(
                account_id=sample_account_id, title="Зарплата", freq="MONTHLY",
                interval=1, start_date="2026-03-01", kind="INCOME",
                amount="100000", wallet_id=1, category_id=None,
            )


class TestTransferRejected:
    def test_transfer_kind_rejected(self, db_session, sample_account_id, setup_wallets, setup_category):
        """TRANSFER kind -> ошибка (больше не поддерживается)."""
        uc = CreateOperationTemplateUseCase(db_session)
        with pytest.raises(OperationTemplateValidationError, match="Неверный тип операции"):
            uc.execute(
                account_id=sample_account_id, title="Перевод", freq="MONTHLY",
                interval=1, start_date="2026-03-01", kind="TRANSFER",
                amount="1000", wallet_id=1, category_id=1,
            )


class TestCreditWalletRestriction:
    def test_credit_wallet_for_expense_fails(self, db_session, sample_account_id, setup_wallets, setup_category):
        """Кредитный кошелёк для EXPENSE -> ошибка."""
        uc = CreateOperationTemplateUseCase(db_session)
        with pytest.raises(OperationTemplateValidationError, match="Кредитные кошельки"):
            uc.execute(
                account_id=sample_account_id, title="С кредитки", freq="MONTHLY",
                interval=1, start_date="2026-03-01", kind="EXPENSE",
                amount="500", wallet_id=3, category_id=1,
            )

    def test_credit_wallet_for_income_fails(self, db_session, sample_account_id, setup_wallets, setup_category):
        """Кредитный кошелёк для INCOME -> ошибка."""
        uc = CreateOperationTemplateUseCase(db_session)
        with pytest.raises(OperationTemplateValidationError, match="Кредитные кошельки"):
            uc.execute(
                account_id=sample_account_id, title="На кредитку", freq="MONTHLY",
                interval=1, start_date="2026-03-01", kind="INCOME",
                amount="500", wallet_id=3, category_id=1,
            )


class TestAmountValidation:
    def test_zero_amount_fails(self, db_session, sample_account_id, setup_wallets, setup_category):
        """Сумма 0 -> ошибка."""
        uc = CreateOperationTemplateUseCase(db_session)
        with pytest.raises(OperationTemplateValidationError, match="больше нуля"):
            uc.execute(
                account_id=sample_account_id, title="Ноль", freq="MONTHLY",
                interval=1, start_date="2026-03-01", kind="EXPENSE",
                amount="0", wallet_id=1, category_id=1,
            )

    def test_negative_amount_fails(self, db_session, sample_account_id, setup_wallets, setup_category):
        """Отрицательная сумма -> ошибка."""
        uc = CreateOperationTemplateUseCase(db_session)
        with pytest.raises(OperationTemplateValidationError, match="больше нуля"):
            uc.execute(
                account_id=sample_account_id, title="Минус", freq="MONTHLY",
                interval=1, start_date="2026-03-01", kind="EXPENSE",
                amount="-100", wallet_id=1, category_id=1,
            )
