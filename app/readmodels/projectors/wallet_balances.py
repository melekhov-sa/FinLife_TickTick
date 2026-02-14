"""
WalletBalancesProjector - builds wallet_balances read model from events
"""
from decimal import Decimal
from datetime import datetime

from app.readmodels.projectors.base import BaseProjector
from app.infrastructure.db.models import WalletBalance, EventLog


class WalletBalancesProjector(BaseProjector):
    """
    Builds wallet_balances read model from events

    Обрабатывает события:
    - wallet_created: создать кошелёк с balance=0
    - wallet_archived: пометить кошелёк как архивированный
    - transaction_created: обновить балансы (INCOME/EXPENSE/TRANSFER)
    """

    def __init__(self, db):
        super().__init__(db, projector_name="wallet_balances")

    def handle_event(self, event: EventLog) -> None:
        """Process event and update wallet_balances"""

        if event.event_type == "wallet_created":
            self._handle_wallet_created(event)
        elif event.event_type == "wallet_renamed":
            self._handle_wallet_renamed(event)
        elif event.event_type == "wallet_archived":
            self._handle_wallet_archived(event)
        elif event.event_type == "wallet_unarchived":
            self._handle_wallet_unarchived(event)
        elif event.event_type == "transaction_created":
            self._handle_transaction_created(event)

    def _handle_wallet_created(self, event: EventLog) -> None:
        """Создать новый кошелёк с начальным балансом"""
        payload = event.payload_json

        # Идемпотентность: проверить существование
        # Flush чтобы увидеть объекты, добавленные в этой же транзакции
        self.db.flush()

        existing = self.db.query(WalletBalance).filter(
            WalletBalance.wallet_id == payload["wallet_id"]
        ).first()

        if existing:
            return  # Уже обработано

        wallet = WalletBalance(
            wallet_id=payload["wallet_id"],
            account_id=payload["account_id"],
            title=payload["title"],
            currency=payload["currency"],
            wallet_type=payload.get("wallet_type", "REGULAR"),
            balance=Decimal(payload.get("initial_balance", "0")),
            is_archived=False,
            created_at=datetime.fromisoformat(payload["created_at"])
        )
        self.db.add(wallet)
        # Flush чтобы следующая итерация увидела этот объект
        self.db.flush()

    def _handle_wallet_renamed(self, event: EventLog) -> None:
        """Переименовать кошелёк"""
        payload = event.payload_json

        wallet = self.db.query(WalletBalance).filter(
            WalletBalance.wallet_id == payload["wallet_id"]
        ).first()

        if wallet:
            wallet.title = payload["title"]

    def _handle_wallet_archived(self, event: EventLog) -> None:
        """Пометить кошелёк как архивированный"""
        payload = event.payload_json

        wallet = self.db.query(WalletBalance).filter(
            WalletBalance.wallet_id == payload["wallet_id"]
        ).first()

        if wallet:
            wallet.is_archived = True

    def _handle_wallet_unarchived(self, event: EventLog) -> None:
        """Убрать кошелёк из архива"""
        payload = event.payload_json

        wallet = self.db.query(WalletBalance).filter(
            WalletBalance.wallet_id == payload["wallet_id"]
        ).first()

        if wallet:
            wallet.is_archived = False

    def _handle_transaction_created(self, event: EventLog) -> None:
        """Обновить балансы кошельков согласно операции"""
        payload = event.payload_json
        operation_type = payload["operation_type"]
        amount = Decimal(payload["amount"])

        if operation_type == "INCOME":
            # Увеличить баланс кошелька
            wallet = self.db.query(WalletBalance).filter(
                WalletBalance.wallet_id == payload["wallet_id"]
            ).first()
            if wallet:
                wallet.balance += amount

        elif operation_type == "EXPENSE":
            # Уменьшить баланс кошелька
            wallet = self.db.query(WalletBalance).filter(
                WalletBalance.wallet_id == payload["wallet_id"]
            ).first()
            if wallet:
                wallet.balance -= amount

        elif operation_type == "TRANSFER":
            # Уменьшить баланс from_wallet, увеличить to_wallet
            from_wallet = self.db.query(WalletBalance).filter(
                WalletBalance.wallet_id == payload["from_wallet_id"]
            ).first()
            to_wallet = self.db.query(WalletBalance).filter(
                WalletBalance.wallet_id == payload["to_wallet_id"]
            ).first()

            if from_wallet:
                from_wallet.balance -= amount
            if to_wallet:
                to_wallet.balance += amount

    def reset(self, account_id: int) -> None:
        """Удалить все балансы кошельков для аккаунта"""
        self.db.query(WalletBalance).filter(
            WalletBalance.account_id == account_id
        ).delete()
        super().reset(account_id)
