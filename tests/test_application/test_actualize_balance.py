"""
Tests for Balance Actualization feature
"""
import pytest
from decimal import Decimal

from app.application.wallets import CreateWalletUseCase
from app.application.transactions import CreateTransactionUseCase, TransactionValidationError
from app.infrastructure.db.models import WalletBalance, TransactionFeed, CategoryInfo, EventLog


@pytest.fixture
def regular_wallet(db_session, sample_account_id):
    """Create a REGULAR wallet with balance 10000"""
    wallet_id = CreateWalletUseCase(db_session).execute(
        account_id=sample_account_id,
        title="Основная карта",
        currency="RUB",
        wallet_type="REGULAR",
        initial_balance="10000",
        actor_user_id=sample_account_id,
    )
    return wallet_id


@pytest.fixture
def credit_wallet(db_session, sample_account_id):
    """Create a CREDIT wallet"""
    wallet_id = CreateWalletUseCase(db_session).execute(
        account_id=sample_account_id,
        title="Кредитка",
        currency="RUB",
        wallet_type="CREDIT",
        initial_balance="-5000",
        actor_user_id=sample_account_id,
    )
    return wallet_id


@pytest.fixture
def savings_wallet(db_session, sample_account_id):
    """Create a SAVINGS wallet"""
    wallet_id = CreateWalletUseCase(db_session).execute(
        account_id=sample_account_id,
        title="Вклад",
        currency="RUB",
        wallet_type="SAVINGS",
        initial_balance="50000",
        actor_user_id=sample_account_id,
    )
    return wallet_id


@pytest.fixture
def system_categories(db_session, sample_account_id):
    """Create system categories for actualization"""
    from datetime import datetime
    cats = [
        CategoryInfo(
            category_id=901,
            account_id=sample_account_id,
            title="Прочие доходы",
            category_type="INCOME",
            is_system=True,
            is_archived=False,
            sort_order=0,
            created_at=datetime.utcnow(),
        ),
        CategoryInfo(
            category_id=902,
            account_id=sample_account_id,
            title="Прочие расходы",
            category_type="EXPENSE",
            is_system=True,
            is_archived=False,
            sort_order=0,
            created_at=datetime.utcnow(),
        ),
    ]
    db_session.add_all(cats)
    db_session.flush()
    return {c.title: c.category_id for c in cats}


def test_actualize_positive_delta(db_session, sample_account_id, regular_wallet, system_categories):
    """target > current → INCOME created, balance becomes target"""
    uc = CreateTransactionUseCase(db_session)
    result = uc.actualize_balance(
        account_id=sample_account_id,
        wallet_id=regular_wallet,
        target_balance=Decimal("15000"),
        actor_user_id=sample_account_id,
    )

    assert result["action"] == "income"
    assert result["delta"] == Decimal("5000")
    assert result["transaction_id"] is not None

    # Check wallet balance
    wallet = db_session.query(WalletBalance).filter(
        WalletBalance.wallet_id == regular_wallet
    ).first()
    assert wallet.balance == Decimal("15000")

    # Check transaction in feed
    tx = db_session.query(TransactionFeed).filter(
        TransactionFeed.transaction_id == result["transaction_id"]
    ).first()
    assert tx.operation_type == "INCOME"
    assert tx.amount == Decimal("5000")
    assert tx.description == "Актуализация баланса"
    assert tx.category_id == system_categories["Прочие доходы"]


def test_actualize_negative_delta(db_session, sample_account_id, regular_wallet, system_categories):
    """target < current → EXPENSE created, balance becomes target"""
    uc = CreateTransactionUseCase(db_session)
    result = uc.actualize_balance(
        account_id=sample_account_id,
        wallet_id=regular_wallet,
        target_balance=Decimal("3000"),
        actor_user_id=sample_account_id,
    )

    assert result["action"] == "expense"
    assert result["delta"] == Decimal("7000")
    assert result["transaction_id"] is not None

    # Check wallet balance
    wallet = db_session.query(WalletBalance).filter(
        WalletBalance.wallet_id == regular_wallet
    ).first()
    assert wallet.balance == Decimal("3000")

    # Check transaction in feed
    tx = db_session.query(TransactionFeed).filter(
        TransactionFeed.transaction_id == result["transaction_id"]
    ).first()
    assert tx.operation_type == "EXPENSE"
    assert tx.amount == Decimal("7000")
    assert tx.description == "Актуализация баланса"
    assert tx.category_id == system_categories["Прочие расходы"]


def test_actualize_zero_delta(db_session, sample_account_id, regular_wallet, system_categories):
    """target == current → no transaction created"""
    uc = CreateTransactionUseCase(db_session)
    result = uc.actualize_balance(
        account_id=sample_account_id,
        wallet_id=regular_wallet,
        target_balance=Decimal("10000"),
        actor_user_id=sample_account_id,
    )

    assert result["action"] == "none"
    assert result["delta"] == Decimal("0")
    assert result["transaction_id"] is None

    # No new transactions created (only wallet_created events exist)
    tx_count = db_session.query(TransactionFeed).count()
    assert tx_count == 0


def test_actualize_non_regular_credit(db_session, sample_account_id, credit_wallet, system_categories):
    """CREDIT wallet → error"""
    uc = CreateTransactionUseCase(db_session)
    with pytest.raises(TransactionValidationError, match="только для обычных"):
        uc.actualize_balance(
            account_id=sample_account_id,
            wallet_id=credit_wallet,
            target_balance=Decimal("0"),
            actor_user_id=sample_account_id,
        )


def test_actualize_non_regular_savings(db_session, sample_account_id, savings_wallet, system_categories):
    """SAVINGS wallet → error"""
    uc = CreateTransactionUseCase(db_session)
    with pytest.raises(TransactionValidationError, match="только для обычных"):
        uc.actualize_balance(
            account_id=sample_account_id,
            wallet_id=savings_wallet,
            target_balance=Decimal("60000"),
            actor_user_id=sample_account_id,
        )


def test_actualize_without_system_categories(db_session, sample_account_id, regular_wallet):
    """Works even without system categories (category_id=None)"""
    uc = CreateTransactionUseCase(db_session)
    result = uc.actualize_balance(
        account_id=sample_account_id,
        wallet_id=regular_wallet,
        target_balance=Decimal("12000"),
        actor_user_id=sample_account_id,
    )

    assert result["action"] == "income"
    assert result["delta"] == Decimal("2000")

    wallet = db_session.query(WalletBalance).filter(
        WalletBalance.wallet_id == regular_wallet
    ).first()
    assert wallet.balance == Decimal("12000")

    tx = db_session.query(TransactionFeed).filter(
        TransactionFeed.transaction_id == result["transaction_id"]
    ).first()
    assert tx.category_id is None
