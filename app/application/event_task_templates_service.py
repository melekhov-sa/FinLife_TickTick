"""
Dispatches auto-created tasks from event task templates.

Runs daily: for every active template, looks at event occurrences in the next
60 days and creates a task (with reminder) for each occurrence that doesn't
already have one.
"""
import logging
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.infrastructure.db.models import (
    CalendarEventModel,
    EventOccurrenceModel,
    EventOccurrenceTask,
    EventTaskTemplate,
)
from app.application.tasks_usecases import CreateTaskUseCase

logger = logging.getLogger(__name__)

HORIZON_DAYS = 60


def dispatch_event_task_templates(db: Session) -> None:
    today = date.today()
    horizon = today + timedelta(days=HORIZON_DAYS)

    templates = (
        db.query(EventTaskTemplate)
        .filter(EventTaskTemplate.is_archived == False)
        .all()
    )

    for tpl in templates:
        try:
            _process_template(db, tpl, today, horizon)
        except Exception:
            logger.exception("Failed to process event task template id=%s", tpl.id)


def _process_template(
    db: Session,
    tpl: EventTaskTemplate,
    today: date,
    horizon: date,
) -> None:
    occurrences = (
        db.query(EventOccurrenceModel)
        .filter(
            EventOccurrenceModel.event_id == tpl.event_id,
            EventOccurrenceModel.start_date >= today,
            EventOccurrenceModel.start_date <= horizon,
            EventOccurrenceModel.is_cancelled == False,
        )
        .all()
    )

    for occ in occurrences:
        existing = (
            db.query(EventOccurrenceTask)
            .filter(
                EventOccurrenceTask.template_id == tpl.id,
                EventOccurrenceTask.occurrence_date == occ.start_date,
            )
            .first()
        )
        if existing:
            continue

        task_due = occ.start_date - timedelta(days=tpl.days_before)
        if task_due < today:
            continue

        event = db.query(CalendarEventModel).filter(
            CalendarEventModel.event_id == tpl.event_id
        ).first()
        category_id = event.category_id if event else None

        reminders = None
        if tpl.reminder_offset_minutes is not None:
            reminders = [{"offset_minutes": -tpl.reminder_offset_minutes}]

        task_id = CreateTaskUseCase(db).execute(
            account_id=tpl.account_id,
            title=tpl.title,
            due_kind="DATE",
            due_date=str(task_due),
            category_id=category_id,
            actor_user_id=tpl.account_id,
            reminders=reminders,
        )

        link = EventOccurrenceTask(
            template_id=tpl.id,
            occurrence_date=occ.start_date,
            task_id=task_id,
        )
        db.add(link)
        db.commit()
        logger.info(
            "Created task_id=%s from template_id=%s for occurrence %s",
            task_id, tpl.id, occ.start_date,
        )
