"""
Wallet use cases - business logic for wallet operations
"""
import re
import uuid
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.infrastructure.eventlog.repository import EventLogRepository
from app.infrastructure.db.models import WalletBalance
from app.domain.wallet import Wallet, WALLET_TYPE_REGULAR, WALLET_TYPE_CREDIT, WALLET_TYPE_SAVINGS
from app.readmodels.projectors.wallet_balances import WalletBalancesProjector
from app.readmodels.projectors.goal_wallet_balances import GoalWalletBalancesProjector


class WalletValidationError(ValueError):
    """Ошибка валидации кошелька"""
    pass


class CreateWalletUseCase:
    """
    Use case: Создать новый кошелёк

    Процесс:
    1. Генерировать wallet_id
    2. Создать событие wallet_created
    3. Сохранить в event_log
    4. Запустить projector для обновления read model
    """

    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(
        self,
        account_id: int,
        title: str,
        currency: str,
        wallet_type: str = "REGULAR",
        initial_balance: str = "0",
        actor_user_id: int | None = None
    ) -> int:
        """
        Создать кошелёк

        Args:
            account_id: ID аккаунта (user.id)
            title: Название кошелька
            currency: Валюта (USD, EUR, RUB)
            wallet_type: Тип кошелька (REGULAR, CREDIT, SAVINGS)
            initial_balance: Начальный баланс (по умолчанию 0)
            actor_user_id: Кто создаёт (для audit)

        Returns:
            wallet_id: ID созданного кошелька
        """
        # Валидация типа кошелька
        if wallet_type not in (WALLET_TYPE_REGULAR, WALLET_TYPE_CREDIT, WALLET_TYPE_SAVINGS):
            raise WalletValidationError(
                f"Неверный тип кошелька: {wallet_type}. Используйте REGULAR, CREDIT или SAVINGS"
            )

        # Валидация кода валюты: строго 3 заглавные латинские буквы
        if not re.fullmatch(r"[A-Z]{3}", currency):
            raise WalletValidationError(
                f"Неверный код валюты: «{currency}». Используйте 3 заглавные буквы (например RUB, USD, EUR)"
            )

        # Валидация начального баланса в зависимости от типа кошелька
        balance_decimal = Decimal(initial_balance)

        if wallet_type == WALLET_TYPE_CREDIT and balance_decimal > 0:
            raise WalletValidationError(
                "Кредитный кошелёк не может иметь положительный начальный баланс (должен быть <= 0)"
            )

        if wallet_type == WALLET_TYPE_SAVINGS and balance_decimal < 0:
            raise WalletValidationError(
                "Накопительный кошелёк не может иметь отрицательный начальный баланс (должен быть >= 0)"
            )

        if wallet_type == WALLET_TYPE_REGULAR and balance_decimal < 0:
            raise WalletValidationError(
                "Обычный кошелёк не может иметь отрицательный начальный баланс (должен быть >= 0)"
            )

        # Генерируем ID (упрощённая версия для MVP)
        wallet_id = self._generate_wallet_id()

        # Создаём событие через domain entity
        event_payload = Wallet.create(
            account_id=account_id,
            wallet_id=wallet_id,
            title=title,
            currency=currency,
            wallet_type=wallet_type,
            initial_balance=initial_balance
        )

        # Сохраняем событие в event_log
        self.event_repo.append_event(
            account_id=account_id,
            event_type="wallet_created",
            payload=event_payload,
            actor_user_id=actor_user_id,
            idempotency_key=f"wallet-create-{account_id}-{wallet_id}"
        )

        # Для SAVINGS кошельков — создать системную цель 'Без цели' (если нет)
        if wallet_type == WALLET_TYPE_SAVINGS:
            from app.application.goals import EnsureSystemGoalUseCase
            EnsureSystemGoalUseCase(self.db).execute(
                account_id=account_id,
                currency=currency,
                actor_user_id=actor_user_id
            )

        self.db.commit()

        # Запускаем projector для обновления read model
        self._run_projectors(account_id, wallet_type)

        return wallet_id

    def _generate_wallet_id(self) -> int:
        """
        Генерировать новый wallet_id (max+1)

        Используем event_log как source of truth, а не read model,
        чтобы избежать race conditions при одновременных запросах
        """
        from app.infrastructure.db.models import EventLog

        # Найти максимальный wallet_id из всех событий wallet_created
        max_id_from_events = (
            self.db.query(
                func.max(
                    func.cast(EventLog.payload_json['wallet_id'], WalletBalance.wallet_id.type)
                )
            )
            .filter(EventLog.event_type == 'wallet_created')
            .scalar() or 0
        )

        return max_id_from_events + 1

    def _run_projectors(self, account_id: int, wallet_type: str = "REGULAR"):
        """Запустить projectors для обновления read models"""
        projector = WalletBalancesProjector(self.db)
        projector.run(account_id, event_types=["wallet_created"])
        if wallet_type == WALLET_TYPE_SAVINGS:
            GoalWalletBalancesProjector(self.db).run(
                account_id,
                event_types=["wallet_created"]
            )


