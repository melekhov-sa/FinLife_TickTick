"""
Goal use cases - business logic for savings goal operations
"""
import re
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.infrastructure.eventlog.repository import EventLogRepository
from app.infrastructure.db.models import GoalInfo, EventLog
from app.domain.goal import Goal, SYSTEM_GOAL_TITLE
from app.readmodels.projectors.goals import GoalsProjector


class GoalValidationError(ValueError):
    """Ошибка валидации цели"""
    pass


class CreateGoalUseCase:
    """Use case: Создать новую цель накопления"""

    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(
        self,
        account_id: int,
        title: str,
        currency: str,
        target_amount: str | None = None,
        is_system: bool = False,
        actor_user_id: int | None = None
    ) -> int:
        """
        Создать цель

        Args:
            account_id: ID аккаунта
            title: Название цели
            currency: Валюта (USD, EUR, RUB)
            target_amount: Целевая сумма (опционально)
            is_system: Системная цель (нельзя изменить/удалить)
            actor_user_id: Кто создаёт

        Returns:
            goal_id: ID созданной цели
        """
        title = title.strip()
        if not title:
            raise GoalValidationError("Название цели не может быть пустым")

        if not re.fullmatch(r"[A-Z]{3}", currency):
            raise GoalValidationError(
                f"Неверный код валюты: «{currency}». Используйте 3 заглавные буквы (например RUB, USD, EUR)"
            )

        if target_amount is not None:
            ta = Decimal(target_amount)
            if ta < 0:
                raise GoalValidationError("Целевая сумма не может быть отрицательной")

        goal_id = self._generate_goal_id()

        event_payload = Goal.create(
            account_id=account_id,
            goal_id=goal_id,
            title=title,
            currency=currency,
            target_amount=target_amount,
            is_system=is_system
        )

        self.event_repo.append_event(
            account_id=account_id,
            event_type="goal_created",
            payload=event_payload,
            actor_user_id=actor_user_id,
            idempotency_key=f"goal-create-{account_id}-{goal_id}"
        )

        self.db.commit()
        self._run_projectors(account_id)

        return goal_id

    def _generate_goal_id(self) -> int:
        max_id_from_events = (
            self.db.query(
                func.max(
                    func.cast(EventLog.payload_json['goal_id'], GoalInfo.goal_id.type)
                )
            )
            .filter(EventLog.event_type == 'goal_created')
            .scalar() or 0
        )
        return max_id_from_events + 1

    def _run_projectors(self, account_id: int):
        projector = GoalsProjector(self.db)
        projector.run(account_id, event_types=["goal_created"])


class UpdateGoalUseCase:
    """Use case: Обновить цель (переименовать, изменить target_amount)"""

    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(
        self,
        goal_id: int,
        account_id: int,
        title: str | None = None,
        target_amount: str | None = ...,  # sentinel: ... means "not provided"
        actor_user_id: int | None = None
    ) -> None:
        goal = self.db.query(GoalInfo).filter(
            GoalInfo.goal_id == goal_id,
            GoalInfo.account_id == account_id
        ).first()

        if not goal:
            raise GoalValidationError(f"Цель #{goal_id} не найдена")

        if goal.is_system:
            raise GoalValidationError("Нельзя редактировать системную цель")

        if goal.is_archived:
            raise GoalValidationError("Нельзя редактировать архивированную цель")

        changes = {}

        if title is not None:
            title = title.strip()
            if not title:
                raise GoalValidationError("Название цели не может быть пустым")
            changes["title"] = title

        if target_amount is not ...:
            if target_amount is not None:
                ta = Decimal(target_amount)
                if ta < 0:
                    raise GoalValidationError("Целевая сумма не может быть отрицательной")
            changes["target_amount"] = target_amount

        if not changes:
            return

        event_payload = Goal.update(goal_id, **changes)

        self.event_repo.append_event(
            account_id=account_id,
            event_type="goal_updated",
            payload=event_payload,
            actor_user_id=actor_user_id
        )

        self.db.commit()

        projector = GoalsProjector(self.db)
        projector.run(account_id, event_types=["goal_updated"])


class EnsureSystemGoalUseCase:
    """
    Use case: Создать системную цель 'Без цели' при первом входе

    Для каждой валюты, в которой есть SAVINGS-кошелёк, должна существовать
    системная цель 'Без цели'. Вызывается при создании SAVINGS-кошелька.
    """

    def __init__(self, db: Session):
        self.db = db
        self.create_use_case = CreateGoalUseCase(db)

    def execute(self, account_id: int, currency: str, actor_user_id: int | None = None) -> int:
        """
        Создать системную цель 'Без цели' для указанной валюты если её нет.

        Returns:
            goal_id системной цели
        """
        existing = self.db.query(GoalInfo).filter(
            GoalInfo.account_id == account_id,
            GoalInfo.title == SYSTEM_GOAL_TITLE,
            GoalInfo.currency == currency,
            GoalInfo.is_system == True
        ).first()

        if existing:
            return existing.goal_id

        return self.create_use_case.execute(
            account_id=account_id,
            title=SYSTEM_GOAL_TITLE,
            currency=currency,
            is_system=True,
            actor_user_id=actor_user_id
        )
