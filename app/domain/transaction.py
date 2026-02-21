"""
Transaction domain entity - generates events for transaction operations
"""
from datetime import datetime
from decimal import Decimal
from dataclasses import dataclass
from typing import Dict, Any, Optional


@dataclass
class Transaction:
    """
    Transaction domain entity (Event Sourcing)

    Transaction не персистится напрямую - генерирует события для event_log.
    Read model (TransactionFeed) строится projector'ом из событий.

    Операции:
    - INCOME: доход в кошелёк
    - EXPENSE: расход из кошелька
    - TRANSFER: перевод между кошельками
    """
    id: int
    account_id: int
    operation_type: str  # INCOME, EXPENSE, TRANSFER
    amount: Decimal
    currency: str
    wallet_id: Optional[int]  # For INCOME/EXPENSE
    from_wallet_id: Optional[int]  # For TRANSFER
    to_wallet_id: Optional[int]  # For TRANSFER
    category_id: Optional[int]
    description: str
    occurred_at: datetime

    @staticmethod
    def create_income(
        account_id: int,
        transaction_id: int,
        wallet_id: int,
        amount: Decimal,
        currency: str,
        category_id: Optional[int],
        description: str,
        occurred_at: datetime
    ) -> Dict[str, Any]:
        """
        Создать событие transaction_created (INCOME)

        Args:
            account_id: ID аккаунта
            transaction_id: ID транзакции
            wallet_id: ID кошелька для зачисления
            amount: Сумма
            currency: Валюта
            category_id: ID категории (опционально)
            description: Описание
            occurred_at: Дата операции

        Returns:
            Event payload для сохранения в event_log
        """
        return {
            "transaction_id": transaction_id,
            "account_id": account_id,
            "operation_type": "INCOME",
            "wallet_id": wallet_id,
            "amount": str(amount),
            "currency": currency,
            "category_id": category_id,
            "description": description,
            "occurred_at": occurred_at.isoformat()
        }

    @staticmethod
    def create_expense(
        account_id: int,
        transaction_id: int,
        wallet_id: int,
        amount: Decimal,
        currency: str,
        category_id: Optional[int],
        description: str,
        occurred_at: datetime
    ) -> Dict[str, Any]:
        """
        Создать событие transaction_created (EXPENSE)

        Args:
            account_id: ID аккаунта
            transaction_id: ID транзакции
            wallet_id: ID кошелька для списания
            amount: Сумма
            currency: Валюта
            category_id: ID категории (опционально)
            description: Описание
            occurred_at: Дата операции

        Returns:
            Event payload для сохранения в event_log
        """
        return {
            "transaction_id": transaction_id,
            "account_id": account_id,
            "operation_type": "EXPENSE",
            "wallet_id": wallet_id,
            "amount": str(amount),
            "currency": currency,
            "category_id": category_id,
            "description": description,
            "occurred_at": occurred_at.isoformat()
        }

    @staticmethod
    def create_transfer(
        account_id: int,
        transaction_id: int,
        from_wallet_id: int,
        to_wallet_id: int,
        amount: Decimal,
        currency: str,
        description: str,
        occurred_at: datetime,
        from_goal_id: Optional[int] = None,
        to_goal_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Создать событие transaction_created (TRANSFER)

        Args:
            account_id: ID аккаунта
            transaction_id: ID транзакции
            from_wallet_id: ID кошелька-источника
            to_wallet_id: ID кошелька-назначения
            amount: Сумма
            currency: Валюта
            description: Описание
            occurred_at: Дата операции
            from_goal_id: ID цели-источника (обязательно если from_wallet — SAVINGS)
            to_goal_id: ID цели-назначения (обязательно если to_wallet — SAVINGS)

        Returns:
            Event payload для сохранения в event_log
        """
        payload = {
            "transaction_id": transaction_id,
            "account_id": account_id,
            "operation_type": "TRANSFER",
            "from_wallet_id": from_wallet_id,
            "to_wallet_id": to_wallet_id,
            "amount": str(amount),
            "currency": currency,
            "description": description,
            "occurred_at": occurred_at.isoformat()
        }
        if from_goal_id is not None:
            payload["from_goal_id"] = from_goal_id
        if to_goal_id is not None:
            payload["to_goal_id"] = to_goal_id
        return payload

    @staticmethod
    def update(
        transaction_id: int,
        account_id: int,
        old_snapshot: Dict[str, Any],
        **changes: Any,
    ) -> Dict[str, Any]:
        """
        Generate transaction_updated event payload.

        old_snapshot contains the current financial state so projectors
        can reverse old balance impacts and apply new ones.
        """
        payload: Dict[str, Any] = {
            "transaction_id": transaction_id,
            "account_id": account_id,
            "updated_at": datetime.utcnow().isoformat(),
            # Old values for balance reversal by projectors
            "old_operation_type": old_snapshot["operation_type"],
            "old_amount": old_snapshot["amount"],
            "old_wallet_id": old_snapshot.get("wallet_id"),
            "old_from_wallet_id": old_snapshot.get("from_wallet_id"),
            "old_to_wallet_id": old_snapshot.get("to_wallet_id"),
            "old_from_goal_id": old_snapshot.get("from_goal_id"),
            "old_to_goal_id": old_snapshot.get("to_goal_id"),
            # Carry over operation_type and currency (not editable)
            "operation_type": old_snapshot["operation_type"],
            "currency": old_snapshot["currency"],
        }

        allowed = (
            "amount", "wallet_id", "from_wallet_id", "to_wallet_id",
            "category_id", "description", "occurred_at",
            "from_goal_id", "to_goal_id",
        )
        for key in allowed:
            if key in changes:
                val = changes[key]
                if isinstance(val, datetime):
                    payload[key] = val.isoformat()
                elif isinstance(val, Decimal):
                    payload[key] = str(val)
                else:
                    payload[key] = val

        return payload
