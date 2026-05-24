"""
Dispatches auto-created tasks from event task templates.

Runs daily: for every active template, looks at event occurrences in the next
60 days and creates a task (with reminder) for each occurrence that doesn't
already have one.

Also auto-completes pre-event tasks when auto_complete_mode is set (runs after
the event day, marking tasks from yesterday's occurrences as done).
"""
import logging
from datetime import date, datetime, time, timedelta

from sqlalchemy.orm import Session

from app.infrastructure.db.models import (
    CalendarEventModel,
    EventOccurrenceModel,
    EventOccurrenceTask,
    EventTaskTemplate,
)
from app.application.tasks_usecases import CreateTaskUseCase, CompleteTaskUseCase

AUTO_COMPLETE_OCCURRENCE_MODES = {"end_of_day", "at_event_end"}

logger = logging.getLogger(__name__)

HORIZON_DAYS = 60


# ── Dispatch (create tasks) ────────────────────────────────────────────────────

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

    event = db.query(CalendarEventModel).filter(
        CalendarEventModel.event_id == tpl.event_id
    ).first()
    category_id = event.category_id if event else None

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

        task_due_date, due_time = _calculate_task_due(occ, tpl)

        if task_due_date < today:
            continue

        reminders = None
        if tpl.reminder_offset_minutes is not None:
            reminders = [{"offset_minutes": -tpl.reminder_offset_minutes}]

        task_id = CreateTaskUseCase(db).execute(
            account_id=tpl.account_id,
            title=tpl.title,
            due_kind="DATE",
            due_date=str(task_due_date),
            due_time=due_time,
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
            "Created task_id=%s from template_id=%s for occurrence %s (after=%s)",
            task_id, tpl.id, occ.start_date, tpl.is_after_event,
        )


def _calculate_task_due(
    occ: EventOccurrenceModel,
    tpl: EventTaskTemplate,
) -> tuple[date, str | None]:
    """Returns (due_date, due_time_str | None)."""
    if tpl.is_after_event:
        base_date = occ.start_date + timedelta(days=tpl.days_before)
        due_time = None
        if tpl.minutes_after_end is not None and occ.end_time is not None:
            end_date = occ.end_date or occ.start_date
            end_dt = datetime.combine(end_date, occ.end_time)
            target_dt = end_dt + timedelta(minutes=tpl.minutes_after_end)
            base_date = target_dt.date()
            due_time = target_dt.strftime("%H:%M")
        return base_date, due_time
    else:
        return occ.start_date - timedelta(days=tpl.days_before), None


# ── Auto-complete (mark pre-event tasks done after the event day) ──────────────

def auto_complete_event_tasks(db: Session) -> None:
    """
    Runs daily (morning after event day).
    For each before-event template with auto_complete_mode set, marks the
    associated task done if the occurrence was yesterday.
    """
    yesterday = date.today() - timedelta(days=1)

    templates = (
        db.query(EventTaskTemplate)
        .filter(
            EventTaskTemplate.is_archived == False,
            EventTaskTemplate.is_after_event == False,
            EventTaskTemplate.auto_complete_mode.isnot(None),
        )
        .all()
    )

    for tpl in templates:
        try:
            _auto_complete_template(db, tpl, yesterday)
        except Exception:
            logger.exception("Failed to auto-complete tasks for template_id=%s", tpl.id)


# ── Auto-complete event occurrences ───────────────────────────────────────────

def auto_complete_occurrences(db: Session) -> None:
    """
    Runs daily (morning after event day).
    For each event with completion_mode != 'manual', marks yesterday's
    non-cancelled occurrences as completed.
    """
    yesterday = date.today() - timedelta(days=1)

    events = (
        db.query(CalendarEventModel)
        .filter(
            CalendarEventModel.is_active == True,
            CalendarEventModel.completion_mode.in_(AUTO_COMPLETE_OCCURRENCE_MODES),
        )
        .all()
    )

    event_ids = [ev.event_id for ev in events]
    if not event_ids:
        return

    occs = (
        db.query(EventOccurrenceModel)
        .filter(
            EventOccurrenceModel.event_id.in_(event_ids),
            EventOccurrenceModel.start_date == yesterday,
            EventOccurrenceModel.is_cancelled == False,
            EventOccurrenceModel.is_completed == False,
        )
        .all()
    )

    for occ in occs:
        occ.is_completed = True
        logger.info(
            "Auto-completed occurrence id=%s for event_id=%s on %s",
            occ.id, occ.event_id, yesterday,
        )

    if occs:
        db.commit()


def _auto_complete_template(
    db: Session,
    tpl: EventTaskTemplate,
    yesterday: date,
) -> None:
    link = (
        db.query(EventOccurrenceTask)
        .filter(
            EventOccurrenceTask.template_id == tpl.id,
            EventOccurrenceTask.occurrence_date == yesterday,
        )
        .first()
    )
    if not link:
        return

    try:
        CompleteTaskUseCase(db).execute(
            task_id=link.task_id,
            account_id=tpl.account_id,
            actor_user_id=tpl.account_id,
        )
        logger.info(
            "Auto-completed task_id=%s (template_id=%s, occurrence=%s, mode=%s)",
            link.task_id, tpl.id, yesterday, tpl.auto_complete_mode,
        )
    except Exception as e:
        logger.warning(
            "Could not auto-complete task_id=%s: %s", link.task_id, e
        )
