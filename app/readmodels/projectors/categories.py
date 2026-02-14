"""
CategoriesProjector - builds categories read model from events
"""
from datetime import datetime

from app.readmodels.projectors.base import BaseProjector
from app.infrastructure.db.models import CategoryInfo, EventLog


class CategoriesProjector(BaseProjector):
    """
    Builds categories read model from events

    Обрабатывает события:
    - category_created: создать категорию
    - category_updated: обновить категорию
    - category_archived: архивировать категорию
    - category_deleted: удалить категорию
    """

    def __init__(self, db):
        super().__init__(db, projector_name="categories")

    def handle_event(self, event: EventLog) -> None:
        """Process category events"""
        if event.event_type == "category_created":
            self._handle_category_created(event)
        elif event.event_type == "category_updated":
            self._handle_category_updated(event)
        elif event.event_type == "category_archived":
            self._handle_category_archived(event)
        elif event.event_type == "category_deleted":
            self._handle_category_deleted(event)

    def _handle_category_created(self, event: EventLog) -> None:
        """Создать категорию"""
        payload = event.payload_json

        # Идемпотентность: flush чтобы увидеть незакоммиченные объекты
        self.db.flush()

        existing = self.db.query(CategoryInfo).filter(
            CategoryInfo.category_id == payload["category_id"]
        ).first()

        if existing:
            return  # Уже обработано

        category = CategoryInfo(
            category_id=payload["category_id"],
            account_id=payload["account_id"],
            title=payload["title"],
            category_type=payload["category_type"],
            parent_id=payload.get("parent_id"),
            is_archived=False,
            is_system=payload.get("is_system", False),
            sort_order=payload.get("sort_order", 0),
            created_at=datetime.fromisoformat(payload["created_at"])
        )
        self.db.add(category)
        self.db.flush()  # Flush чтобы следующий handle увидел этот объект

    def _handle_category_updated(self, event: EventLog) -> None:
        """Обновить категорию"""
        payload = event.payload_json

        category = self.db.query(CategoryInfo).filter(
            CategoryInfo.category_id == payload["category_id"]
        ).first()

        if not category:
            return  # Категория не найдена

        # Обновить измененные поля
        if "title" in payload:
            category.title = payload["title"]
        if "parent_id" in payload:
            category.parent_id = payload["parent_id"]
        if "is_archived" in payload:
            category.is_archived = payload["is_archived"]
        if "sort_order" in payload:
            category.sort_order = payload["sort_order"]

    def _handle_category_archived(self, event: EventLog) -> None:
        """Архивировать категорию (shortcut для update)"""
        payload = event.payload_json

        category = self.db.query(CategoryInfo).filter(
            CategoryInfo.category_id == payload["category_id"]
        ).first()

        if category:
            category.is_archived = True

    def _handle_category_deleted(self, event: EventLog) -> None:
        """Удалить категорию из read model"""
        payload = event.payload_json

        category = self.db.query(CategoryInfo).filter(
            CategoryInfo.category_id == payload["category_id"]
        ).first()

        if category:
            self.db.delete(category)

    def reset(self, account_id: int) -> None:
        """Удалить все категории для аккаунта"""
        self.db.query(CategoryInfo).filter(
            CategoryInfo.account_id == account_id
        ).delete()
        super().reset(account_id)
