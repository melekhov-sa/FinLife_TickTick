"""
Tests for Wallet use cases
"""
import pytest
from decimal import Decimal
from app.application.wallets import CreateWalletUseCase
from app.infrastructure.db.models import WalletBalance, EventLog


def test_create_wallet_with_default_type(db_session, sample_account_id):
    """Создание кошелька с типом по умолчанию (REGULAR)"""
    use_case = CreateWalletUseCase(db_session)

    wallet_id = use_case.execute(
        account_id=sample_account_id,
        title="Наличные",
        currency="RUB",
        actor_user_id=sample_account_id
    )

    # Проверить событие
    event = db_session.query(EventLog).filter(
        EventLog.event_type == "wallet_created"
    ).first()
    assert event is not None
    assert event.payload_json["wallet_type"] == "REGULAR"
    assert event.payload_json["initial_balance"] == "0"

    # Проверить read model
    wallet = db_session.query(WalletBalance).filter(
        WalletBalance.wallet_id == wallet_id
    ).first()
    assert wallet is not None
    assert wallet.wallet_type == "REGULAR"
    assert wallet.balance == Decimal("0")


def test_create_wallet_credit_with_negative_balance(db_session, sample_account_id):
    """Создание кредитного кошелька с отрицательным балансом"""
    use_case = CreateWalletUseCase(db_session)

    wallet_id = use_case.execute(
        account_id=sample_account_id,
        title="Кредитная карта",
        currency="RUB",
        wallet_type="CREDIT",
        initial_balance="-15000",
        actor_user_id=sample_account_id
    )

    # Проверить событие
    event = db_session.query(EventLog).filter(
        EventLog.event_type == "wallet_created"
    ).first()
    assert event.payload_json["wallet_type"] == "CREDIT"
    assert event.payload_json["initial_balance"] == "-15000"

    # Проверить read model
    wallet = db_session.query(WalletBalance).filter(
        WalletBalance.wallet_id == wallet_id
    ).first()
    assert wallet.wallet_type == "CREDIT"
    assert wallet.balance == Decimal("-15000")


def test_create_wallet_savings_with_initial_balance(db_session, sample_account_id):
    """Создание накопительного кошелька с начальным балансом"""
    use_case = CreateWalletUseCase(db_session)

    wallet_id = use_case.execute(
        account_id=sample_account_id,
        title="Вклад",
        currency="RUB",
        wallet_type="SAVINGS",
        initial_balance="100000.50",
        actor_user_id=sample_account_id
    )

    # Проверить read model
    wallet = db_session.query(WalletBalance).filter(
        WalletBalance.wallet_id == wallet_id
    ).first()
    assert wallet.wallet_type == "SAVINGS"
    assert wallet.balance == Decimal("100000.50")


def test_create_multiple_wallets_with_different_types(db_session, sample_account_id):
    """Создание нескольких кошельков разных типов"""
    use_case = CreateWalletUseCase(db_session)

    # Обычный
    wallet_1 = use_case.execute(
        account_id=sample_account_id,
        title="Наличные",
        currency="RUB",
        wallet_type="REGULAR",
        initial_balance="5000"
    )

    # Кредит
    wallet_2 = use_case.execute(
        account_id=sample_account_id,
        title="Кредитка",
        currency="RUB",
        wallet_type="CREDIT",
        initial_balance="-10000"
    )

    # Накопления
    wallet_3 = use_case.execute(
        account_id=sample_account_id,
        title="Накопления",
        currency="RUB",
        wallet_type="SAVINGS",
        initial_balance="50000"
    )

    # Проверить что все созданы
    wallets = db_session.query(WalletBalance).all()
    assert len(wallets) == 3

    assert wallets[0].wallet_type == "REGULAR"
    assert wallets[0].balance == Decimal("5000")

    assert wallets[1].wallet_type == "CREDIT"
    assert wallets[1].balance == Decimal("-10000")

    assert wallets[2].wallet_type == "SAVINGS"
    assert wallets[2].balance == Decimal("50000")
