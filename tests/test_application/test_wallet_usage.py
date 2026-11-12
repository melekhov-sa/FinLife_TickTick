"""
Частота использования кошельков для сортировки в пикерах.

Регрессия, которую эти тесты держат: раньше сортировка опиралась на колонку
WalletBalance.operations_count_30d, которую никто никогда не заполнял. Сортировка
по нулям — это отсутствие сортировки, и заметить это было нельзя. Поэтому здесь
проверяется именно непустой, различающийся результат.
"""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.application.wallet_usage import DEFAULT_WINDOW_DAYS, wallet_usage_counts
from app.infrastructure.db.models import TransactionFeed

ACCT = 1
OTHER_ACCT = 2

_next_id = iter(range(9000, 9999))


def _tx(db, account_id=ACCT, *, days_ago=1, op_type="EXPENSE",
        wallet_id=None, from_wallet_id=None, to_wallet_id=None):
    db.add(TransactionFeed(
        transaction_id=next(_next_id),
        account_id=account_id,
        operation_type=op_type,
        amount=Decimal("100"),
        currency="RUB",
        description="test",
        occurred_at=datetime.now(timezone.utc) - timedelta(days=days_ago),
        wallet_id=wallet_id,
        from_wallet_id=from_wallet_id,
        to_wallet_id=to_wallet_id,
    ))
    db.flush()


@pytest.mark.unit
def test_counts_operations_per_wallet(db_session):
    for _ in range(5):
        _tx(db_session, wallet_id=10)
    _tx(db_session, wallet_id=20)

    counts = wallet_usage_counts(db_session, ACCT)

    assert counts == {10: 5, 20: 1}
    # Порядок по этим числам действительно различает кошельки
    assert sorted(counts, key=lambda w: -counts[w]) == [10, 20]


@pytest.mark.unit
def test_transfer_counts_for_both_wallets(db_session):
    _tx(db_session, op_type="TRANSFER", from_wallet_id=10, to_wallet_id=20)

    counts = wallet_usage_counts(db_session, ACCT)

    assert counts == {10: 1, 20: 1}


@pytest.mark.unit
def test_window_excludes_older_operations(db_session):
    _tx(db_session, wallet_id=10, days_ago=DEFAULT_WINDOW_DAYS + 5)
    _tx(db_session, wallet_id=20, days_ago=DEFAULT_WINDOW_DAYS - 5)

    counts = wallet_usage_counts(db_session, ACCT)

    assert 10 not in counts
    assert counts[20] == 1


@pytest.mark.unit
def test_window_is_configurable(db_session):
    _tx(db_session, wallet_id=10, days_ago=40)

    assert wallet_usage_counts(db_session, ACCT, days=90) == {10: 1}
    assert wallet_usage_counts(db_session, ACCT, days=30) == {}


@pytest.mark.unit
def test_other_accounts_do_not_leak(db_session):
    _tx(db_session, account_id=OTHER_ACCT, wallet_id=10)

    assert wallet_usage_counts(db_session, ACCT) == {}
    assert wallet_usage_counts(db_session, OTHER_ACCT) == {10: 1}


@pytest.mark.unit
def test_no_operations_gives_empty_mapping(db_session):
    # Пикер должен уметь жить с пустым словарём: .get(id, 0) на каждый кошелёк
    assert wallet_usage_counts(db_session, ACCT) == {}
