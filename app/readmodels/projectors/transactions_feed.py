"""
TransactionsFeedProjector - builds transactions_feed read model from events
"""
from decimal import Decimal
from datetime import datetime

from app.readmodels.projectors.base import BaseProjector
from app.infrastructure.db.models import TransactionFeed, EventLog


class TransactionsFeedProjector(BaseProjector):
    """
    Builds transactions_feed read model from events

    Обрабатывает события:
    - transaction_created: добавить транзакцию в ленту
    """

    def __init__(self, db):
        super().__init__(db, projector_name="transactions_feed")

    def handle_event(self, event: EventLog) -> None:
        if event.event_type == "transaction_created":
            self._handle_transaction_created(event)
        elif event.event_type == "transaction_updated":
            self._handle_transaction_updated(event)

    def _handle_transaction_updated(self, event: EventLog) -> None:
        """Обновить транзакцию в ленте"""
        payload = event.payload_json
        tx = self.db.query(TransactionFeed).filter(
            TransactionFeed.transaction_id == payload["transaction_id"]
        ).first()
        if not tx:
            return

        if "amount" in payload:
            tx.amount = Decimal(payload["amount"])
        if "wallet_id" in payload:
            tx.wallet_id = payload["wallet_id"]
        if "from_wallet_id" in payload:
            tx.from_wallet_id = payload["from_wallet_id"]
        if "to_wallet_id" in payload:
            tx.to_wallet_id = payload["to_wallet_id"]
        if "category_id" in payload:
            tx.category_id = payload["category_id"]
        if "description" in payload:
            tx.description = payload["description"]
        if "occurred_at" in payload:
            tx.occurred_at = datetime.fromisoformat(payload["occurred_at"])
        if "from_goal_id" in payload:
            tx.from_goal_id = payload["from_goal_id"]
        if "to_goal_id" in payload:
            tx.to_goal_id = payload["to_goal_id"]

    def _handle_transaction_created(self, event: EventLog) -> None:
        """Добавить транзакцию в ленту"""
        payload = event.payload_json

        # Идемпотентность
        existing = self.db.query(TransactionFeed).filter(
            TransactionFeed.transaction_id == payload["transaction_id"]
        ).first()

        if existing:
            return

        transaction = TransactionFeed(
            transaction_id=payload["transaction_id"],
            account_id=payload["account_id"],
            operation_type=payload["operation_type"],
            amount=Decimal(payload["amount"]),
            currency=payload["currency"],
            wallet_id=payload.get("wallet_id"),
            category_id=payload.get("category_id"),
            from_wallet_id=payload.get("from_wallet_id"),
            to_wallet_id=payload.get("to_wallet_id"),
            from_goal_id=payload.get("from_goal_id"),
            to_goal_id=payload.get("to_goal_id"),
            description=payload.get("description", ""),
            occurred_at=datetime.fromisoformat(payload["occurred_at"])
        )
        self.db.add(transaction)

    def reset(self, account_id: int) -> None:
        """Удалить все транзакции для аккаунта"""
        self.db.query(TransactionFeed).filter(
            TransactionFeed.account_id == account_id
        ).delete()
        super().reset(account_id)
