"""
Tests for Wallet domain entity
"""
from app.domain.wallet import Wallet, WALLET_TYPE_REGULAR, WALLET_TYPE_CREDIT, WALLET_TYPE_SAVINGS


def test_wallet_create_with_default_values():
    """Создание кошелька с дефолтными значениями"""
    payload = Wallet.create(
        account_id=1,
        wallet_id=100,
        title="Тестовый кошелек",
        currency="RUB"
    )

    assert payload["wallet_id"] == 100
    assert payload["account_id"] == 1
    assert payload["title"] == "Тестовый кошелек"
    assert payload["currency"] == "RUB"
    assert payload["wallet_type"] == WALLET_TYPE_REGULAR
    assert payload["initial_balance"] == "0"
    assert "created_at" in payload


def test_wallet_create_regular_type():
    """Создание обычного кошелька"""
    payload = Wallet.create(
        account_id=1,
        wallet_id=101,
        title="Наличные",
        currency="RUB",
        wallet_type=WALLET_TYPE_REGULAR,
        initial_balance="5000"
    )

    assert payload["wallet_type"] == "REGULAR"
    assert payload["initial_balance"] == "5000"


def test_wallet_create_credit_type():
    """Создание кредитного кошелька"""
    payload = Wallet.create(
        account_id=1,
        wallet_id=102,
        title="Кредитка",
        currency="RUB",
        wallet_type=WALLET_TYPE_CREDIT,
        initial_balance="-10000"
    )

    assert payload["wallet_type"] == "CREDIT"
    assert payload["initial_balance"] == "-10000"


def test_wallet_create_savings_type():
    """Создание накопительного кошелька"""
    payload = Wallet.create(
        account_id=1,
        wallet_id=103,
        title="Накопления",
        currency="RUB",
        wallet_type=WALLET_TYPE_SAVINGS,
        initial_balance="50000"
    )

    assert payload["wallet_type"] == "SAVINGS"
    assert payload["initial_balance"] == "50000"


def test_wallet_archive():
    """Архивирование кошелька"""
    payload = Wallet.archive(wallet_id=100)

    assert payload["wallet_id"] == 100
    assert "archived_at" in payload
