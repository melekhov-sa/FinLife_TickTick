"""TasksProjector - builds tasks read model from events"""
from datetime import date, datetime
from app.readmodels.projectors.base import BaseProjector
from app.infrastructure.db.models import TaskModel, EventLog


class TasksProjector(BaseProjector):
    def __init__(self, db):
        super().__init__(db, projector_name="tasks")

    def handle_event(self, event: EventLog) -> None:
        if event.event_type == "task_created":
            self._handle_created(event)
        elif event.event_type == "task_completed":
            self._handle_completed(event)
        elif event.event_type == "task_uncompleted":
            self._handle_uncompleted(event)
        elif event.event_type == "task_archived":
            self._handle_archived(event)

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
            due_date=date.fromisoformat(payload["due_date"]) if payload.get("due_date") else None,
            status="ACTIVE",
            category_id=payload.get("category_id"),
            created_at=datetime.fromisoformat(payload["created_at"])
        )
        self.db.add(task)
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
        self.db.query(TaskModel).filter(TaskModel.account_id == account_id).delete()
        super().reset(account_id)
