"""
Transaction use cases - business logic for transaction operations
"""
from datetime import datetime
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.infrastructure.eventlog.repository import EventLogRepository
from app.infrastructure.db.models import TransactionFeed, WalletBalance
from app.domain.transaction import Transaction
from app.domain.wallet import WALLET_TYPE_SAVINGS
from app.readmodels.projectors.wallet_balances import WalletBalancesProjector
from app.readmodels.projectors.transactions_feed import TransactionsFeedProjector


class TransactionValidationError(ValueError):
    """Ошибка валидации транзакции"""
    pass


class CreateTransactionUseCase:
    """
    Use case: Создать транзакцию (INCOME/EXPENSE/TRANSFER)

    Три метода для разных типов операций
    """

    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute_income(
        self,
        account_id: int,
        wallet_id: int,
        amount: Decimal,
        currency: str,
        category_id: int | None,
        description: str,
        occurred_at: datetime | None = None,
        actor_user_id: int | None = None
    ) -> int:
        """
        Создать INCOME (доход)

        Args:
            account_id: ID аккаунта
            wallet_id: ID кошелька для зачисления
            amount: Сумма
            currency: Валюта
            category_id: ID категории (опционально)
            description: Описание операции
            occurred_at: Дата операции (default=now)
            actor_user_id: Кто создал

        Returns:
            transaction_id: ID созданной транзакции
        """
        # Валидация суммы
        if amount <= 0:
            raise TransactionValidationError("Сумма операции должна быть больше нуля")

        # Проверить существование и статус кошелька
        wallet = self.db.query(WalletBalance).filter(
            WalletBalance.wallet_id == wallet_id,
            WalletBalance.account_id == account_id
        ).first()

        if not wallet:
            raise TransactionValidationError(f"Кошелёк #{wallet_id} не найден")

        if wallet.is_archived:
            raise TransactionValidationError("Нельзя создавать операции с архивированным кошельком")

        transaction_id = self._generate_transaction_id()
        occurred_at = occurred_at or datetime.utcnow()

        event_payload = Transaction.create_income(
            account_id=account_id,
            transaction_id=transaction_id,
            wallet_id=wallet_id,
            amount=amount,
            currency=currency,
            category_id=category_id,
            description=description,
            occurred_at=occurred_at
        )

        self.event_repo.append_event(
            account_id=account_id,
            event_type="transaction_created",
            payload=event_payload,
            occurred_at=occurred_at,
            actor_user_id=actor_user_id,
            idempotency_key=f"transaction-{transaction_id}"
        )

        self.db.commit()
        self._run_projectors(account_id)

        return transaction_id

    def execute_expense(
        self,
        account_id: int,
        wallet_id: int,
        amount: Decimal,
        currency: str,
        category_id: int | None,
        description: str,
        occurred_at: datetime | None = None,
        actor_user_id: int | None = None
    ) -> int:
        """
        Создать EXPENSE (расход)

        Args:
            account_id: ID аккаунта
            wallet_id: ID кошелька для списания
            amount: Сумма
            currency: Валюта
            category_id: ID категории (опционально)
            description: Описание операции
            occurred_at: Дата операции (default=now)
            actor_user_id: Кто создал

        Returns:
            transaction_id: ID созданной транзакции
        """
        # Валидация суммы
        if amount <= 0:
            raise TransactionValidationError("Сумма операции должна быть больше нуля")

        # Проверить существование и статус кошелька
        wallet = self.db.query(WalletBalance).filter(
            WalletBalance.wallet_id == wallet_id,
            WalletBalance.account_id == account_id
        ).first()

        if not wallet:
            raise TransactionValidationError(f"Кошелёк #{wallet_id} не найден")

        if wallet.is_archived:
            raise TransactionValidationError("Нельзя создавать операции с архивированным кошельком")

        # КРИТИЧЕСКОЕ ПРАВИЛО: Расходы из SAVINGS запрещены
        if wallet.wallet_type == WALLET_TYPE_SAVINGS:
            raise TransactionValidationError(
                "Расходы из накопительного кошелька запрещены. "
                "Используйте перевод (TRANSFER) для вывода средств."
            )

        transaction_id = self._generate_transaction_id()
        occurred_at = occurred_at or datetime.utcnow()

        event_payload = Transaction.create_expense(
            account_id=account_id,
            transaction_id=transaction_id,
            wallet_id=wallet_id,
            amount=amount,
            currency=currency,
            category_id=category_id,
            description=description,
            occurred_at=occurred_at
        )

        self.event_repo.append_event(
            account_id=account_id,
            event_type="transaction_created",
            payload=event_payload,
            occurred_at=occurred_at,
            actor_user_id=actor_user_id,
            idempotency_key=f"transaction-{transaction_id}"
        )

        self.db.commit()
        self._run_projectors(account_id)

        return transaction_id

    def execute_transfer(
        self,
        account_id: int,
        from_wallet_id: int,
        to_wallet_id: int,
        amount: Decimal,
        currency: str,
        description: str,
        occurred_at: datetime | None = None,
        actor_user_id: int | None = None
    ) -> int:
        """
        Создать TRANSFER (перевод между кошельками)

        Args:
            account_id: ID аккаунта
            from_wallet_id: ID кошелька-источника
            to_wallet_id: ID кошелька-назначения
            amount: Сумма
            currency: Валюта
            description: Описание операции
            occurred_at: Дата операции (default=now)
            actor_user_id: Кто создал

        Returns:
            transaction_id: ID созданной транзакции
        """
        # Валидация суммы
        if amount <= 0:
            raise TransactionValidationError("Сумма операции должна быть больше нуля")

        # Получить оба кошелька
        from_wallet = self.db.query(WalletBalance).filter(
            WalletBalance.wallet_id == from_wallet_id,
            WalletBalance.account_id == account_id
        ).first()
        to_wallet = self.db.query(WalletBalance).filter(
            WalletBalance.wallet_id == to_wallet_id,
            WalletBalance.account_id == account_id
        ).first()

        if not from_wallet:
            raise TransactionValidationError(f"Кошелёк-источник #{from_wallet_id} не найден")
        if not to_wallet:
            raise TransactionValidationError(f"Кошелёк-получатель #{to_wallet_id} не найден")

        # Проверка архивирования
        if from_wallet.is_archived or to_wallet.is_archived:
            raise TransactionValidationError("Нельзя создавать операции с архивированным кошельком")

        # Проверка валюты
        if from_wallet.currency != to_wallet.currency:
            raise TransactionValidationError(
                f"Перевод между разными валютами запрещён: "
                f"{from_wallet.currency} → {to_wallet.currency}"
            )

        transaction_id = self._generate_transaction_id()
        occurred_at = occurred_at or datetime.utcnow()

        event_payload = Transaction.create_transfer(
            account_id=account_id,
            transaction_id=transaction_id,
            from_wallet_id=from_wallet_id,
            to_wallet_id=to_wallet_id,
            amount=amount,
            currency=currency,
            description=description,
            occurred_at=occurred_at
        )

        self.event_repo.append_event(
            account_id=account_id,
            event_type="transaction_created",
            payload=event_payload,
            occurred_at=occurred_at,
            actor_user_id=actor_user_id,
            idempotency_key=f"transaction-{transaction_id}"
        )

        self.db.commit()
        self._run_projectors(account_id)

        return transaction_id

    def _generate_transaction_id(self) -> int:
        max_id = self.db.query(func.max(TransactionFeed.transaction_id)).scalar() or 0
        return max_id + 1

    def _run_projectors(self, account_id: int):
        """Запустить оба projector'а: балансы + лента"""
        WalletBalancesProjector(self.db).run(
            account_id,
            event_types=["transaction_created"]
        )
        TransactionsFeedProjector(self.db).run(
            account_id,
            event_types=["transaction_created"]
        )
