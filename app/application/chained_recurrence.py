"""
Цепочечные повторения: следующая задача через N после выполнения предыдущей.

Зачем отдельно от OccurrenceGenerator. Календарные повторения порождают даты
пачкой на окно вперёд, и если дело не сделано в срок, вхождения продолжают
появляться — копится просрочка (подорожник, который продлевают не день в день,
замена расходников раз в пару месяцев). Здесь ровно наоборот: вперёд не
создаётся ничего, в любой момент активно не больше одного вхождения, а дата
следующего отмеряется от фактического закрытия текущего.

Единица берётся из freq правила (день/неделя/месяц/год), количество — из
interval. Месяцы и годы считаются календарно: см. shift_by_freq.
"""
import logging
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.domain.recurrence import CHAINABLE_FREQ, shift_by_freq
from app.infrastructure.db.models import (
    RecurrenceRuleModel,
    TaskOccurrence,
    TaskTemplateModel,
)

logger = logging.getLogger(__name__)

ANCHOR_COMPLETION = "COMPLETION"
ANCHOR_SCHEDULE = "SCHEDULE"

# Дата следующего вхождения может оказаться занятой: у шаблона уже есть строка
# на этот день (например, он раньше работал по календарю). Ищем ближайший
# свободный день вперёд — потолок, чтобы не уехать в бесконечность.
MAX_DATE_PROBE_DAYS = 31


def _local_today() -> date:
    return datetime.now(ZoneInfo(get_settings().TIMEZONE)).date()


def _anchor_date(occ: TaskOccurrence) -> date:
    """День, от которого отмеряется срок, — когда дело фактически закрыто."""
    if occ.completed_at is None:
        return _local_today()
    completed = occ.completed_at
    if completed.tzinfo is None:
        return completed.date()
    return completed.astimezone(ZoneInfo(get_settings().TIMEZONE)).date()


def _first_free_date(db: Session, account_id: int, template_id: int, target: date) -> date | None:
    """Первый день начиная с target, на который у шаблона ещё нет вхождения."""
    horizon = target + timedelta(days=MAX_DATE_PROBE_DAYS)
    taken = {
        row.scheduled_date
        for row in db.query(TaskOccurrence.scheduled_date).filter(
            TaskOccurrence.account_id == account_id,
            TaskOccurrence.template_id == template_id,
            TaskOccurrence.scheduled_date >= target,
            TaskOccurrence.scheduled_date <= horizon,
        ).all()
    }
    d = target
    while d <= horizon:
        if d not in taken:
            return d
        d += timedelta(days=1)
    return None


def seed_first_occurrence(
    db: Session,
    account_id: int,
    template_id: int,
    start_date: date,
) -> TaskOccurrence | None:
    """Первое звено цепочки при создании шаблона.

    OccurrenceGenerator цепочечные шаблоны пропускает, поэтому без этого
    у только что созданной задачи не было бы ни одного вхождения.
    Идемпотентна: если вхождение уже есть, ничего не делает.
    """
    existing = db.query(TaskOccurrence.id).filter(
        TaskOccurrence.account_id == account_id,
        TaskOccurrence.template_id == template_id,
    ).first()
    if existing is not None:
        return None

    occ = TaskOccurrence(
        account_id=account_id,
        template_id=template_id,
        scheduled_date=start_date,
        status="ACTIVE",
    )
    try:
        with db.begin_nested():
            db.add(occ)
            db.flush()
    except IntegrityError:
        return None
    db.commit()
    return occ


def ensure_next_after_completion(
    db: Session,
    account_id: int,
    occurrence_id: int,
) -> TaskOccurrence | None:
    """Создать следующее вхождение цепочки после закрытия текущего.

    Идемпотентна: если у шаблона осталось хоть одно активное вхождение,
    не делает ничего. Это же условие аккуратно обрабатывает случай, когда
    режим включили у задачи с накопленным хвостом просрочки — цепочка
    заработает, когда хвост разгребут.

    Возвращает созданное вхождение или None, если создавать нечего.
    """
    occ = db.query(TaskOccurrence).filter(
        TaskOccurrence.id == occurrence_id,
        TaskOccurrence.account_id == account_id,
    ).first()
    if occ is None:
        return None

    tmpl = db.query(TaskTemplateModel).filter(
        TaskTemplateModel.template_id == occ.template_id,
        TaskTemplateModel.account_id == account_id,
    ).first()
    if tmpl is None or tmpl.is_archived:
        return None

    rule = db.query(RecurrenceRuleModel).filter(
        RecurrenceRuleModel.rule_id == tmpl.rule_id
    ).first()
    if rule is None or rule.anchor != ANCHOR_COMPLETION:
        return None
    if rule.freq not in CHAINABLE_FREQ:
        logger.warning(
            "chained rule %s has non-chainable freq %s; skipping", rule.rule_id, rule.freq
        )
        return None

    still_active = db.query(TaskOccurrence.id).filter(
        TaskOccurrence.account_id == account_id,
        TaskOccurrence.template_id == tmpl.template_id,
        TaskOccurrence.status == "ACTIVE",
    ).first()
    if still_active is not None:
        return None

    target = shift_by_freq(_anchor_date(occ), rule.freq, rule.interval)

    # Повторение могли ограничить по дате — уважаем обе границы.
    if rule.until_date and target > rule.until_date:
        return None
    if tmpl.active_until and target > tmpl.active_until:
        return None

    scheduled = _first_free_date(db, account_id, tmpl.template_id, target)
    if scheduled is None:
        logger.warning(
            "no free date for chained template %s near %s", tmpl.template_id, target
        )
        return None

    nxt = TaskOccurrence(
        account_id=account_id,
        template_id=tmpl.template_id,
        scheduled_date=scheduled,
        status="ACTIVE",
    )
    try:
        with db.begin_nested():  # SAVEPOINT: гонка двух закрытий подряд
            db.add(nxt)
            db.flush()
    except IntegrityError:
        return None
    db.commit()
    return nxt
