"""WorkCategoriesProjector - builds work_categories read model from events"""
from datetime import datetime
from app.readmodels.projectors.base import BaseProjector
from app.infrastructure.db.models import WorkCategory, EventLog


class WorkCategoriesProjector(BaseProjector):
    def __init__(self, db):
        super().__init__(db, projector_name="work_categories")

    def handle_event(self, event: EventLog) -> None:
        if event.event_type == "work_category_created":
            self._handle_created(event)
        elif event.event_type == "work_category_updated":
            self._handle_updated(event)
        elif event.event_type == "work_category_archived":
            self._handle_archived(event)
        elif event.event_type == "work_category_unarchived":
            self._handle_unarchived(event)

    def _handle_created(self, event: EventLog) -> None:
        payload = event.payload_json
        self.db.flush()
        existing = self.db.query(WorkCategory).filter(
            WorkCategory.category_id == payload["category_id"]
        ).first()
        if existing:
            return
        cat = WorkCategory(
            category_id=payload["category_id"],
            account_id=payload["account_id"],
            title=payload["title"],
            emoji=payload.get("emoji"),
            is_archived=False,
            created_at=datetime.fromisoformat(payload["created_at"])
        )
        self.db.add(cat)
        self.db.flush()

    def _handle_updated(self, event: EventLog) -> None:
        payload = event.payload_json
        cat = self.db.query(WorkCategory).filter(
            WorkCategory.category_id == payload["category_id"]
        ).first()
        if not cat:
            return
        if "title" in payload:
            cat.title = payload["title"]
        if "emoji" in payload:
            cat.emoji = payload["emoji"]

    def _handle_archived(self, event: EventLog) -> None:
        payload = event.payload_json
        cat = self.db.query(WorkCategory).filter(
            WorkCategory.category_id == payload["category_id"]
        ).first()
        if cat:
            cat.is_archived = True

    def _handle_unarchived(self, event: EventLog) -> None:
        payload = event.payload_json
        cat = self.db.query(WorkCategory).filter(
            WorkCategory.category_id == payload["category_id"]
        ).first()
        if cat:
            cat.is_archived = False

    def reset(self, account_id: int) -> None:
        self.db.query(WorkCategory).filter(WorkCategory.account_id == account_id).delete()
        super().reset(account_id)
