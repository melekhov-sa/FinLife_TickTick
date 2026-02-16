"""
Category domain entity (Event Sourcing)

Статьи (категории) для классификации доходов и расходов
"""
from datetime import datetime
from typing import Dict, Any


# Category types
CATEGORY_TYPE_INCOME = "INCOME"
CATEGORY_TYPE_EXPENSE = "EXPENSE"

# System categories (created automatically, cannot be modified/deleted)
SYSTEM_INCOME_CATEGORIES = ["Прочие доходы"]
SYSTEM_EXPENSE_CATEGORIES = ["Прочие расходы"]


class Category:
    """
    Category domain entity - creates event payloads for category operations

    Event Sourcing: Category не персистится напрямую, генерирует события.
    Read model (CategoryInfo) строится projector'ом из событий.
    """

    @staticmethod
    def create(
        account_id: int,
        category_id: int,
        title: str,
        category_type: str,
        parent_id: int | None = None,
        is_system: bool = False,
        sort_order: int = 0
    ) -> Dict[str, Any]:
        """
        Создать событие category_created

        Args:
            account_id: ID аккаунта
            category_id: ID категории
            title: Название категории
            category_type: INCOME или EXPENSE
            parent_id: ID родительской категории (для иерархии)
            is_system: Системная категория (нельзя изменить/удалить)
            sort_order: Порядок сортировки

        Returns:
            Event payload для event_log
        """
        return {
            "category_id": category_id,
            "account_id": account_id,
            "title": title,
            "category_type": category_type,
            "parent_id": parent_id,
            "is_system": is_system,
            "sort_order": sort_order,
            "created_at": datetime.utcnow().isoformat()
        }

    @staticmethod
    def update(
        category_id: int,
        **changes: Any
    ) -> Dict[str, Any]:
        """
        Создать событие category_updated

        Args:
            category_id: ID категории
            **changes: Изменяемые поля (title, parent_id, is_archived, sort_order)

        Returns:
            Event payload для event_log
        """
        payload = {
            "category_id": category_id,
            "updated_at": datetime.utcnow().isoformat()
        }
        payload.update(changes)
        return payload

    @staticmethod
    def archive(category_id: int) -> Dict[str, Any]:
        """
        Создать событие category_archived (shortcut для update)

        Args:
            category_id: ID категории

        Returns:
            Event payload для event_log
        """
        return {
            "category_id": category_id,
            "is_archived": True,
            "archived_at": datetime.utcnow().isoformat()
        }

    @staticmethod
    def unarchive(category_id: int) -> Dict[str, Any]:
        """
        Создать событие category_unarchived

        Args:
            category_id: ID категории

        Returns:
            Event payload для event_log
        """
        return {
            "category_id": category_id,
            "is_archived": False,
            "unarchived_at": datetime.utcnow().isoformat()
        }

    @staticmethod
    def delete(category_id: int) -> Dict[str, Any]:
        """
        Создать событие category_deleted

        Args:
            category_id: ID категории

        Returns:
            Event payload для event_log
        """
        return {
            "category_id": category_id,
            "deleted_at": datetime.utcnow().isoformat()
        }
