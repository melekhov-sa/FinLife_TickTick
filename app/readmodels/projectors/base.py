"""
Base Projector - базовый класс для всех projectors (CQRS read-side)

Projectors строят read models из событий event log.
Используют checkpoint для идемпотентности и инкрементальных обновлений.
"""
from abc import ABC, abstractmethod
from typing import List, Optional
from sqlalchemy.orm import Session

from app.infrastructure.db.models import EventLog
from app.infrastructure.eventlog.repository import EventLogRepository


class BaseProjector(ABC):
    """
    Базовый класс для всех projectors

    Каждый projector:
    1. Читает события из event_log (с checkpoint)
    2. Обрабатывает события (handle_event)
    3. Обновляет read model
    4. Сохраняет новый checkpoint

    Source: Извлечено из OLD/apps/projector/*.py
    """

    def __init__(self, db: Session, projector_name: str):
        """
        Args:
            db: SQLAlchemy session
            projector_name: Уникальное имя projector'а (для checkpoint)
        """
        self.db = db
        self.projector_name = projector_name
        self.event_repo = EventLogRepository(db)

    @abstractmethod
    def handle_event(self, event: EventLog) -> None:
        """
        Обработать одно событие и обновить read model

        Args:
            event: Событие из event log

        Raises:
            Exception: если обработка не удалась

        Note:
            Метод должен быть идемпотентным - повторная обработка
            того же события не должна ломать состояние read model.
        """
        pass

    def get_checkpoint(self, account_id: int) -> int:
        """
        Получить текущий checkpoint (last processed event_id) из БД

        Args:
            account_id: ID аккаунта

        Returns:
            last_event_id (0 если projector ещё не запускался)
        """
        from app.infrastructure.db.models import ProjectorCheckpoint

        checkpoint = self.db.query(ProjectorCheckpoint).filter(
            ProjectorCheckpoint.projector_name == self.projector_name,
            ProjectorCheckpoint.account_id == account_id
        ).first()

        return checkpoint.last_event_id if checkpoint else 0

    def save_checkpoint(self, account_id: int, event_id: int) -> None:
        """
        Сохранить checkpoint (last processed event_id) в БД

        Args:
            account_id: ID аккаунта
            event_id: ID последнего обработанного события
        """
        from app.infrastructure.db.models import ProjectorCheckpoint

        # Flush перед query чтобы увидеть незакоммиченные изменения
        self.db.flush()

        checkpoint = self.db.query(ProjectorCheckpoint).filter(
            ProjectorCheckpoint.projector_name == self.projector_name,
            ProjectorCheckpoint.account_id == account_id
        ).first()

        if checkpoint:
            checkpoint.last_event_id = event_id
        else:
            checkpoint = ProjectorCheckpoint(
                projector_name=self.projector_name,
                account_id=account_id,
                last_event_id=event_id
            )
            self.db.add(checkpoint)

    def run(
        self,
        account_id: int,
        event_types: Optional[List[str]] = None,
        batch_size: int = 200
    ) -> int:
        """
        Запустить projector - обработать все новые события

        Args:
            account_id: ID аккаунта
            event_types: Фильтр по типам событий (если None - все события)
            batch_size: Размер батча для обработки (default: 200)

        Returns:
            Количество обработанных событий

        Example:
            >>> projector = WalletBalancesProjector(db)
            >>> count = projector.run(account_id=1)
            >>> print(f"Processed {count} events")
        """
        checkpoint = self.get_checkpoint(account_id)
        processed_count = 0

        while True:
            # Читаем батч событий после checkpoint
            events = self.event_repo.list_events_since(
                account_id=account_id,
                after_id=checkpoint,
                limit=batch_size,
                event_types=event_types
            )

            if not events:
                break  # Нет новых событий

            # Обрабатываем каждое событие
            for event in events:
                self.handle_event(event)
                checkpoint = event.id
                processed_count += 1

            # Сохраняем checkpoint после батча
            self.save_checkpoint(account_id, checkpoint)
            self.db.commit()

            # Если получили меньше событий чем batch_size - закончили
            if len(events) < batch_size:
                break

        return processed_count

    def reset(self, account_id: int) -> None:
        """
        Сбросить projector - удалить read model и checkpoint

        Args:
            account_id: ID аккаунта

        Warning:
            Это приведёт к полной пересборке read model!
        """
        self.save_checkpoint(account_id, 0)
        # Подклассы должны переопределить метод для удаления своих read models


class ProjectorOrchestrator:
    """
    Orchestrator для запуска всех projectors в правильном порядке

    Source: Аналог OLD/apps/projector/run_all.py
    """

    def __init__(self, db: Session):
        self.db = db
        self.projectors: List[BaseProjector] = []

    def register(self, projector: BaseProjector) -> None:
        """
        Зарегистрировать projector

        Args:
            projector: Экземпляр projector'а

        Note:
            Порядок регистрации = порядок выполнения!
        """
        self.projectors.append(projector)

    def run_all(self, account_id: int) -> dict[str, int]:
        """
        Запустить все зарегистрированные projectors

        Args:
            account_id: ID аккаунта

        Returns:
            Словарь {projector_name: processed_count}

        Example:
            >>> orchestrator = ProjectorOrchestrator(db)
            >>> orchestrator.register(WalletBalancesProjector(db))
            >>> orchestrator.register(BudgetFactProjector(db))
            >>> results = orchestrator.run_all(account_id=1)
            >>> print(results)
            {'wallet_balances': 150, 'budget_fact': 80}
        """
        results = {}

        for projector in self.projectors:
            count = projector.run(account_id)
            results[projector.projector_name] = count

        return results
