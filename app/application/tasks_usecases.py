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
        due_date: str | None = None,
        category_id: int | None = None,
        actor_user_id: int | None = None,
    ) -> int:
        title = title.strip()
        if not title:
            raise TaskValidationError("Название задачи не может быть пустым")

        task_id = self._generate_id()
        payload = Task.create(account_id, task_id, title, note, due_date, category_id)

        self.event_repo.append_event(
            account_id=account_id,
            event_type="task_created",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        TasksProjector(self.db).run(account_id, event_types=["task_created"])
        return task_id

    def _generate_id(self) -> int:
        max_id = self.db.query(
            func.max(func.cast(EventLog.payload_json['task_id'], TaskModel.task_id.type))
        ).filter(EventLog.event_type == 'task_created').scalar() or 0
        return max_id + 1


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
