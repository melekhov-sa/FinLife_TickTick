"""
Напоминание оценить точность плана за закрытый месяц.

1-го числа: если за только что закрытый месяц остались неоценённые
недорасходы (после авто-«вписался» от закрытий их мало) — шлём
пуш + телеграм со ссылкой на «Точность плана».
"""
import logging
from datetime import date, datetime

from sqlalchemy.orm import Session

from app.infrastructure.db.models import User, CategoryInfo
from app.application.plan_accuracy import (
    classify, load_verdicts, load_closures, build_fact_plan_maps,
)
from app.application.push_service import send_push_to_user
from app.infrastructure.telegram import send_tg

logger = logging.getLogger(__name__)

_MONTHS_RU = [
    "январь", "февраль", "март", "апрель", "май", "июнь",
    "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
]


def _pending_count(db: Session, user_id: int, y: int, m: int) -> int:
    d_start = datetime(y, m, 1)
    d_end = datetime(y + (1 if m == 12 else 0), 1 if m == 12 else m + 1, 1)
    fact_map, plan_map, _, _ = build_fact_plan_maps(db, user_id, [(y, m)], d_start, d_end)
    verdicts = load_verdicts(db, user_id)
    closures = load_closures(db, user_id)
    cats = db.query(CategoryInfo).filter(
        CategoryInfo.account_id == user_id,
        CategoryInfo.category_type == "EXPENSE",
    ).all()
    pending = 0
    for cat in cats:
        plan = plan_map.get((y, m, cat.category_id, "EXPENSE"), 0.0)
        if plan <= 0:
            continue
        fact = fact_map.get((y, m, cat.category_id, "EXPENSE"), 0.0)
        if classify(plan, fact, verdicts.get((y, m, cat.category_id)),
                    (y, m, cat.category_id) in closures) == "pending":
            pending += 1
    return pending


def send_plan_accuracy_reminders(db: Session, today: date | None = None) -> int:
    """Для всех юзеров: напомнить оценить прошлый месяц. Возвращает число писем."""
    today = today or date.today()
    # только что закрытый месяц = предыдущий
    py = today.year - 1 if today.month == 1 else today.year
    pm = 12 if today.month == 1 else today.month - 1

    sent = 0
    for user in db.query(User).all():
        try:
            n = _pending_count(db, user.id, py, pm)
            if n <= 0:
                continue
            month_name = _MONTHS_RU[pm - 1]
            send_push_to_user(db, user.id, {
                "title": "Оцени точность плана",
                "body": f"{month_name.capitalize()}: {n} статей ждут оценки",
                "url": "/plan-accuracy",
            })
            send_tg(
                db, user.id,
                f"🎯 <b>Точность плана</b>\nЗа {month_name} ждут оценки: {n} статей.\nОткрой «Точность плана» и разметь.",
                "plan_accuracy_review",
            )
            sent += 1
        except Exception:
            logger.exception("Plan accuracy reminder failed for user_id=%s", user.id)
    return sent
