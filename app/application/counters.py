"""Counter service — arbitrary counters with manual or auto-linked modes."""
from __future__ import annotations

from datetime import date, timedelta
from calendar import monthrange

from sqlalchemy import func, cast, Date
from sqlalchemy.orm import Session

from app.infrastructure.db.models import (
    CounterModel, CounterEntryModel,
    CalendarEventModel, EventOccurrenceModel,
    TaskModel, TaskTemplateModel, TaskOccurrence,
)

RUSSIAN_MONTHS = [
    "", "январь", "февраль", "март", "апрель", "май", "июнь",
    "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
]
RUSSIAN_MONTHS_GENITIVE = [
    "", "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
]


def _period_bounds(period_type: str, today: date) -> tuple[date, date]:
    """Return (start, end) for the current period."""
    if period_type == "month":
        start = today.replace(day=1)
        last = monthrange(today.year, today.month)[1]
        end = today.replace(day=last)
    else:  # year
        start = date(today.year, 1, 1)
        end = date(today.year, 12, 31)
    return start, end


def _previous_period_bounds(period_type: str, today: date) -> tuple[date, date]:
    """Return (start, end) for the comparison period (1 year back)."""
    if period_type == "month":
        start = today.replace(year=today.year - 1, day=1)
        last = monthrange(today.year - 1, today.month)[1]
        end = today.replace(year=today.year - 1, day=last)
    else:  # year
        start = date(today.year - 1, 1, 1)
        end = date(today.year - 1, 12, 31)
    return start, end


def _period_label(period_type: str, today: date, offset_years: int = 0) -> str:
    year = today.year - offset_years
    if period_type == "month":
        return f"{RUSSIAN_MONTHS[today.month].capitalize()} {year}"
    return str(year)


def _count_events(db: Session, account_id: int, category_id: int, start: date, end: date, today: date) -> int:
    upper = min(end, today - timedelta(days=1))
    if upper < start:
        return 0
    return (
        db.query(func.count(EventOccurrenceModel.id))
        .join(CalendarEventModel, CalendarEventModel.event_id == EventOccurrenceModel.event_id)
        .filter(
            CalendarEventModel.account_id == account_id,
            CalendarEventModel.category_id == category_id,
            EventOccurrenceModel.is_cancelled == False,  # noqa: E712
            EventOccurrenceModel.start_date >= start,
            EventOccurrenceModel.start_date <= upper,
        )
        .scalar() or 0
    )


def _count_tasks(db: Session, account_id: int, category_id: int, start: date, end: date) -> int:
    # One-off tasks
    one_off = (
        db.query(func.count(TaskModel.task_id))
        .filter(
            TaskModel.account_id == account_id,
            TaskModel.category_id == category_id,
            TaskModel.status == "DONE",
            cast(TaskModel.completed_at, Date) >= start,
            cast(TaskModel.completed_at, Date) <= end,
        )
        .scalar() or 0
    )
    # Recurring task occurrences (join template for category)
    recurring = (
        db.query(func.count(TaskOccurrence.id))
        .join(TaskTemplateModel, TaskTemplateModel.template_id == TaskOccurrence.template_id)
        .filter(
            TaskTemplateModel.account_id == account_id,
            TaskTemplateModel.category_id == category_id,
            TaskOccurrence.status == "DONE",
            cast(TaskOccurrence.completed_at, Date) >= start,
            cast(TaskOccurrence.completed_at, Date) <= end,
        )
        .scalar() or 0
    )
    return one_off + recurring


def _count_manual(db: Session, counter_id: int, start: date, end: date) -> int:
    result = (
        db.query(func.coalesce(func.sum(CounterEntryModel.delta), 0))
        .filter(
            CounterEntryModel.counter_id == counter_id,
            CounterEntryModel.recorded_date >= start,
            CounterEntryModel.recorded_date <= end,
        )
        .scalar()
    )
    return int(result or 0)


def compute_stats(db: Session, counter: CounterModel, today: date) -> dict:
    start, end = _period_bounds(counter.period_type, today)
    prev_start, prev_end = _previous_period_bounds(counter.period_type, today)

    if counter.mode == "auto_event" and counter.source_category_id:
        current = _count_events(db, counter.account_id, counter.source_category_id, start, end, today)
        previous = _count_events(db, counter.account_id, counter.source_category_id, prev_start, prev_end, today)
    elif counter.mode == "auto_task" and counter.source_category_id:
        current = _count_tasks(db, counter.account_id, counter.source_category_id, start, end)
        previous = _count_tasks(db, counter.account_id, counter.source_category_id, prev_start, prev_end)
    else:
        current = _count_manual(db, counter.id, start, end)
        previous = _count_manual(db, counter.id, prev_start, prev_end)

    return {
        "current_count": current,
        "previous_count": previous,
        "current_label": _period_label(counter.period_type, today, 0),
        "previous_label": _period_label(counter.period_type, today, 1),
    }
