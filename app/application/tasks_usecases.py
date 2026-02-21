"""Task use cases - one-off tasks"""
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.infrastructure.eventlog.repository import EventLogRepository
from app.infrastructure.db.models import TaskModel, EventLog
from app.domain.task import Task
from app.readmodels.projectors.tasks import TasksProjector
from app.readmodels.projectors.xp import XpProjector
from app.readmodels.projectors.activity import ActivityProjector


class TaskValidationError(ValueError):
    pass


class CreateTaskUseCase:
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(
        self,
        account_id: int,
        title: str,
        note: str | None = None,
        due_kind: str = "NONE",
        due_date: str | None = None,
        due_time: str | None = None,
        due_start_time: str | None = None,
        due_end_time: str | None = None,
        category_id: int | None = None,
        actor_user_id: int | None = None,
        reminders: list[dict] | None = None,
        requires_expense: bool = False,
        suggested_expense_category_id: int | None = None,
        suggested_amount: str | None = None,
    ) -> int:
        title = title.strip()
        if not title:
            raise TaskValidationError("Название задачи не может быть пустым")

        task_id = self._generate_id()
        payload = Task.create(
            account_id, task_id, title, note,
            due_kind=due_kind, due_date=due_date, due_time=due_time,
            due_start_time=due_start_time, due_end_time=due_end_time,
            category_id=category_id,
            requires_expense=requires_expense,
            suggested_expense_category_id=suggested_expense_category_id,
            suggested_amount=suggested_amount,
        )

        self.event_repo.append_event(
            account_id=account_id,
            event_type="task_created",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        TasksProjector(self.db).run(account_id, event_types=["task_created"])

        # Set reminders if provided
        if reminders:
            rem_payload = Task.set_reminders(task_id, reminders, due_kind)
            self.event_repo.append_event(
                account_id=account_id,
                event_type="task_reminders_changed",
                payload=rem_payload,
                actor_user_id=actor_user_id,
            )
            self.db.commit()
            TasksProjector(self.db).run(account_id, event_types=["task_reminders_changed"])

        return task_id

    def _generate_id(self) -> int:
        max_id = self.db.query(
            func.max(func.cast(EventLog.payload_json['task_id'], TaskModel.task_id.type))
        ).filter(EventLog.event_type == 'task_created').scalar() or 0
        return max_id + 1


class UpdateTaskUseCase:
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(
        self,
        task_id: int,
        account_id: int,
        actor_user_id: int | None = None,
        reminders: list[dict] | None = None,
        **changes,
    ) -> None:
        task = self.db.query(TaskModel).filter(
            TaskModel.task_id == task_id,
            TaskModel.account_id == account_id,
        ).first()
        if not task:
            raise TaskValidationError(f"Задача #{task_id} не найдена")
        if task.status != "ACTIVE":
            raise TaskValidationError("Можно редактировать только активную задачу")

        # Validate DueSpec: merge current values with changes
        due_fields = ("due_kind", "due_date", "due_time", "due_start_time", "due_end_time")
        if any(k in changes for k in due_fields):
            from app.domain.task_due_spec import validate_due_spec
            validate_due_spec(
                changes.get("due_kind", task.due_kind),
                changes.get("due_date", task.due_date.isoformat() if task.due_date else None),
                changes.get("due_time", task.due_time.isoformat() if task.due_time else None),
                changes.get("due_start_time", task.due_start_time.isoformat() if task.due_start_time else None),
                changes.get("due_end_time", task.due_end_time.isoformat() if task.due_end_time else None),
            )

        payload = Task.update(task_id, **changes)
        self.event_repo.append_event(
            account_id=account_id,
            event_type="task_updated",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        TasksProjector(self.db).run(account_id, event_types=["task_updated"])

        # Handle reminders
        if reminders is not None:
            effective_due_kind = changes.get("due_kind", task.due_kind)
            rem_payload = Task.set_reminders(task_id, reminders, effective_due_kind)
            self.event_repo.append_event(
                account_id=account_id,
                event_type="task_reminders_changed",
                payload=rem_payload,
                actor_user_id=actor_user_id,
            )
            self.db.commit()
            TasksProjector(self.db).run(account_id, event_types=["task_reminders_changed"])


class CompleteTaskUseCase:
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(self, task_id: int, account_id: int, actor_user_id: int | None = None) -> None:
        task = self.db.query(TaskModel).filter(
            TaskModel.task_id == task_id,
            TaskModel.account_id == account_id,
        ).first()
        if not task:
            raise TaskValidationError(f"Задача #{task_id} не найдена")
        if task.status != "ACTIVE":
            raise TaskValidationError("Можно завершить только активную задачу")

        payload = Task.complete(task_id)
        self.event_repo.append_event(
            account_id=account_id,
            event_type="task_completed",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        TasksProjector(self.db).run(account_id, event_types=["task_completed"])
        XpProjector(self.db).run(account_id, event_types=["task_completed"])
        ActivityProjector(self.db).run(account_id, event_types=["task_completed"])


class ArchiveTaskUseCase:
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(self, task_id: int, account_id: int, actor_user_id: int | None = None) -> None:
        task = self.db.query(TaskModel).filter(
            TaskModel.task_id == task_id,
            TaskModel.account_id == account_id,
        ).first()
        if not task:
            raise TaskValidationError(f"Задача #{task_id} не найдена")

        payload = Task.archive(task_id)
        self.event_repo.append_event(
            account_id=account_id,
            event_type="task_archived",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        TasksProjector(self.db).run(account_id, event_types=["task_archived"])


class UncompleteTaskUseCase:
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(self, task_id: int, account_id: int, actor_user_id: int | None = None) -> None:
        task = self.db.query(TaskModel).filter(
            TaskModel.task_id == task_id,
            TaskModel.account_id == account_id,
        ).first()
        if not task:
            raise TaskValidationError(f"Задача #{task_id} не найдена")
        if task.status != "DONE":
            raise TaskValidationError("Можно отменить только выполненную задачу")

        payload = Task.uncomplete(task_id)
        self.event_repo.append_event(
            account_id=account_id,
            event_type="task_uncompleted",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        TasksProjector(self.db).run(account_id, event_types=["task_uncompleted"])
