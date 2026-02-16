"""
Wish domain entity (Event Sourcing)

Хотелки - долгосрочный структурированный бэклог жизненных намерений
"""
from datetime import datetime
from typing import Dict, Any


# Wish types
WISH_TYPE_PURCHASE = "PURCHASE"
WISH_TYPE_EVENT = "EVENT"
WISH_TYPE_PLACE = "PLACE"
WISH_TYPE_OTHER = "OTHER"

WISH_TYPES = [WISH_TYPE_PURCHASE, WISH_TYPE_EVENT, WISH_TYPE_PLACE, WISH_TYPE_OTHER]

# Wish statuses
WISH_STATUS_IDEA = "IDEA"
WISH_STATUS_CONSIDERING = "CONSIDERING"
WISH_STATUS_PLANNED = "PLANNED"
WISH_STATUS_DONE = "DONE"
WISH_STATUS_CANCELED = "CANCELED"

WISH_STATUSES = [
    WISH_STATUS_IDEA,
    WISH_STATUS_CONSIDERING,
    WISH_STATUS_PLANNED,
    WISH_STATUS_DONE,
    WISH_STATUS_CANCELED
]


class Wish:
    """
    Wish domain entity - creates event payloads for wish operations

    Event Sourcing: Wish не персистится напрямую, генерирует события.
    Read model строится projector'ом из событий.
    """

    @staticmethod
    def create(
        account_id: int,
        wish_id: int,
        title: str,
        wish_type: str,
        status: str = WISH_STATUS_IDEA,
        target_date: str | None = None,
        target_month: str | None = None,
        estimated_amount: str | None = None,
        is_recurring: bool = False,
        notes: str | None = None
    ) -> Dict[str, Any]:
        """
        Создать событие wish_created

        Args:
            account_id: ID аккаунта
            wish_id: ID хотелки
            title: Название
            wish_type: Тип (PURCHASE, EVENT, PLACE, OTHER)
            status: Статус (по умолчанию IDEA)
            target_date: Целевая дата (YYYY-MM-DD)
            target_month: Целевой месяц (YYYY-MM)
            estimated_amount: Ориентировочная сумма (строка)
            is_recurring: Повторяющаяся хотелка
            notes: Заметки

        Returns:
            Event payload для event_log
        """
        if wish_type not in WISH_TYPES:
            raise ValueError(f"Неверный тип хотелки: {wish_type}")

        if status not in WISH_STATUSES:
            raise ValueError(f"Неверный статус: {status}")

        if target_date and target_month:
            raise ValueError("Нельзя указать одновременно target_date и target_month")

        return {
            "wish_id": wish_id,
            "account_id": account_id,
            "title": title,
            "wish_type": wish_type,
            "status": status,
            "target_date": target_date,
            "target_month": target_month,
            "estimated_amount": estimated_amount,
            "is_recurring": is_recurring,
            "notes": notes,
            "created_at": datetime.utcnow().isoformat()
        }

    @staticmethod
    def update(wish_id: int, **changes: Any) -> Dict[str, Any]:
        """
        Создать событие wish_updated

        Args:
            wish_id: ID хотелки
            **changes: Изменяемые поля

        Returns:
            Event payload для event_log
        """
        # Validate target_date/target_month exclusivity
        if "target_date" in changes and "target_month" in changes:
            if changes["target_date"] and changes["target_month"]:
                raise ValueError("Нельзя указать одновременно target_date и target_month")

        payload = {
            "wish_id": wish_id,
            "updated_at": datetime.utcnow().isoformat()
        }
        payload.update(changes)
        return payload

    @staticmethod
    def complete(
        wish_id: int,
        is_recurring: bool,
        current_status: str
    ) -> Dict[str, Any]:
        """
        Создать событие wish_completed

        Args:
            wish_id: ID хотелки
            is_recurring: Повторяющаяся ли хотелка
            current_status: Текущий статус

        Returns:
            Event payload для event_log
        """
        completed_at = datetime.utcnow().isoformat()

        if is_recurring:
            # Для повторяющихся: обновить last_completed_at, статус не меняется
            return {
                "wish_id": wish_id,
                "last_completed_at": completed_at,
                "completed_at": completed_at
            }
        else:
            # Для одноразовых: статус → DONE
            return {
                "wish_id": wish_id,
                "status": WISH_STATUS_DONE,
                "last_completed_at": completed_at,
                "completed_at": completed_at
            }

    @staticmethod
    def cancel(wish_id: int) -> Dict[str, Any]:
        """
        Создать событие wish_canceled

        Args:
            wish_id: ID хотелки

        Returns:
            Event payload для event_log
        """
        return {
            "wish_id": wish_id,
            "status": WISH_STATUS_CANCELED,
            "canceled_at": datetime.utcnow().isoformat()
        }
