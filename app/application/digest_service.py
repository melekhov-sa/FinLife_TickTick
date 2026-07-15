"""
Daily digest push notifications — morning and evening summaries.

Morning (08:00 MSK): what's planned for today.
Evening (21:00 MSK): what was accomplished.
"""
import logging
from datetime import date

from sqlalchemy import distinct
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.infrastructure.db.models import User, PushSubscription, DigestDispatchLog
from app.application.occurrence_generator import OccurrenceGenerator
from app.application.dashboard import DashboardService
from app.application.push_service import send_push_to_user

logger = logging.getLogger(__name__)


def _get_tg_digest_user_ids(db: Session, morning: bool) -> list[int]:
    """Юзеры с подключённым Telegram и включённым флагом дайджеста."""
    from app.infrastructure.db.models import TelegramSettings
    field = User.digest_morning if morning else User.digest_evening
    rows = (
        db.query(distinct(TelegramSettings.user_id))
        .join(User, User.id == TelegramSettings.user_id)
        .filter(TelegramSettings.connected == True, field == True)  # noqa: E712
        .all()
    )
    return [r[0] for r in rows]


def _get_digest_user_ids(db: Session, morning: bool) -> list[int]:
    """
    Get user IDs that have push subscriptions and the digest flag enabled.
    """
    field = User.digest_morning if morning else User.digest_evening
    rows = (
        db.query(distinct(PushSubscription.user_id))
        .join(User, User.id == PushSubscription.user_id)
        .filter(field == True)  # noqa: E712
        .all()
    )
    return [r[0] for r in rows]


def send_morning_digest(db: Session) -> int:
    """
    Send morning digest to all opted-in users.
    Returns total number of push notifications sent.
    """
    user_ids = sorted(set(_get_digest_user_ids(db, morning=True))
                      | set(_get_tg_digest_user_ids(db, morning=True)))
    if not user_ids:
        logger.info("Morning digest: no users to notify")
        return 0

    today = date.today()
    total_sent = 0

    for user_id in user_ids:
        try:
            db.add(DigestDispatchLog(user_id=user_id, kind="morning", sent_date=today))
            db.commit()
        except IntegrityError:
            db.rollback()
            continue  # already dispatched today

        try:
            OccurrenceGenerator(db).generate_all(user_id)
            block = DashboardService(db).get_today_block(user_id, today)

            tasks_count = len(block["active"])
            overdue_count = len(block["overdue"])

            # Count items by kind
            habits = sum(1 for it in block["active"] if it["kind"] == "habit")
            events = sum(1 for it in block["active"] if it["kind"] == "event")
            tasks = tasks_count - habits - events

            if tasks_count == 0 and overdue_count == 0:
                body = "На сегодня дел нет — свободный день!"
            else:
                parts = []
                if tasks > 0:
                    parts.append(f"задач: {tasks}")
                if habits > 0:
                    parts.append(f"привычек: {habits}")
                if events > 0:
                    parts.append(f"событий: {events}")
                body = ", ".join(parts).capitalize()
                if overdue_count > 0:
                    body += f". Просрочено: {overdue_count}"

            n = send_push_to_user(db, user_id, {
                "title": "Доброе утро!",
                "body": body,
                "url": "/",
            })
            total_sent += n

            # Telegram-версия — с полным списком дел
            from app.infrastructure.telegram import send_tg
            tg_lines = ["☀️ <b>Доброе утро! План на сегодня</b>", ""]
            if not block["active"] and not block["overdue"]:
                tg_lines.append("Дел нет — свободный день!")
            for it in block["active"][:15]:
                t = it.get("time") or it.get("task_time")
                tg_lines.append(f"• {it.get('title', '?')}" + (f" <i>({t})</i>" if t else ""))
            if len(block["active"]) > 15:
                tg_lines.append(f"…и ещё {len(block['active']) - 15}")
            if block["overdue"]:
                tg_lines.append("")
                tg_lines.append(f"⚠️ Просрочено: {len(block['overdue'])}")
                for it in block["overdue"][:5]:
                    tg_lines.append(f"• {it.get('title', '?')}")
            send_tg(db, user_id, "\n".join(tg_lines), "digest_morning")
        except Exception:
            logger.exception("Morning digest failed for user %d", user_id)

    logger.info("Morning digest: sent %d notification(s) to %d user(s)", total_sent, len(user_ids))
    return total_sent


def send_evening_digest(db: Session) -> int:
    """
    Send evening digest to all opted-in users.
    Returns total number of push notifications sent.
    """
    user_ids = sorted(set(_get_digest_user_ids(db, morning=False))
                      | set(_get_tg_digest_user_ids(db, morning=False)))
    if not user_ids:
        logger.info("Evening digest: no users to notify")
        return 0

    today = date.today()
    total_sent = 0

    for user_id in user_ids:
        try:
            db.add(DigestDispatchLog(user_id=user_id, kind="evening", sent_date=today))
            db.commit()
        except IntegrityError:
            db.rollback()
            continue  # already dispatched today

        try:
            block = DashboardService(db).get_today_block(user_id, today)
            progress = block["progress"]
            overdue_count = len(block["overdue"])

            total = progress["total"]
            done = progress["done"]
            left = progress["left"]

            if total == 0:
                continue  # nothing was planned, skip

            if left == 0 and overdue_count == 0:
                body = f"Все {done} дел выполнены! Отличный день"
            else:
                body = f"Выполнено {done} из {total}"
                if overdue_count > 0:
                    body += f", просрочено: {overdue_count}"
                if left > 0:
                    body += f". Осталось: {left}"

            n = send_push_to_user(db, user_id, {
                "title": "Итоги дня",
                "body": body,
                "url": "/",
            })
            total_sent += n

            from app.infrastructure.telegram import send_tg
            send_tg(db, user_id, f"🌙 <b>Итоги дня</b>\n{body}", "digest_evening")
        except Exception:
            logger.exception("Evening digest failed for user %d", user_id)

    logger.info("Evening digest: sent %d notification(s) to %d user(s)", total_sent, len(user_ids))
    return total_sent
