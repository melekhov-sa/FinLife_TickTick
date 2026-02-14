"""Task Template use cases - recurring tasks"""
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.infrastructure.eventlog.repository import EventLogRepository
from app.infrastructure.db.models import TaskTemplateModel, TaskOccurrence, EventLog
from app.domain.task_template import TaskTemplate
from app.domain.task_occurrence import TaskOccurrenceEvent
from app.readmodels.projectors.task_templates import TaskTemplatesProjector
from app.application.recurrence_rules import CreateRecurrenceRuleUseCase


class TaskTemplateValidationError(ValueError):
    pass


class CreateTaskTemplateUseCase:
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(
        self,
        account_id: int,
        title: str,
        freq: str,
        interval: int,
        start_date: str,
        note: str | None = None,
        active_until: str | None = None,
        category_id: int | None = None,
        by_weekday: str | None = None,
        by_monthday: int | None = None,
        actor_user_id: int | None = None,
    ) -> int:
        title = title.strip()
        if not title:
            raise TaskTemplateValidationError("Название шаблона не может быть пустым")

        if freq == "WEEKLY" and not by_weekday:
            raise TaskTemplateValidationError("Для еженедельной задачи выберите хотя бы один день недели")
        if freq == "MONTHLY" and by_monthday is not None and (by_monthday < 1 or by_monthday > 31):
            raise TaskTemplateValidationError("День месяца должен быть от 1 до 31")

        rule_uc = CreateRecurrenceRuleUseCase(self.db)
        rule_id = rule_uc.execute(
            account_id=account_id,
            freq=freq,
            interval=interval,
            start_date=start_date,
            until_date=active_until,
            by_weekday=by_weekday,
            by_monthday=by_monthday,
            actor_user_id=actor_user_id,
        )

        template_id = self._generate_id()
        payload = TaskTemplate.create(
            account_id=account_id,
            template_id=template_id,
            title=title,
            rule_id=rule_id,
            active_from=start_date,
            note=note,
            active_until=active_until,
            category_id=category_id,
        )

        self.event_repo.append_event(
            account_id=account_id,
            event_type="task_template_created",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        TaskTemplatesProjector(self.db).run(account_id, event_types=["task_template_created"])
        return template_id

    def _generate_id(self) -> int:
        max_id = self.db.query(
            func.max(func.cast(EventLog.payload_json['template_id'], TaskTemplateModel.template_id.type))
        ).filter(EventLog.event_type == 'task_template_created').scalar() or 0
        return max_id + 1


class CompleteTaskOccurrenceUseCase:
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(self, occurrence_id: int, account_id: int, actor_user_id: int | None = None) -> None:
        occ = self.db.query(TaskOccurrence).filter(
            TaskOccurrence.id == occurrence_id,
            TaskOccurrence.account_id == account_id,
        ).first()
        if not occ:
            raise TaskTemplateValidationError(f"Occurrence #{occurrence_id} не найден")

        payload = TaskOccurrenceEvent.complete(
            occ.template_id, occurrence_id, occ.scheduled_date.isoformat()
        )
        self.event_repo.append_event(
            account_id=account_id,
            event_type="task_occurrence_completed",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        TaskTemplatesProjector(self.db).run(account_id, event_types=["task_occurrence_completed"])


class SkipTaskOccurrenceUseCase:
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(self, occurrence_id: int, account_id: int, actor_user_id: int | None = None) -> None:
        occ = self.db.query(TaskOccurrence).filter(
            TaskOccurrence.id == occurrence_id,
            TaskOccurrence.account_id == account_id,
        ).first()
        if not occ:
            raise TaskTemplateValidationError(f"Occurrence #{occurrence_id} не найден")

        payload = TaskOccurrenceEvent.skip(
            occ.template_id, occurrence_id, occ.scheduled_date.isoformat()
        )
        self.event_repo.append_event(
            account_id=account_id,
            event_type="task_occurrence_skipped",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        TaskTemplatesProjector(self.db).run(account_id, event_types=["task_occurrence_skipped"])
