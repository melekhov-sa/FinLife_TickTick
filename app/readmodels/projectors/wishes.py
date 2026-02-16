"""
WishesProjector - builds wishes read model from events
"""
from datetime import datetime
from decimal import Decimal

from app.readmodels.projectors.base import BaseProjector
from app.infrastructure.db.models import WishModel, EventLog


class WishesProjector(BaseProjector):
    """
    Builds wishes read model from events

    Обрабатывает события:
    - wish_created: создать хотелку
    - wish_updated: обновить хотелку
    - wish_completed: отметить выполненной
    """

    def __init__(self, db):
        super().__init__(db, projector_name="wishes")

    def handle_event(self, event: EventLog) -> None:
        """Process wish events"""
        if event.event_type == "wish_created":
            self._handle_wish_created(event)
        elif event.event_type == "wish_updated":
            self._handle_wish_updated(event)
        elif event.event_type == "wish_completed":
            self._handle_wish_completed(event)

    def _handle_wish_created(self, event: EventLog) -> None:
        """Создать хотелку"""
        payload = event.payload_json

        self.db.flush()

        existing = self.db.query(WishModel).filter(
            WishModel.wish_id == payload["wish_id"]
        ).first()

        if existing:
            return  # Уже обработано

        wish = WishModel(
            wish_id=payload["wish_id"],
            account_id=payload["account_id"],
            title=payload["title"],
            wish_type=payload["wish_type"],
            status=payload["status"],
            target_date=payload.get("target_date"),
            target_month=payload.get("target_month"),
            estimated_amount=Decimal(payload["estimated_amount"]) if payload.get("estimated_amount") else None,
            is_recurring=payload.get("is_recurring", False),
            notes=payload.get("notes"),
            created_at=datetime.fromisoformat(payload["created_at"])
        )
        self.db.add(wish)
        self.db.flush()

    def _handle_wish_updated(self, event: EventLog) -> None:
        """Обновить хотелку"""
        payload = event.payload_json

        wish = self.db.query(WishModel).filter(
            WishModel.wish_id == payload["wish_id"]
        ).first()

        if not wish:
            return

        # Обновить измененные поля
        if "title" in payload:
            wish.title = payload["title"]
        if "status" in payload:
            wish.status = payload["status"]
        if "wish_type" in payload:
            wish.wish_type = payload["wish_type"]
        if "target_date" in payload:
            wish.target_date = payload["target_date"]
        if "target_month" in payload:
            wish.target_month = payload["target_month"]
        if "estimated_amount" in payload:
            wish.estimated_amount = Decimal(payload["estimated_amount"]) if payload["estimated_amount"] else None
        if "is_recurring" in payload:
            wish.is_recurring = payload["is_recurring"]
        if "notes" in payload:
            wish.notes = payload["notes"]

    def _handle_wish_completed(self, event: EventLog) -> None:
        """Отметить хотелку выполненной"""
        payload = event.payload_json

        wish = self.db.query(WishModel).filter(
            WishModel.wish_id == payload["wish_id"]
        ).first()

        if not wish:
            return

        if "status" in payload:
            wish.status = payload["status"]
        if "last_completed_at" in payload:
            wish.last_completed_at = datetime.fromisoformat(payload["last_completed_at"])

    def reset(self, account_id: int) -> None:
        """Удалить все хотелки для аккаунта"""
        self.db.query(WishModel).filter(
            WishModel.account_id == account_id
        ).delete()
        super().reset(account_id)
