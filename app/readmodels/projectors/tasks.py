"""TasksProjector - builds tasks read model from events"""
from datetime import date, time, datetime
from decimal import Decimal
from app.readmodels.projectors.base import BaseProjector
from app.infrastructure.db.models import TaskModel, TaskReminderModel, EventLog


class TasksProjector(BaseProjector):
    def __init__(self, db):
        super().__init__(db, projector_name="tasks")

    def handle_event(self, event: EventLog) -> None:
        handlers = {
            "task_created": self._handle_created,
            "task_completed": self._handle_completed,
            "task_uncompleted": self._handle_uncompleted,
            "task_archived": self._handle_archived,
            "task_updated": self._handle_updated,
            "task_reminders_changed": self._handle_reminders_changed,
        }
        handler = handlers.get(event.event_type)
        if handler:
            handler(event)

    def _handle_created(self, event: EventLog) -> None:
        payload = event.payload_json
        self.db.flush()
        existing = self.db.query(TaskModel).filter(
            TaskModel.task_id == payload["task_id"]
        ).first()
        if existing:
            return
        task = TaskModel(
            task_id=payload["task_id"],
            account_id=payload["account_id"],
            title=payload["title"],
            note=payload.get("note"),
            due_kind=payload.get("due_kind", "NONE"),
            due_date=date.fromisoformat(payload["due_date"]) if payload.get("due_date") else None,
            due_time=time.fromisoformat(payload["due_time"]) if payload.get("due_time") else None,
            due_start_time=time.fromisoformat(payload["due_start_time"]) if payload.get("due_start_time") else None,
            due_end_time=time.fromisoformat(payload["due_end_time"]) if payload.get("due_end_time") else None,
            status="ACTIVE",
            category_id=payload.get("category_id"),
            requires_expense=payload.get("requires_expense", False),
            suggested_expense_category_id=payload.get("suggested_expense_category_id"),
            suggested_amount=Decimal(payload["suggested_amount"]) if payload.get("suggested_amount") else None,
            created_at=datetime.fromisoformat(payload["created_at"])
        )
        self.db.add(task)
        self.db.flush()

    def _handle_updated(self, event: EventLog) -> None:
        """Handle task_updated: update changed fields on TaskModel."""
        payload = event.payload_json
        task = self.db.query(TaskModel).filter(
            TaskModel.task_id == payload["task_id"]
        ).first()
        if not task:
            return
        for field in ("title", "note", "category_id", "due_kind", "requires_expense", "suggested_expense_category_id"):
            if field in payload:
                setattr(task, field, payload[field])
        if "suggested_amount" in payload:
            task.suggested_amount = Decimal(payload["suggested_amount"]) if payload["suggested_amount"] else None
        if "due_date" in payload:
            task.due_date = date.fromisoformat(payload["due_date"]) if payload["due_date"] else None
        for field in ("due_time", "due_start_time", "due_end_time"):
            if field in payload:
                setattr(task, field, time.fromisoformat(payload[field]) if payload[field] else None)

    def _handle_reminders_changed(self, event: EventLog) -> None:
        """Handle task_reminders_changed: full sync (delete all + re-insert)."""
        payload = event.payload_json
        task_id = payload["task_id"]

        self.db.query(TaskReminderModel).filter(
            TaskReminderModel.task_id == task_id
        ).delete(synchronize_session=False)

        for rem in payload.get("reminders", []):
            self.db.add(TaskReminderModel(
                task_id=task_id,
                offset_minutes=rem["offset_minutes"],
            ))
        self.db.flush()

    def _handle_completed(self, event: EventLog) -> None:
        payload = event.payload_json
        task = self.db.query(TaskModel).filter(
            TaskModel.task_id == payload["task_id"]
        ).first()
        if task:
            task.status = "DONE"
            task.completed_at = datetime.fromisoformat(payload["completed_at"])

    def _handle_uncompleted(self, event: EventLog) -> None:
        payload = event.payload_json
        task = self.db.query(TaskModel).filter(
            TaskModel.task_id == payload["task_id"]
        ).first()
        if task:
            task.status = "ACTIVE"
            task.completed_at = None

    def _handle_archived(self, event: EventLog) -> None:
        payload = event.payload_json
        task = self.db.query(TaskModel).filter(
            TaskModel.task_id == payload["task_id"]
        ).first()
        if task:
            task.status = "ARCHIVED"
            task.archived_at = datetime.fromisoformat(payload["archived_at"])

    def reset(self, account_id: int) -> None:
        task_ids = [
            t.task_id for t in
            self.db.query(TaskModel.task_id).filter(TaskModel.account_id == account_id).all()
        ]
        if task_ids:
            self.db.query(TaskReminderModel).filter(
                TaskReminderModel.task_id.in_(task_ids)
            ).delete(synchronize_session=False)
        self.db.query(TaskModel).filter(TaskModel.account_id == account_id).delete()
        super().reset(account_id)
