"""
Tests for multi-currency transfer invariant and wallet currency validation.
"""
import pytest
from decimal import Decimal

from app.application.wallets import CreateWalletUseCase, WalletValidationError
from app.application.transactions import CreateTransactionUseCase, TransactionValidationError
from app.infrastructure.db.models import WalletBalance


# ---------------------------------------------------------------------------
# Currency validation on wallet creation
# ---------------------------------------------------------------------------

def test_wallet_currency_validation_valid(db_session, sample_account_id):
    """3 заглавные буквы — корректный код валюты."""
    uc = CreateWalletUseCase(db_session)
    wid = uc.execute(
        account_id=sample_account_id,
        title="Dollar account",
        currency="USD",
        actor_user_id=sample_account_id,
    )
    wallet = db_session.query(WalletBalance).filter(
        WalletBalance.wallet_id == wid
    ).first()
    assert wallet is not None
    assert wallet.currency == "USD"


def test_wallet_currency_validation_rub(db_session, sample_account_id):
    """RUB — стандартная валюта."""
    uc = CreateWalletUseCase(db_session)
    wid = uc.execute(
        account_id=sample_account_id,
        title="Рублёвый",
        currency="RUB",
        actor_user_id=sample_account_id,
    )
    wallet = db_session.query(WalletBalance).filter(
        WalletBalance.wallet_id == wid
    ).first()
    assert wallet.currency == "RUB"


def test_wallet_currency_validation_lowercase_rejected(db_session, sample_account_id):
    """Строчные буквы — ошибка."""
    uc = CreateWalletUseCase(db_session)
    with pytest.raises(WalletValidationError, match="Неверный код валюты"):
        uc.execute(
            account_id=sample_account_id,
            title="bad",
            currency="rub",
            actor_user_id=sample_account_id,
        )


def test_wallet_currency_validation_too_short(db_session, sample_account_id):
    """Меньше 3 букв — ошибка."""
    uc = CreateWalletUseCase(db_session)
    with pytest.raises(WalletValidationError, match="Неверный код валюты"):
        uc.execute(
            account_id=sample_account_id,
            title="bad",
            currency="US",
            actor_user_id=sample_account_id,
        )


def test_wallet_currency_validation_too_long(db_session, sample_account_id):
    """Больше 3 букв — ошибка."""
    uc = CreateWalletUseCase(db_session)
    with pytest.raises(WalletValidationError, match="Неверный код валюты"):
        uc.execute(
            account_id=sample_account_id,
            title="bad",
            currency="USDT",
            actor_user_id=sample_account_id,
        )


# ---------------------------------------------------------------------------
# Transfer between same currency — OK
# ---------------------------------------------------------------------------

def _create_wallet(db_session, account_id, title, currency, balance="1000"):
    return CreateWalletUseCase(db_session).execute(
        account_id=account_id,
        title=title,
        currency=currency,
        initial_balance=balance,
        actor_user_id=account_id,
    )


def test_transfer_same_currency_ok(db_session, sample_account_id):
    """Перевод RUB→RUB — разрешён."""
    w1 = _create_wallet(db_session, sample_account_id, "Наличные", "RUB", "5000")
    w2 = _create_wallet(db_session, sample_account_id, "Карта", "RUB", "3000")

    tx_uc = CreateTransactionUseCase(db_session)
    tx_id = tx_uc.execute_transfer(
        account_id=sample_account_id,
        from_wallet_id=w1,
        to_wallet_id=w2,
        amount=Decimal("1000"),
        currency="RUB",
        description="Перевод",
        actor_user_id=sample_account_id,
    )
    assert tx_id > 0

    from_w = db_session.query(WalletBalance).filter(WalletBalance.wallet_id == w1).first()
    to_w = db_session.query(WalletBalance).filter(WalletBalance.wallet_id == w2).first()
    assert from_w.balance == Decimal("4000")
    assert to_w.balance == Decimal("4000")


# ---------------------------------------------------------------------------
# Transfer between different currencies — BLOCKED
# ---------------------------------------------------------------------------

def test_transfer_different_currency_blocked(db_session, sample_account_id):
    """Перевод RUB→USD — запрещён с правильным текстом ошибки."""
    w_rub = _create_wallet(db_session, sample_account_id, "Рубли", "RUB", "5000")
    w_usd = _create_wallet(db_session, sample_account_id, "Доллары", "USD", "100")

    tx_uc = CreateTransactionUseCase(db_session)
    with pytest.raises(
        TransactionValidationError,
        match="Перевод между кошельками в разных валютах пока не поддерживается",
    ):
        tx_uc.execute_transfer(
            account_id=sample_account_id,
            from_wallet_id=w_rub,
            to_wallet_id=w_usd,
            amount=Decimal("1000"),
            currency="RUB",
            description="Конвертация",
            actor_user_id=sample_account_id,
        )
