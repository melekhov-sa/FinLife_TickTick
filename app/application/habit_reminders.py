"""
Evening habit streak reminders.

Runs hourly from 18:00 to 23:00 MSK (15:00–20:00 UTC).
Sends a push notification to users who have unfinished habits with an active streak.
"""
import logging
from datetime import date

from sqlalchemy.orm import Session

from app.application.push_service import send_push_to_user
from app.infrastructure.db.models import HabitModel, HabitOccurrence, User

logger = logging.getLogger(__name__)


def dispatch_habit_streak_reminders(db: Session) -> None:
    """Find users with at-risk streaks and push a reminder to each."""
    today = date.today()
    users = db.query(User).filter(User.is_active == True).all()  # noqa: E712
    for user in users:
        try:
            _remind_user(db, user.id, today)
        except Exception:
            logger.exception("habit_streak_reminder failed for user_id=%s", user.id)


def _remind_user(db: Session, user_id: int, today: date) -> None:
    # Pending habit occurrences for today
    pending = (
        db.query(HabitOccurrence)
        .filter(
            HabitOccurrence.account_id == user_id,
            HabitOccurrence.scheduled_date == today,
            HabitOccurrence.status != "DONE",
        )
        .all()
    )
    if not pending:
        return

    # Load habit models to check current_streak
    habit_ids = [occ.habit_id for occ in pending]
    habit_map: dict[int, HabitModel] = {
        h.habit_id: h
        for h in db.query(HabitModel).filter(HabitModel.habit_id.in_(habit_ids)).all()
    }

    at_risk = [
        (habit_map[occ.habit_id].title, habit_map[occ.habit_id].current_streak)
        for occ in pending
        if occ.habit_id in habit_map and (habit_map[occ.habit_id].current_streak or 0) > 0
    ]

    if not at_risk:
        return

    if len(at_risk) == 1:
        title_text, streak = at_risk[0]
        title = f"Серия под угрозой: {title_text}"
        body = f"{streak} дн. — выполни привычку до конца дня"
    else:
        names = ", ".join(t for t, _ in at_risk[:3])
        suffix = f" и ещё {len(at_risk) - 3}" if len(at_risk) > 3 else ""
        title = f"{len(at_risk)} привычки под угрозой"
        body = f"{names}{suffix} — серии прервутся"

    send_push_to_user(db, user_id, {"title": title, "body": body, "url": "/dashboard"})
    logger.info("Habit streak reminder sent to user_id=%s (%d at-risk)", user_id, len(at_risk))
