"""
Event Log Repository - source of truth для Event Sourcing

Все изменения в системе записываются как неизменяемые события.
"""
from datetime import datetime
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.infrastructure.db.models import EventLog


class EventLogRepository:
    """
    Repository для работы с event log

    Source: Перенесено из OLD/infra/eventlog/repository.py
    """

    def __init__(self, db: Session):
        self.db = db

    def append_event(
        self,
        account_id: int,
        event_type: str,
        payload: Dict[str, Any],
        occurred_at: Optional[datetime] = None,
        actor_user_id: Optional[int] = None,
        idempotency_key: Optional[str] = None,
    ) -> int:
        """
        Добавить событие в event log

        Args:
            account_id: ID аккаунта
            event_type: Тип события (например, "operation_created")
            payload: Данные события (будут сохранены как JSONB)
            occurred_at: Когда произошло событие (default: now)
            actor_user_id: Кто совершил действие (опционально)
            idempotency_key: Ключ для идемпотентности (опционально)

        Returns:
            event_id: ID созданного события

        Raises:
            IntegrityError: если idempotency_key уже существует

        Example:
            >>> repo = EventLogRepository(db)
            >>> event_id = repo.append_event(
            ...     account_id=1,
            ...     event_type="wallet_created",
            ...     payload={"wallet_id": 123, "title": "Наличные"},
            ...     idempotency_key="wallet-create-123"
            ... )
        """
        if occurred_at is None:
            occurred_at = datetime.utcnow()

        event = EventLog(
            account_id=account_id,
            actor_user_id=actor_user_id,
            event_type=event_type,
            payload_json=payload,
            occurred_at=occurred_at,
            idempotency_key=idempotency_key,
        )

        self.db.add(event)
        self.db.flush()  # Получить ID без commit

        return event.id

    def get_event(self, event_id: int) -> Optional[EventLog]:
        """
        Получить событие по ID

        Args:
            event_id: ID события

        Returns:
            EventLog или None если не найдено
        """
        return self.db.query(EventLog).filter(EventLog.id == event_id).first()

    def list_events_since(
        self,
        account_id: int,
        after_id: int = 0,
        limit: int = 200,
        event_types: Optional[List[str]] = None,
    ) -> List[EventLog]:
        """
        Получить события после указанного ID (для projectors)

        Args:
            account_id: ID аккаунта
            after_id: Получить события с ID > after_id (checkpoint)
            limit: Максимум событий за раз (default: 200)
            event_types: Фильтр по типам событий (опционально)

        Returns:
            Список событий отсортированных по ID (ASC)

        Example:
            >>> repo = EventLogRepository(db)
            >>> events = repo.list_events_since(
            ...     account_id=1,
            ...     after_id=100,  # checkpoint projector'а
            ...     limit=200
            ... )
        """
        query = (
            self.db.query(EventLog)
            .filter(
                EventLog.account_id == account_id,
                EventLog.id > after_id
            )
        )

        if event_types:
            query = query.filter(EventLog.event_type.in_(event_types))

        query = query.order_by(EventLog.id.asc()).limit(limit)

        return query.all()

    def count_events(
        self,
        account_id: int,
        event_types: Optional[List[str]] = None
    ) -> int:
        """
        Подсчитать количество событий

        Args:
            account_id: ID аккаунта
            event_types: Фильтр по типам (опционально)

        Returns:
            Количество событий
        """
        query = self.db.query(EventLog).filter(EventLog.account_id == account_id)

        if event_types:
            query = query.filter(EventLog.event_type.in_(event_types))

        return query.count()