class RenameWalletUseCase:
    """Use case: Переименовать кошелёк"""

    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(
        self,
        wallet_id: int,
        account_id: int,
        title: str,
        actor_user_id: int | None = None
    ) -> None:
        title = title.strip()
        if not title:
            raise WalletValidationError("Название кошелька не может быть пустым")

        wallet = self.db.query(WalletBalance).filter(
            WalletBalance.wallet_id == wallet_id,
            WalletBalance.account_id == account_id
        ).first()

        if not wallet:
            raise WalletValidationError(f"Кошелёк #{wallet_id} не найден")

        if wallet.is_archived:
            raise WalletValidationError("Нельзя переименовать архивированный кошелёк")

        event_payload = Wallet.rename(wallet_id, title)

        self.event_repo.append_event(
            account_id=account_id,
            event_type="wallet_renamed",
            payload=event_payload,
            actor_user_id=actor_user_id
        )

        self.db.commit()

        projector = WalletBalancesProjector(self.db)
        projector.run(account_id, event_types=["wallet_renamed"])


class ArchiveWalletUseCase:
    """Use case: Архивировать кошелёк"""

    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(
        self,
        wallet_id: int,
        account_id: int,
        actor_user_id: int | None = None
    ) -> None:
        wallet = self.db.query(WalletBalance).filter(
            WalletBalance.wallet_id == wallet_id,
            WalletBalance.account_id == account_id
        ).first()

        if not wallet:
            raise WalletValidationError(f"Кошелёк #{wallet_id} не найден")

        if wallet.is_archived:
            raise WalletValidationError("Кошелёк уже в архиве")

        event_payload = Wallet.archive(wallet_id)

        self.event_repo.append_event(
            account_id=account_id,
            event_type="wallet_archived",
            payload=event_payload,
            actor_user_id=actor_user_id,
            idempotency_key=f"wallet-archive-{account_id}-{wallet_id}"
        )

        self.db.commit()

        projector = WalletBalancesProjector(self.db)
        projector.run(account_id, event_types=["wallet_archived"])


class UnarchiveWalletUseCase:
    """Use case: Восстановить кошелёк из архива"""

    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(
        self,
        wallet_id: int,
        account_id: int,
        actor_user_id: int | None = None
    ) -> None:
        wallet = self.db.query(WalletBalance).filter(
            WalletBalance.wallet_id == wallet_id,
            WalletBalance.account_id == account_id
        ).first()

        if not wallet:
            raise WalletValidationError(f"Кошелёк #{wallet_id} не найден")

        if not wallet.is_archived:
            raise WalletValidationError("Кошелёк не в архиве")

        event_payload = Wallet.unarchive(wallet_id)

        self.event_repo.append_event(
            account_id=account_id,
            event_type="wallet_unarchived",
            payload=event_payload,
            actor_user_id=actor_user_id
        )

        self.db.commit()

        projector = WalletBalancesProjector(self.db)
        projector.run(account_id, event_types=["wallet_unarchived"])
