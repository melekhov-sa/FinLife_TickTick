"""
Transaction use cases - business logic for transaction operations
"""
from datetime import datetime, timezone, timedelta
from decimal import Decimal

MSK = timezone(timedelta(hours=3))
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.infrastructure.eventlog.repository import EventLogRepository
from app.infrastructure.db.models import TransactionFeed, WalletBalance, GoalInfo, GoalWalletBalance, CategoryInfo
from app.domain.transaction import Transaction
from app.domain.wallet import WALLET_TYPE_SAVINGS, WALLET_TYPE_REGULAR
from app.readmodels.projectors.wallet_balances import WalletBalancesProjector
from app.readmodels.projectors.transactions_feed import TransactionsFeedProjector
from app.readmodels.projectors.goal_wallet_balances import GoalWalletBalancesProjector
from app.readmodels.projectors.xp import XpProjector
from app.readmodels.projectors.activity import ActivityProjector


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
        occurred_at = occurred_at or datetime.now(MSK)

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
        occurred_at = occurred_at or datetime.now(MSK)

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
        actor_user_id: int | None = None,
        from_goal_id: int | None = None,
        to_goal_id: int | None = None
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
            from_goal_id: ID цели-источника (обязательно если from_wallet — SAVINGS)
            to_goal_id: ID цели-назначения (обязательно если to_wallet — SAVINGS)

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
                "Перевод между кошельками в разных валютах пока не поддерживается."
            )

        # --- SAVINGS goal validation ---
        from_is_savings = from_wallet.wallet_type == WALLET_TYPE_SAVINGS
        to_is_savings = to_wallet.wallet_type == WALLET_TYPE_SAVINGS

        if from_is_savings and from_goal_id is None:
            raise TransactionValidationError(
                "Для вывода из накопительного кошелька необходимо указать цель (from_goal_id)"
            )
        if to_is_savings and to_goal_id is None:
            raise TransactionValidationError(
                "Для пополнения накопительного кошелька необходимо указать цель (to_goal_id)"
            )

        # Validate from_goal
        if from_goal_id is not None:
            if not from_is_savings:
                raise TransactionValidationError(
                    "from_goal_id можно указать только для накопительного кошелька"
                )
            from_goal = self.db.query(GoalInfo).filter(
                GoalInfo.goal_id == from_goal_id,
                GoalInfo.account_id == account_id
            ).first()
            if not from_goal:
                raise TransactionValidationError(f"Цель #{from_goal_id} не найдена")
            if from_goal.is_archived:
                raise TransactionValidationError(f"Цель «{from_goal.title}» архивирована")
            if from_goal.currency != from_wallet.currency:
                raise TransactionValidationError(
                    f"Валюта цели ({from_goal.currency}) не совпадает с валютой кошелька ({from_wallet.currency})"
                )
            # Check sufficient goal balance
            gwb = self.db.query(GoalWalletBalance).filter(
                GoalWalletBalance.goal_id == from_goal_id,
                GoalWalletBalance.wallet_id == from_wallet_id
            ).first()
            goal_balance = gwb.amount if gwb else Decimal("0")
            if goal_balance < amount:
                raise TransactionValidationError(
                    f"Недостаточно средств в цели «{from_goal.title}»: "
                    f"доступно {goal_balance}, запрошено {amount}"
                )

        # Validate to_goal
        if to_goal_id is not None:
            if not to_is_savings:
                raise TransactionValidationError(
                    "to_goal_id можно указать только для накопительного кошелька"
                )
            to_goal = self.db.query(GoalInfo).filter(
                GoalInfo.goal_id == to_goal_id,
                GoalInfo.account_id == account_id
            ).first()
            if not to_goal:
                raise TransactionValidationError(f"Цель #{to_goal_id} не найдена")
            if to_goal.is_archived:
                raise TransactionValidationError(f"Цель «{to_goal.title}» архивирована")
            if to_goal.currency != to_wallet.currency:
                raise TransactionValidationError(
                    f"Валюта цели ({to_goal.currency}) не совпадает с валютой кошелька ({to_wallet.currency})"
                )

        transaction_id = self._generate_transaction_id()
        occurred_at = occurred_at or datetime.now(MSK)

        event_payload = Transaction.create_transfer(
            account_id=account_id,
            transaction_id=transaction_id,
            from_wallet_id=from_wallet_id,
            to_wallet_id=to_wallet_id,
            amount=amount,
            currency=currency,
            description=description,
            occurred_at=occurred_at,
            from_goal_id=from_goal_id,
            to_goal_id=to_goal_id
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

    def actualize_balance(
        self,
        account_id: int,
        wallet_id: int,
        target_balance: Decimal,
        actor_user_id: int | None = None,
    ) -> dict:
        """
        Актуализировать баланс кошелька: создать INCOME/EXPENSE на разницу.

        Returns:
            {"action": "income"|"expense"|"none", "delta": Decimal, "transaction_id": int|None}
        """
        wallet = self.db.query(WalletBalance).filter(
            WalletBalance.wallet_id == wallet_id,
            WalletBalance.account_id == account_id,
        ).first()

        if not wallet:
            raise TransactionValidationError(f"Кошелёк #{wallet_id} не найден")
        if wallet.is_archived:
            raise TransactionValidationError("Нельзя актуализировать архивированный кошелёк")
        if wallet.wallet_type != WALLET_TYPE_REGULAR:
            raise TransactionValidationError(
                "Актуализация баланса доступна только для обычных кошельков"
            )

        delta = target_balance - wallet.balance
        if delta == 0:
            return {"action": "none", "delta": Decimal(0), "transaction_id": None}

        # Find system category
        if delta > 0:
            cat_type, cat_title = "INCOME", "Прочие доходы"
        else:
            cat_type, cat_title = "EXPENSE", "Прочие расходы"

        category = self.db.query(CategoryInfo).filter(
            CategoryInfo.account_id == account_id,
            CategoryInfo.is_system == True,
            CategoryInfo.category_type == cat_type,
            CategoryInfo.title == cat_title,
        ).first()
        category_id = category.category_id if category else None

        if delta > 0:
            tx_id = self.execute_income(
                account_id, wallet_id, delta, wallet.currency,
                category_id, "Актуализация баланса",
                actor_user_id=actor_user_id,
            )
            return {"action": "income", "delta": delta, "transaction_id": tx_id}
        else:
            tx_id = self.execute_expense(
                account_id, wallet_id, abs(delta), wallet.currency,
                category_id, "Актуализация баланса",
                actor_user_id=actor_user_id,
            )
            return {"action": "expense", "delta": abs(delta), "transaction_id": tx_id}

    def _generate_transaction_id(self) -> int:
        max_id = self.db.query(func.max(TransactionFeed.transaction_id)).scalar() or 0
        return max_id + 1

    def _run_projectors(self, account_id: int):
        """Запустить projector'ы: балансы + лента + цели"""
        _TX_EVENTS = ["transaction_created", "transaction_updated"]
        WalletBalancesProjector(self.db).run(
            account_id,
            event_types=_TX_EVENTS,
        )
        TransactionsFeedProjector(self.db).run(
            account_id,
            event_types=_TX_EVENTS,
        )
        GoalWalletBalancesProjector(self.db).run(
            account_id,
            event_types=_TX_EVENTS + ["wallet_created"],
        )
        XpProjector(self.db).run(
            account_id,
            event_types=["transaction_created"],
        )
        ActivityProjector(self.db).run(
            account_id,
            event_types=["transaction_created"],
        )


class UpdateTransactionUseCase:
    """Use case: Изменить существующую операцию (кошелёк, сумму, категорию, описание, дату)."""

    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(
        self,
        transaction_id: int,
        account_id: int,
        actor_user_id: int | None = None,
        **changes,
    ) -> None:
        tx = self.db.query(TransactionFeed).filter(
            TransactionFeed.transaction_id == transaction_id,
            TransactionFeed.account_id == account_id,
        ).first()
        if not tx:
            raise TransactionValidationError("Операция не найдена")

        op_type = tx.operation_type

        # --- Validate new wallet ---
        if op_type in ("INCOME", "EXPENSE"):
            new_wallet_id = changes.get("wallet_id", tx.wallet_id)
            wallet = self.db.query(WalletBalance).filter(
                WalletBalance.wallet_id == new_wallet_id,
                WalletBalance.account_id == account_id,
            ).first()
            if not wallet:
                raise TransactionValidationError(f"Кошелёк #{new_wallet_id} не найден")
            if wallet.is_archived:
                raise TransactionValidationError("Нельзя использовать архивированный кошелёк")
            if op_type == "EXPENSE" and wallet.wallet_type == WALLET_TYPE_SAVINGS:
                raise TransactionValidationError(
                    "Расходы из накопительного кошелька запрещены"
                )
            # Ensure currency stays the same
            if wallet.currency != tx.currency:
                raise TransactionValidationError(
                    f"Валюта кошелька ({wallet.currency}) не совпадает с валютой операции ({tx.currency})"
                )

        elif op_type == "TRANSFER":
            new_from = changes.get("from_wallet_id", tx.from_wallet_id)
            new_to = changes.get("to_wallet_id", tx.to_wallet_id)
            fw = self.db.query(WalletBalance).filter(
                WalletBalance.wallet_id == new_from, WalletBalance.account_id == account_id,
            ).first()
            tw = self.db.query(WalletBalance).filter(
                WalletBalance.wallet_id == new_to, WalletBalance.account_id == account_id,
            ).first()
            if not fw:
                raise TransactionValidationError(f"Кошелёк-источник #{new_from} не найден")
            if not tw:
                raise TransactionValidationError(f"Кошелёк-получатель #{new_to} не найден")
            if fw.is_archived or tw.is_archived:
                raise TransactionValidationError("Нельзя использовать архивированный кошелёк")
            if fw.currency != tw.currency:
                raise TransactionValidationError("Кошельки в разных валютах")

        # --- Validate amount ---
        new_amount = changes.get("amount")
        if new_amount is not None and new_amount <= 0:
            raise TransactionValidationError("Сумма операции должна быть больше нуля")

        # --- Build old snapshot ---
        old_snapshot = {
            "operation_type": tx.operation_type,
            "amount": str(tx.amount),
            "currency": tx.currency,
            "wallet_id": tx.wallet_id,
            "from_wallet_id": tx.from_wallet_id,
            "to_wallet_id": tx.to_wallet_id,
            "from_goal_id": tx.from_goal_id,
            "to_goal_id": tx.to_goal_id,
            "category_id": tx.category_id,
        }

        # Serialise amount for event payload
        if new_amount is not None:
            changes["amount"] = new_amount  # Decimal — serialised inside Transaction.update

        event_payload = Transaction.update(
            transaction_id=transaction_id,
            account_id=account_id,
            old_snapshot=old_snapshot,
            **changes,
        )

        self.event_repo.append_event(
            account_id=account_id,
            event_type="transaction_updated",
            payload=event_payload,
            actor_user_id=actor_user_id,
        )

        self.db.commit()
        self._run_projectors(account_id)

    def _run_projectors(self, account_id: int):
        _TX_EVENTS = ["transaction_created", "transaction_updated"]
        WalletBalancesProjector(self.db).run(account_id, event_types=_TX_EVENTS)
        TransactionsFeedProjector(self.db).run(account_id, event_types=_TX_EVENTS)
        GoalWalletBalancesProjector(self.db).run(
            account_id, event_types=_TX_EVENTS + ["wallet_created"],
        )
