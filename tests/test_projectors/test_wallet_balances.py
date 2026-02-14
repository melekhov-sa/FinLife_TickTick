"""
Tests for WalletBalancesProjector
"""
import pytest
from decimal import Decimal
from datetime import datetime
from app.readmodels.projectors.wallet_balances import WalletBalancesProjector
from app.infrastructure.db.models import EventLog, WalletBalance


def test_projector_handles_wallet_created_with_wallet_type(db_session, sample_account_id):
    """Projector обрабатывает wallet_created с типом кошелька"""
    # Создать событие
    event = EventLog(
        id=1,
        account_id=sample_account_id,
        event_type="wallet_created",
        payload_json={
            "wallet_id": 100,
            "account_id": sample_account_id,
            "title": "Кредитная карта",
            "currency": "RUB",
            "wallet_type": "CREDIT",
            "initial_balance": "-5000",
            "created_at": datetime.utcnow().isoformat()
        },
        occurred_at=datetime.utcnow()
    )
    db_session.add(event)
    db_session.commit()

    # Запустить projector
    projector = WalletBalancesProjector(db_session)
    count = projector.run(sample_account_id)

    assert count == 1

    # Проверить read model
    wallet = db_session.query(WalletBalance).filter(
        WalletBalance.wallet_id == 100
    ).first()

    assert wallet is not None
    assert wallet.wallet_type == "CREDIT"
    assert wallet.balance == Decimal("-5000")
    assert wallet.title == "Кредитная карта"


def test_projector_handles_wallet_created_without_wallet_type(db_session, sample_account_id):
    """Projector использует дефолтный тип если не указан"""
    # Создать событие БЕЗ wallet_type (старый формат)
    event = EventLog(
        id=1,
        account_id=sample_account_id,
        event_type="wallet_created",
        payload_json={
            "wallet_id": 101,
            "account_id": sample_account_id,
            "title": "Старый кошелек",
            "currency": "RUB",
            "created_at": datetime.utcnow().isoformat()
        },
        occurred_at=datetime.utcnow()
    )
    db_session.add(event)
    db_session.commit()

    # Запустить projector
    projector = WalletBalancesProjector(db_session)
    projector.run(sample_account_id)

    # Проверить что используется дефолтный тип
    wallet = db_session.query(WalletBalance).filter(
        WalletBalance.wallet_id == 101
    ).first()

    assert wallet.wallet_type == "REGULAR"
    assert wallet.balance == Decimal("0")


def test_projector_idempotence_wallet_created(db_session, sample_account_id):
    """Projector идемпотентен - повторная обработка не дублирует"""
    event = EventLog(
        id=1,
        account_id=sample_account_id,
        event_type="wallet_created",
        payload_json={
            "wallet_id": 102,
            "account_id": sample_account_id,
            "title": "Тест",
            "currency": "RUB",
            "wallet_type": "REGULAR",
            "initial_balance": "1000",
            "created_at": datetime.utcnow().isoformat()
        },
        occurred_at=datetime.utcnow()
    )
    db_session.add(event)
    db_session.commit()

    projector = WalletBalancesProjector(db_session)

    # Первый запуск
    projector.run(sample_account_id)
    wallets_count_1 = db_session.query(WalletBalance).count()

    # Второй запуск (с тем же checkpoint)
    projector.reset(sample_account_id)
    projector.run(sample_account_id)
    wallets_count_2 = db_session.query(WalletBalance).count()

    # Должно остаться одно
    assert wallets_count_1 == 1
    assert wallets_count_2 == 1


def test_projector_handles_multiple_wallet_types(db_session, sample_account_id):
    """Projector обрабатывает несколько кошельков разных типов"""
    # Создать 3 события
    events = [
        EventLog(
            id=1,
            account_id=sample_account_id,
            event_type="wallet_created",
            payload_json={
                "wallet_id": 100,
                "account_id": sample_account_id,
                "title": "Обычный",
                "currency": "RUB",
                "wallet_type": "REGULAR",
                "initial_balance": "1000",
                "created_at": datetime.utcnow().isoformat()
            },
            occurred_at=datetime.utcnow()
        ),
        EventLog(
            id=2,
            account_id=sample_account_id,
            event_type="wallet_created",
            payload_json={
                "wallet_id": 101,
                "account_id": sample_account_id,
                "title": "Кредит",
                "currency": "RUB",
                "wallet_type": "CREDIT",
                "initial_balance": "-5000",
                "created_at": datetime.utcnow().isoformat()
            },
            occurred_at=datetime.utcnow()
        ),
        EventLog(
            id=3,
            account_id=sample_account_id,
            event_type="wallet_created",
            payload_json={
                "wallet_id": 102,
                "account_id": sample_account_id,
                "title": "Накопления",
                "currency": "RUB",
                "wallet_type": "SAVINGS",
                "initial_balance": "50000",
                "created_at": datetime.utcnow().isoformat()
            },
            occurred_at=datetime.utcnow()
        )
    ]

    for event in events:
        db_session.add(event)
    db_session.commit()

    # Запустить projector
    projector = WalletBalancesProjector(db_session)
    count = projector.run(sample_account_id)

    assert count == 3

    # Проверить все кошельки
    wallets = db_session.query(WalletBalance).order_by(WalletBalance.wallet_id).all()
    assert len(wallets) == 3

    assert wallets[0].wallet_type == "REGULAR"
    assert wallets[0].balance == Decimal("1000")

    assert wallets[1].wallet_type == "CREDIT"
    assert wallets[1].balance == Decimal("-5000")

    assert wallets[2].wallet_type == "SAVINGS"
    assert wallets[2].balance == Decimal("50000")
