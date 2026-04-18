"""
Reminder dispatcher — checks due reminders and sends push notifications.

Usage (cron / systemd timer / manual):
    python -m app.application.reminder_dispatcher

Or call dispatch_due_reminders(db) from your own scheduler.
"""
import logging
import requests
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from datetime import time as _time

from app.infrastructure.db.models import (
    TaskModel, TaskReminderModel,
    EventOccurrenceModel, EventReminderModel,
    CalendarEventModel, PushSubscription, User,
    HabitModel, HabitOccurrence,
    TelegramSettings, UserNotificationSettings,
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
    total_sent += _dispatch_habit_reminders(db, now_msk)
    total_sent += _dispatch_hourly_summary(db, now_msk)

    return total_sent


def _dispatch_task_reminders(db: Session, now_msk: datetime) -> int:
    """Send push for task reminders that are due."""
    sent = 0
    from sqlalchemy import or_

    # Find active tasks with a due_date (any kind)
    tasks = (
        db.query(TaskModel)
        .filter(
            TaskModel.due_date.isnot(None),
            TaskModel.status == "ACTIVE",
        )
        .all()
    )

    for task in tasks:
        reminders = (
            db.query(TaskReminderModel)
            .filter(TaskReminderModel.task_id == task.task_id)
            .all()
        )

        for rem in reminders:
            kind = getattr(rem, "reminder_kind", "OFFSET")

            if kind == "DAY_TIME":
                # offset_minutes = minutes since midnight
                hour, minute = divmod(rem.offset_minutes, 60)
                fire_at = datetime.combine(
                    task.due_date, _time(hour, minute), tzinfo=MSK
                )
                if fire_at <= now_msk and fire_at > now_msk - timedelta(minutes=2):
                    n = send_push_to_user(db, task.account_id, {
                        "title": f"⏰ {task.title}",
                        "body": f"Напоминание ({hour:02d}:{minute:02d})",
                        "url": "/tasks",
                    })
                    sent += n
            else:
                # OFFSET kind — requires a specific time (DATETIME or WINDOW)
                ref_time = task.due_time or task.due_start_time
                if not ref_time:
                    continue
                due_dt = datetime.combine(task.due_date, ref_time, tzinfo=MSK)
                fire_at = due_dt + timedelta(minutes=rem.offset_minutes)  # offset is <= 0
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


def _dispatch_habit_reminders(db: Session, now_msk: datetime) -> int:
    """Send push for habit reminders that are due today."""
    sent = 0
    today = now_msk.date()

    # Find active habits with a reminder_time set
    habits = (
        db.query(HabitModel)
        .filter(
            HabitModel.is_archived == False,
            HabitModel.reminder_time.isnot(None),
        )
        .all()
    )

    if not habits:
        return 0

    habit_ids = [h.habit_id for h in habits]

    # Find today's ACTIVE occurrences for these habits (not yet done)
    active_occs = (
        db.query(HabitOccurrence)
        .filter(
            HabitOccurrence.habit_id.in_(habit_ids),
            HabitOccurrence.scheduled_date == today,
            HabitOccurrence.status == "ACTIVE",
        )
        .all()
    )
    active_habit_ids = {occ.habit_id for occ in active_occs}

    for habit in habits:
        if habit.habit_id not in active_habit_ids:
            continue

        fire_at = datetime.combine(today, habit.reminder_time, tzinfo=MSK)
        if fire_at <= now_msk and fire_at > now_msk - timedelta(minutes=2):
            n = send_push_to_user(db, habit.account_id, {
                "title": f"\U0001f504 {habit.title}",
                "body": "Пора выполнить привычку",
                "url": "/habits",
            })
            sent += n

    return sent


def _in_quiet_hours(now_time: _time, settings: UserNotificationSettings | None) -> bool:
    """Return True if now_time falls within the user's quiet hours window."""
    if not settings or not settings.quiet_start or not settings.quiet_end:
        return False
    s, e = settings.quiet_start, settings.quiet_end
    if s <= e:
        return s <= now_time <= e
    # Overnight range (e.g. 22:00–08:00)
    return now_time >= s or now_time <= e


def _dispatch_hourly_summary(db: Session, now_msk: datetime) -> int:
    """
    Every hour, collect all unfinished items for each user and send ONE grouped
    Telegram message listing:

    • Tasks overdue (due_date < today) or past their due_time today
    • Habits with deadline_time whose today's occurrence is still ACTIVE
      and whose nudge window [reminder_time, deadline_time) includes the current hour

    Respects each user's quiet-hours setting.
    Returns the number of messages successfully sent.
    """
    # Only fire at exact hour boundaries (within the 2-minute dispatcher window)
    hour_boundary = now_msk.replace(minute=0, second=0, microsecond=0)
    if not (hour_boundary <= now_msk < hour_boundary + timedelta(minutes=2)):
        return 0

    today = now_msk.date()
    current_hour = hour_boundary.time()

    # Iterate every user that has Telegram connected
    tg_list = db.query(TelegramSettings).filter_by(connected=True).all()
    if not tg_list:
        return 0

    from app.infrastructure.crypto import decrypt
    sent = 0
    for tg in tg_list:
        if not tg.chat_id or not tg.bot_token:
            continue
        bot_token = decrypt(tg.bot_token)
        chat_id = decrypt(tg.chat_id)
        if not bot_token or not chat_id:
            continue

        notif_settings = db.query(UserNotificationSettings).filter_by(user_id=tg.user_id).first()
        if _in_quiet_hours(current_hour, notif_settings):
            continue

        user_id = tg.user_id

        # ── Pending habits ─────────────────────────────────────────────────
        pending_habits: list[HabitModel] = []
        habits = (
            db.query(HabitModel)
            .filter(
                HabitModel.account_id == user_id,
                HabitModel.is_archived == False,
                HabitModel.deadline_time.isnot(None),
            )
            .all()
        )
        if habits:
            active_occ_ids = {
                occ.habit_id
                for occ in db.query(HabitOccurrence).filter(
                    HabitOccurrence.habit_id.in_([h.habit_id for h in habits]),
                    HabitOccurrence.scheduled_date == today,
                    HabitOccurrence.status == "ACTIVE",
                ).all()
            }
            for h in habits:
                if h.habit_id not in active_occ_ids:
                    continue
                window_start = h.reminder_time if h.reminder_time is not None else _time(0, 0)
                if window_start <= current_hour < h.deadline_time:
                    pending_habits.append(h)

        # ── Pending tasks ──────────────────────────────────────────────────
        pending_tasks: list[TaskModel] = []

        # Overdue — strictly before today
        overdue = (
            db.query(TaskModel)
            .filter(
                TaskModel.account_id == user_id,
                TaskModel.status == "ACTIVE",
                TaskModel.due_date.isnot(None),
                TaskModel.due_date < today,
            )
            .all()
        )
        pending_tasks.extend(overdue)

        # Due today — include once their due_time (or window start) has passed
        today_tasks = (
            db.query(TaskModel)
            .filter(
                TaskModel.account_id == user_id,
                TaskModel.status == "ACTIVE",
                TaskModel.due_date == today,
            )
            .all()
        )
        for t in today_tasks:
            task_time = t.due_time or t.due_start_time
            if task_time is None or task_time <= current_hour:
                pending_tasks.append(t)

        if not pending_habits and not pending_tasks:
            continue

        # ── Build grouped message ──────────────────────────────────────────
        lines = [f"⏰ <b>Не выполнено ({current_hour.strftime('%H:%M')})</b>"]

        if pending_tasks:
            lines.append("")
            lines.append("📋 <b>Задачи:</b>")
            for t in pending_tasks:
                if t.due_date < today:
                    days = (today - t.due_date).days
                    lines.append(f"• {t.title} <i>(просрочена {days} дн.)</i>")
                else:
                    task_time = t.due_time or t.due_start_time
                    suffix = f" <i>(до {task_time.strftime('%H:%M')})</i>" if task_time else ""
                    lines.append(f"• {t.title}{suffix}")

        if pending_habits:
            lines.append("")
            lines.append("🔄 <b>Привычки:</b>")
            for h in pending_habits:
                lines.append(f"• {h.title} <i>(до {h.deadline_time.strftime('%H:%M')})</i>")

        text = "\n".join(lines)
        try:
            resp = requests.post(
                f"https://api.telegram.org/bot{bot_token}/sendMessage",
                json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
                timeout=5,
            )
            if resp.status_code == 200:
                sent += 1
        except Exception:
            logger.exception("Hourly summary Telegram send failed for user_id=%s", user_id)

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
