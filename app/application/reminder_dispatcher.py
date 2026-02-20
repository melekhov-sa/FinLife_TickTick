"""
Reminder dispatcher — checks due reminders and sends push notifications.

Usage (cron / systemd timer / manual):
    python -m app.application.reminder_dispatcher

Or call dispatch_due_reminders(db) from your own scheduler.
"""
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.infrastructure.db.models import (
    TaskModel, TaskReminderModel,
    EventOccurrenceModel, EventReminderModel,
    CalendarEventModel, PushSubscription, User,
)
from app.application.push_service import send_push_to_user

logger = logging.getLogger(__name__)
MSK = timezone(timedelta(hours=3))


def dispatch_due_reminders(db: Session) -> int:
    """
    Find all reminders that should fire now and send push notifications.

    Returns the number of push notifications successfully sent.
    """
    now_msk = datetime.now(MSK)
    total_sent = 0

    total_sent += _dispatch_task_reminders(db, now_msk)
    total_sent += _dispatch_event_reminders(db, now_msk)

    return total_sent


def _dispatch_task_reminders(db: Session, now_msk: datetime) -> int:
    """Send push for task reminders that are due."""
    sent = 0
    from sqlalchemy import or_

    # Find active tasks with due_date + time (DATETIME or WINDOW)
    tasks = (
        db.query(TaskModel)
        .filter(
            TaskModel.due_date.isnot(None),
            TaskModel.status == "ACTIVE",
            or_(
                TaskModel.due_time.isnot(None),        # DATETIME
                TaskModel.due_start_time.isnot(None),   # WINDOW
            ),
        )
        .all()
    )

    for task in tasks:
        # DATETIME uses due_time, WINDOW uses due_start_time as reference
        ref_time = task.due_time or task.due_start_time
        if not ref_time:
            continue
        due_dt = datetime.combine(task.due_date, ref_time, tzinfo=MSK)

        reminders = (
            db.query(TaskReminderModel)
            .filter(TaskReminderModel.task_id == task.task_id)
            .all()
        )

        for rem in reminders:
            fire_at = due_dt + timedelta(minutes=rem.offset_minutes)  # offset is <= 0
            # Fire if within the last 2 minutes (polling window)
            if fire_at <= now_msk and fire_at > now_msk - timedelta(minutes=2):
                n = send_push_to_user(db, task.account_id, {
                    "title": f"⏰ {task.title}",
                    "body": _format_task_time(due_dt, rem.offset_minutes),
                    "url": "/tasks",
                })
                sent += n

    return sent


def _dispatch_event_reminders(db: Session, now_msk: datetime) -> int:
    """Send push for calendar event reminders that are due."""
    sent = 0
    today = now_msk.date()
    tomorrow = today + timedelta(days=1)

    occs = (
        db.query(EventOccurrenceModel)
        .filter(
            EventOccurrenceModel.is_cancelled == False,
            EventOccurrenceModel.start_date >= today,
            EventOccurrenceModel.start_date <= tomorrow,
        )
        .all()
    )

    if not occs:
        return 0

    occ_map = {o.id: o for o in occs}
    occ_ids = list(occ_map.keys())

    reminders = (
        db.query(EventReminderModel)
        .filter(
            EventReminderModel.occurrence_id.in_(occ_ids),
            EventReminderModel.is_enabled == True,
        )
        .all()
    )

    # Load event titles
    event_ids = {o.event_id for o in occs}
    events = db.query(CalendarEventModel).filter(CalendarEventModel.event_id.in_(event_ids)).all()
    event_map = {e.event_id: e for e in events}

    for rem in reminders:
        occ = occ_map.get(rem.occurrence_id)
        if not occ:
            continue

        start_dt = _compute_start_dt(occ.start_date, occ.start_time)

        if rem.mode == "offset" and rem.offset_minutes is not None:
            fire_at = start_dt - timedelta(minutes=rem.offset_minutes)
        else:
            continue

        if fire_at <= now_msk and fire_at > now_msk - timedelta(minutes=2):
            event = event_map.get(occ.event_id)
            title = event.title if event else "Событие"
            time_str = occ.start_time.strftime("%H:%M") if occ.start_time else ""

            n = send_push_to_user(db, occ.account_id, {
                "title": f"📅 {title}",
                "body": f"Сегодня в {time_str}" if time_str else "Сегодня",
                "url": "/events",
            })
            sent += n

    return sent


def _format_task_time(due_dt: datetime, offset_minutes: int) -> str:
    time_str = due_dt.strftime("%H:%M")
    if offset_minutes == 0:
        return f"Сейчас ({time_str})"
    mins = abs(offset_minutes)
    if mins < 60:
        return f"Через {mins} мин ({time_str})"
    hours = mins // 60
    return f"Через {hours} ч ({time_str})"


def _compute_start_dt(start_date, start_time) -> datetime:
    if start_time:
        return datetime(
            start_date.year, start_date.month, start_date.day,
            start_time.hour, start_time.minute, 0,
            tzinfo=MSK,
        )
    return datetime(start_date.year, start_date.month, start_date.day, 0, 0, 0, tzinfo=MSK)


# ── CLI entry point ──
if __name__ == "__main__":
    import os
    os.environ.setdefault("DATABASE_URL", "postgresql://finlife:finlife_password_change_me@localhost:5432/finlife")

    from app.infrastructure.db.session import get_session_factory
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    SessionLocal = get_session_factory()
    db = SessionLocal()
    try:
        n = dispatch_due_reminders(db)
        logger.info("Dispatched %d push notification(s)", n)
    finally:
        db.close()
