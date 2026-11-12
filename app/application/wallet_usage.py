"""
Как часто кошельком реально пользуются — для сортировки в пикерах операций.

Считается на лету по transactions_feed, а не хранится в read-model: окно
скользящее, поэтому счётчик в колонке пришлось бы ещё и уменьшать при
«выпадении» старых операций. Именно на этом молча сломалось поле
WalletBalance.operations_count_30d — его никто никогда не заполнял, и
сортировка по нему годами была нулевой на всех кошельках.
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.infrastructure.db.models import TransactionFeed

# Три месяца: достаточно, чтобы кошелёк с парой операций в месяц не выпал,
# но редкие разовые кошельки уже не перебивают ежедневные.
DEFAULT_WINDOW_DAYS = 90

# Перевод трогает два кошелька, и оба считаются использованными.
_WALLET_COLUMNS = (
    TransactionFeed.wallet_id,
    TransactionFeed.from_wallet_id,
    TransactionFeed.to_wallet_id,
)


def wallet_usage_counts(
    db: Session,
    account_id: int,
    days: int = DEFAULT_WINDOW_DAYS,
) -> dict[int, int]:
    """wallet_id -> число операций за последние `days` дней."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    counts: dict[int, int] = {}

    for column in _WALLET_COLUMNS:
        rows = (
            db.query(column, func.count())
            .filter(
                TransactionFeed.account_id == account_id,
                TransactionFeed.occurred_at >= cutoff,
                column.isnot(None),
            )
            .group_by(column)
            .all()
        )
        for wallet_id, n in rows:
            if wallet_id is None:
                continue
            counts[wallet_id] = counts.get(wallet_id, 0) + int(n)

    return counts
