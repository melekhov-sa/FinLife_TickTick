"""
Plan Timeline — aggregator view combining tasks, events, planned operations, habits.

Pure read-layer: no domain events, no projectors, no mutations.
"""
from datetime import date, time, timedelta
from decimal import Decimal
from collections import defaultdict
from typing import Any

from sqlalchemy import func, or_, and_
from sqlalchemy.orm import Session

from app.infrastructure.db.models import (
    TaskModel, TaskTemplateModel, TaskOccurrence,
    HabitModel, HabitOccurrence,
    OperationTemplateModel, OperationOccurrence,
    CalendarEventModel, EventOccurrenceModel,
    WorkCategory,
)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

KIND_SORT = {"event": 1, "task": 2, "task_occ": 2, "planned_op": 3, "habit": 4}
_TIME_MAX = time(23, 59, 59)

WEEKDAY_SHORT = {0: "Пн", 1: "Вт", 2: "Ср", 3: "Чт", 4: "Пт", 5: "Сб", 6: "Вс"}
MONTH_GEN = {
    1: "янв", 2: "фев", 3: "мар", 4: "апр", 5: "мая", 6: "июн",
    7: "июл", 8: "авг", 9: "сен", 10: "окт", 11: "ноя", 12: "дек",
}

OP_KIND_LABEL = {"INCOME": "Доход", "EXPENSE": "Расход", "TRANSFER": "Перевод"}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_plan_view(
    db: Session,
    account_id: int,
    today: date,
    tab: str = "active",
    range_days: int = 7,
) -> dict:
    """Build the complete Plan view model for template rendering."""

    date_from = today
    date_to = today + timedelta(days=range_days - 1)

    # Pre-fetch work categories map
    wc_map = _load_wc_map(db, account_id)

    # Collect all items
    items: list[dict] = []

    items.extend(_query_oneoff_tasks(db, account_id, today, tab, date_from, date_to, wc_map))
    items.extend(_query_task_occurrences(db, account_id, today, tab, date_from, date_to, wc_map))
    items.extend(_query_event_occurrences(db, account_id, today, tab, date_from, date_to, wc_map))
    items.extend(_query_operation_occurrences(db, account_id, today, tab, date_from, date_to, wc_map))
    items.extend(_query_habit_occurrences(db, account_id, today, tab, wc_map))

    # Summary (always computed from "active" perspective)
    summary = _compute_summary(db, account_id, today, wc_map)

    # Today progress
    today_progress = _compute_today_progress(items, today)

    # Group by date
    day_groups = _group_by_date(items, today)

    return {
        "tab": tab,
        "range_days": range_days,
        "today": today,
        "summary": summary,
        "today_progress": today_progress,
        "day_groups": day_groups,
    }


# ---------------------------------------------------------------------------
# Work categories helper
# ---------------------------------------------------------------------------

def _load_wc_map(db: Session, account_id: int) -> dict[int, Any]:
    wcs = db.query(WorkCategory).filter(WorkCategory.account_id == account_id).all()
    return {wc.category_id: wc for wc in wcs}


def _wc_emoji(wc_map: dict, cat_id: int | None) -> str | None:
    if cat_id and cat_id in wc_map:
        return wc_map[cat_id].emoji
    return None


def _wc_title(wc_map: dict, cat_id: int | None) -> str | None:
    if cat_id and cat_id in wc_map:
        return wc_map[cat_id].title
    return None


# ---------------------------------------------------------------------------
# Query: One-off tasks
# ---------------------------------------------------------------------------

def _query_oneoff_tasks(
    db: Session, account_id: int, today: date,
    tab: str, date_from: date, date_to: date,
    wc_map: dict,
) -> list[dict]:
    items: list[dict] = []

    if tab == "active":
        # In-range: due_date between date_from and date_to, OR due_date IS NULL
        rows = db.query(TaskModel).filter(
            TaskModel.account_id == account_id,
            TaskModel.status == "ACTIVE",
            or_(
                and_(TaskModel.due_date >= date_from, TaskModel.due_date <= date_to),
                TaskModel.due_date == None,  # noqa: E711
            ),
        ).all()
        for t in rows:
            items.append(_task_to_item(t, today, wc_map))

        # Overdue: due_date < today
        overdue = db.query(TaskModel).filter(
            TaskModel.account_id == account_id,
            TaskModel.status == "ACTIVE",
            TaskModel.due_date != None,  # noqa: E711
            TaskModel.due_date < today,
        ).all()
        for t in overdue:
            items.append(_task_to_item(t, today, wc_map))

    elif tab == "done":
        rows = db.query(TaskModel).filter(
            TaskModel.account_id == account_id,
            TaskModel.status == "DONE",
        ).all()
        # Filter by completed_at date if available, else show all
        for t in rows:
            cdate = t.completed_at.date() if t.completed_at else None
            if cdate and date_from <= cdate <= date_to:
                items.append(_task_to_item(t, today, wc_map))
            elif not cdate:
                items.append(_task_to_item(t, today, wc_map))

    elif tab == "archive":
        rows = db.query(TaskModel).filter(
            TaskModel.account_id == account_id,
            TaskModel.status == "ARCHIVED",
        ).all()
        for t in rows:
            items.append(_task_to_item(t, today, wc_map))

    return items


def _task_to_item(t: TaskModel, today: date, wc_map: dict) -> dict:
    d = t.due_date or today
    is_overdue = t.status == "ACTIVE" and t.due_date is not None and t.due_date < today
    return {
        "kind": "task",
        "id": t.task_id,
        "title": t.title,
        "date": d,
        "time": None,
        "is_done": t.status == "DONE",
        "is_overdue": is_overdue,
        "status": t.status,
        "category_emoji": _wc_emoji(wc_map, t.category_id),
        "category_title": _wc_title(wc_map, t.category_id),
        "meta": {"task_id": t.task_id},
    }


# ---------------------------------------------------------------------------
# Query: Task occurrences (recurring)
# ---------------------------------------------------------------------------

def _query_task_occurrences(
    db: Session, account_id: int, today: date,
    tab: str, date_from: date, date_to: date,
    wc_map: dict,
) -> list[dict]:
    items: list[dict] = []
    tmpl_cache: dict[int, TaskTemplateModel] = {}

    def _get_tmpl(template_id: int) -> TaskTemplateModel | None:
        if template_id not in tmpl_cache:
            tmpl_cache[template_id] = db.query(TaskTemplateModel).filter(
                TaskTemplateModel.template_id == template_id
            ).first()
        return tmpl_cache[template_id]

    if tab == "active":
        # In-range
        rows = db.query(TaskOccurrence).filter(
            TaskOccurrence.account_id == account_id,
            TaskOccurrence.status == "ACTIVE",
            TaskOccurrence.scheduled_date >= date_from,
            TaskOccurrence.scheduled_date <= date_to,
        ).all()
        for occ in rows:
            tmpl = _get_tmpl(occ.template_id)
            if tmpl and not tmpl.is_archived:
                items.append(_task_occ_to_item(occ, tmpl, today, wc_map))

        # Overdue
        overdue = db.query(TaskOccurrence).filter(
            TaskOccurrence.account_id == account_id,
            TaskOccurrence.status == "ACTIVE",
            TaskOccurrence.scheduled_date < today,
        ).all()
        for occ in overdue:
            tmpl = _get_tmpl(occ.template_id)
            if tmpl and not tmpl.is_archived:
                items.append(_task_occ_to_item(occ, tmpl, today, wc_map))

    elif tab == "done":
        rows = db.query(TaskOccurrence).filter(
            TaskOccurrence.account_id == account_id,
            TaskOccurrence.status == "DONE",
            TaskOccurrence.scheduled_date >= date_from,
            TaskOccurrence.scheduled_date <= date_to,
        ).all()
        for occ in rows:
            tmpl = _get_tmpl(occ.template_id)
            if tmpl:
                items.append(_task_occ_to_item(occ, tmpl, today, wc_map))

    elif tab == "archive":
        # All occurrences from archived templates
        rows = db.query(TaskOccurrence).filter(
            TaskOccurrence.account_id == account_id,
        ).all()
        for occ in rows:
            tmpl = _get_tmpl(occ.template_id)
            if tmpl and tmpl.is_archived:
                items.append(_task_occ_to_item(occ, tmpl, today, wc_map))

    return items


def _task_occ_to_item(occ: TaskOccurrence, tmpl: TaskTemplateModel, today: date, wc_map: dict) -> dict:
    is_overdue = occ.status == "ACTIVE" and occ.scheduled_date < today
    return {
        "kind": "task_occ",
        "id": occ.id,
        "title": tmpl.title,
        "date": occ.scheduled_date,
        "time": None,
        "is_done": occ.status == "DONE",
        "is_overdue": is_overdue,
        "status": occ.status,
        "category_emoji": _wc_emoji(wc_map, tmpl.category_id),
        "category_title": _wc_title(wc_map, tmpl.category_id),
        "meta": {"occurrence_id": occ.id, "template_id": occ.template_id},
    }


# ---------------------------------------------------------------------------
# Query: Event occurrences
# ---------------------------------------------------------------------------

def _query_event_occurrences(
    db: Session, account_id: int, today: date,
    tab: str, date_from: date, date_to: date,
    wc_map: dict,
) -> list[dict]:
    items: list[dict] = []
    ev_cache: dict[int, CalendarEventModel] = {}

    def _get_ev(event_id: int) -> CalendarEventModel | None:
        if event_id not in ev_cache:
            ev_cache[event_id] = db.query(CalendarEventModel).filter(
                CalendarEventModel.event_id == event_id
            ).first()
        return ev_cache[event_id]

    if tab == "active":
        rows = db.query(EventOccurrenceModel).filter(
            EventOccurrenceModel.account_id == account_id,
            EventOccurrenceModel.is_cancelled == False,  # noqa: E712
            or_(
                and_(
                    EventOccurrenceModel.start_date >= date_from,
                    EventOccurrenceModel.start_date <= date_to,
                ),
                and_(
                    EventOccurrenceModel.start_date <= date_to,
                    EventOccurrenceModel.end_date != None,  # noqa: E711
                    EventOccurrenceModel.end_date >= date_from,
                ),
            ),
        ).all()
        for occ in rows:
            ev = _get_ev(occ.event_id)
            if ev and ev.is_active:
                items.append(_event_occ_to_item(occ, ev, wc_map))

    elif tab == "done":
        # Past events = "done"
        rows = db.query(EventOccurrenceModel).filter(
            EventOccurrenceModel.account_id == account_id,
            EventOccurrenceModel.is_cancelled == False,  # noqa: E712
            EventOccurrenceModel.start_date < today,
            or_(
                EventOccurrenceModel.end_date == None,  # noqa: E711
                EventOccurrenceModel.end_date < today,
            ),
        ).all()
        for occ in rows:
            ev = _get_ev(occ.event_id)
            if ev and ev.is_active:
                items.append(_event_occ_to_item(occ, ev, wc_map))

    elif tab == "archive":
        rows = db.query(EventOccurrenceModel).filter(
            EventOccurrenceModel.account_id == account_id,
        ).all()
        for occ in rows:
            ev = _get_ev(occ.event_id)
            if ev and not ev.is_active:
                items.append(_event_occ_to_item(occ, ev, wc_map))

    return items


def _event_occ_to_item(occ: EventOccurrenceModel, ev: CalendarEventModel, wc_map: dict) -> dict:
    return {
        "kind": "event",
        "id": occ.id,
        "title": ev.title,
        "date": occ.start_date,
        "time": occ.start_time,
        "is_done": False,  # events don't have an explicit "done" state
        "is_overdue": False,  # events are NEVER overdue
        "status": "CANCELLED" if occ.is_cancelled else "ACTIVE",
        "category_emoji": _wc_emoji(wc_map, ev.category_id),
        "category_title": _wc_title(wc_map, ev.category_id),
        "meta": {
            "occurrence_id": occ.id,
            "event_id": occ.event_id,
            "importance": ev.importance,
            "start_time": occ.start_time,
            "end_date": occ.end_date,
            "end_time": occ.end_time,
        },
    }


# ---------------------------------------------------------------------------
# Query: Operation occurrences (planned financial operations)
# ---------------------------------------------------------------------------

def _query_operation_occurrences(
    db: Session, account_id: int, today: date,
    tab: str, date_from: date, date_to: date,
    wc_map: dict,
) -> list[dict]:
    items: list[dict] = []
    tmpl_cache: dict[int, OperationTemplateModel] = {}

    def _get_tmpl(template_id: int) -> OperationTemplateModel | None:
        if template_id not in tmpl_cache:
            tmpl_cache[template_id] = db.query(OperationTemplateModel).filter(
                OperationTemplateModel.template_id == template_id
            ).first()
        return tmpl_cache[template_id]

    if tab == "active":
        # In-range
        rows = db.query(OperationOccurrence).filter(
            OperationOccurrence.account_id == account_id,
            OperationOccurrence.status == "ACTIVE",
            OperationOccurrence.scheduled_date >= date_from,
            OperationOccurrence.scheduled_date <= date_to,
        ).all()
        for occ in rows:
            tmpl = _get_tmpl(occ.template_id)
            if tmpl and not tmpl.is_archived:
                items.append(_op_occ_to_item(occ, tmpl, today, wc_map))

        # Overdue
        overdue = db.query(OperationOccurrence).filter(
            OperationOccurrence.account_id == account_id,
            OperationOccurrence.status == "ACTIVE",
            OperationOccurrence.scheduled_date < today,
        ).all()
        for occ in overdue:
            tmpl = _get_tmpl(occ.template_id)
            if tmpl and not tmpl.is_archived:
                items.append(_op_occ_to_item(occ, tmpl, today, wc_map))

    elif tab == "done":
        rows = db.query(OperationOccurrence).filter(
            OperationOccurrence.account_id == account_id,
            OperationOccurrence.status == "DONE",
            OperationOccurrence.scheduled_date >= date_from,
            OperationOccurrence.scheduled_date <= date_to,
        ).all()
        for occ in rows:
            tmpl = _get_tmpl(occ.template_id)
            if tmpl:
                items.append(_op_occ_to_item(occ, tmpl, today, wc_map))

    elif tab == "archive":
        rows = db.query(OperationOccurrence).filter(
            OperationOccurrence.account_id == account_id,
        ).all()
        for occ in rows:
            tmpl = _get_tmpl(occ.template_id)
            if tmpl and tmpl.is_archived:
                items.append(_op_occ_to_item(occ, tmpl, today, wc_map))

    return items


def _op_occ_to_item(occ: OperationOccurrence, tmpl: OperationTemplateModel, today: date, wc_map: dict) -> dict:
    is_overdue = occ.status == "ACTIVE" and occ.scheduled_date < today
    return {
        "kind": "planned_op",
        "id": occ.id,
        "title": tmpl.title,
        "date": occ.scheduled_date,
        "time": None,
        "is_done": occ.status == "DONE",
        "is_overdue": is_overdue,
        "status": occ.status,
        "category_emoji": _wc_emoji(wc_map, tmpl.work_category_id),
        "category_title": _wc_title(wc_map, tmpl.work_category_id),
        "meta": {
            "occurrence_id": occ.id,
            "template_id": occ.template_id,
            "op_kind": tmpl.kind,
            "op_kind_label": OP_KIND_LABEL.get(tmpl.kind, tmpl.kind),
            "amount": tmpl.amount,
            "amount_formatted": "{:,.2f}".format(tmpl.amount).replace(",", " "),
        },
    }


# ---------------------------------------------------------------------------
# Query: Habit occurrences (today only)
# ---------------------------------------------------------------------------

def _query_habit_occurrences(
    db: Session, account_id: int, today: date,
    tab: str, wc_map: dict,
) -> list[dict]:
    items: list[dict] = []
    habit_cache: dict[int, HabitModel] = {}

    def _get_habit(habit_id: int) -> HabitModel | None:
        if habit_id not in habit_cache:
            habit_cache[habit_id] = db.query(HabitModel).filter(
                HabitModel.habit_id == habit_id
            ).first()
        return habit_cache[habit_id]

    if tab == "active":
        rows = db.query(HabitOccurrence).filter(
            HabitOccurrence.account_id == account_id,
            HabitOccurrence.scheduled_date == today,
            HabitOccurrence.status == "ACTIVE",
        ).all()
        for occ in rows:
            habit = _get_habit(occ.habit_id)
            if habit and not habit.is_archived:
                items.append(_habit_occ_to_item(occ, habit, wc_map))

    elif tab == "done":
        rows = db.query(HabitOccurrence).filter(
            HabitOccurrence.account_id == account_id,
            HabitOccurrence.scheduled_date == today,
            HabitOccurrence.status == "DONE",
        ).all()
        for occ in rows:
            habit = _get_habit(occ.habit_id)
            if habit and not habit.is_archived:
                items.append(_habit_occ_to_item(occ, habit, wc_map))

    elif tab == "archive":
        rows = db.query(HabitOccurrence).filter(
            HabitOccurrence.account_id == account_id,
            HabitOccurrence.scheduled_date == today,
        ).all()
        for occ in rows:
            habit = _get_habit(occ.habit_id)
            if habit and habit.is_archived:
                items.append(_habit_occ_to_item(occ, habit, wc_map))

    return items


def _habit_occ_to_item(occ: HabitOccurrence, habit: HabitModel, wc_map: dict) -> dict:
    return {
        "kind": "habit",
        "id": occ.id,
        "title": habit.title,
        "date": occ.scheduled_date,
        "time": None,
        "is_done": occ.status == "DONE",
        "is_overdue": False,  # habits are never overdue
        "status": occ.status,
        "category_emoji": _wc_emoji(wc_map, habit.category_id),
        "category_title": _wc_title(wc_map, habit.category_id),
        "meta": {
            "occurrence_id": occ.id,
            "habit_id": occ.habit_id,
            "level": habit.level,
            "current_streak": habit.current_streak,
        },
    }


# ---------------------------------------------------------------------------
# Summary (KPI cards) — always from "active" perspective
# ---------------------------------------------------------------------------

def _compute_summary(db: Session, account_id: int, today: date, wc_map: dict) -> dict:
    week_end = today + timedelta(days=6)

    # --- today_count: active items for today ---
    tc = 0
    # one-off tasks: active, due_date == today or NULL
    tc += db.query(func.count(TaskModel.task_id)).filter(
        TaskModel.account_id == account_id,
        TaskModel.status == "ACTIVE",
        or_(TaskModel.due_date == today, TaskModel.due_date == None),  # noqa: E711
    ).scalar() or 0
    # task occurrences for today, active, non-archived template
    task_occ_today = db.query(TaskOccurrence).filter(
        TaskOccurrence.account_id == account_id,
        TaskOccurrence.status == "ACTIVE",
        TaskOccurrence.scheduled_date == today,
    ).all()
    for occ in task_occ_today:
        tmpl = db.query(TaskTemplateModel).filter(TaskTemplateModel.template_id == occ.template_id).first()
        if tmpl and not tmpl.is_archived:
            tc += 1
    # events for today
    tc += db.query(func.count(EventOccurrenceModel.id)).filter(
        EventOccurrenceModel.account_id == account_id,
        EventOccurrenceModel.is_cancelled == False,  # noqa: E712
        or_(
            EventOccurrenceModel.start_date == today,
            and_(
                EventOccurrenceModel.start_date <= today,
                EventOccurrenceModel.end_date != None,  # noqa: E711
                EventOccurrenceModel.end_date >= today,
            ),
        ),
    ).scalar() or 0
    # operations for today, active, non-archived
    op_occ_today = db.query(OperationOccurrence).filter(
        OperationOccurrence.account_id == account_id,
        OperationOccurrence.status == "ACTIVE",
        OperationOccurrence.scheduled_date == today,
    ).all()
    for occ in op_occ_today:
        tmpl = db.query(OperationTemplateModel).filter(OperationTemplateModel.template_id == occ.template_id).first()
        if tmpl and not tmpl.is_archived:
            tc += 1
    # habits for today
    habit_occ_today = db.query(HabitOccurrence).filter(
        HabitOccurrence.account_id == account_id,
        HabitOccurrence.scheduled_date == today,
        HabitOccurrence.status == "ACTIVE",
    ).all()
    for occ in habit_occ_today:
        habit = db.query(HabitModel).filter(HabitModel.habit_id == occ.habit_id).first()
        if habit and not habit.is_archived:
            tc += 1

    # --- week_count: active items in 7-day window ---
    wc = 0
    wc += db.query(func.count(TaskModel.task_id)).filter(
        TaskModel.account_id == account_id,
        TaskModel.status == "ACTIVE",
        or_(
            and_(TaskModel.due_date >= today, TaskModel.due_date <= week_end),
            TaskModel.due_date == None,  # noqa: E711
        ),
    ).scalar() or 0
    task_occ_week = db.query(TaskOccurrence).filter(
        TaskOccurrence.account_id == account_id,
        TaskOccurrence.status == "ACTIVE",
        TaskOccurrence.scheduled_date >= today,
        TaskOccurrence.scheduled_date <= week_end,
    ).all()
    for occ in task_occ_week:
        tmpl = db.query(TaskTemplateModel).filter(TaskTemplateModel.template_id == occ.template_id).first()
        if tmpl and not tmpl.is_archived:
            wc += 1
    wc += db.query(func.count(EventOccurrenceModel.id)).filter(
        EventOccurrenceModel.account_id == account_id,
        EventOccurrenceModel.is_cancelled == False,  # noqa: E712
        or_(
            and_(EventOccurrenceModel.start_date >= today, EventOccurrenceModel.start_date <= week_end),
            and_(
                EventOccurrenceModel.start_date <= week_end,
                EventOccurrenceModel.end_date != None,  # noqa: E711
                EventOccurrenceModel.end_date >= today,
            ),
        ),
    ).scalar() or 0
    op_occ_week = db.query(OperationOccurrence).filter(
        OperationOccurrence.account_id == account_id,
        OperationOccurrence.status == "ACTIVE",
        OperationOccurrence.scheduled_date >= today,
        OperationOccurrence.scheduled_date <= week_end,
    ).all()
    for occ in op_occ_week:
        tmpl = db.query(OperationTemplateModel).filter(OperationTemplateModel.template_id == occ.template_id).first()
        if tmpl and not tmpl.is_archived:
            wc += 1
    # Habits for today are part of week count
    for occ in habit_occ_today:
        habit = db.query(HabitModel).filter(HabitModel.habit_id == occ.habit_id).first()
        if habit and not habit.is_archived:
            wc += 1

    # --- overdue_count: tasks + planned_ops only ---
    oc = 0
    oc += db.query(func.count(TaskModel.task_id)).filter(
        TaskModel.account_id == account_id,
        TaskModel.status == "ACTIVE",
        TaskModel.due_date != None,  # noqa: E711
        TaskModel.due_date < today,
    ).scalar() or 0
    overdue_task_occs = db.query(TaskOccurrence).filter(
        TaskOccurrence.account_id == account_id,
        TaskOccurrence.status == "ACTIVE",
        TaskOccurrence.scheduled_date < today,
    ).all()
    for occ in overdue_task_occs:
        tmpl = db.query(TaskTemplateModel).filter(TaskTemplateModel.template_id == occ.template_id).first()
        if tmpl and not tmpl.is_archived:
            oc += 1
    overdue_op_occs = db.query(OperationOccurrence).filter(
        OperationOccurrence.account_id == account_id,
        OperationOccurrence.status == "ACTIVE",
        OperationOccurrence.scheduled_date < today,
    ).all()
    for occ in overdue_op_occs:
        tmpl = db.query(OperationTemplateModel).filter(OperationTemplateModel.template_id == occ.template_id).first()
        if tmpl and not tmpl.is_archived:
            oc += 1

    # --- done_today_count ---
    dc = 0
    dc += db.query(func.count(TaskModel.task_id)).filter(
        TaskModel.account_id == account_id,
        TaskModel.status == "DONE",
        func.date(TaskModel.completed_at) == today,
    ).scalar() or 0
    dc += db.query(func.count(TaskOccurrence.id)).filter(
        TaskOccurrence.account_id == account_id,
        TaskOccurrence.status == "DONE",
        TaskOccurrence.scheduled_date == today,
    ).scalar() or 0
    dc += db.query(func.count(HabitOccurrence.id)).filter(
        HabitOccurrence.account_id == account_id,
        HabitOccurrence.status == "DONE",
        HabitOccurrence.scheduled_date == today,
    ).scalar() or 0
    dc += db.query(func.count(OperationOccurrence.id)).filter(
        OperationOccurrence.account_id == account_id,
        OperationOccurrence.status == "DONE",
        OperationOccurrence.scheduled_date == today,
    ).scalar() or 0

    return {
        "today_count": tc,
        "week_count": wc,
        "overdue_count": oc,
        "done_today_count": dc,
    }


# ---------------------------------------------------------------------------
# Today progress
# ---------------------------------------------------------------------------

def _compute_today_progress(items: list[dict], today: date) -> dict:
    today_items = [it for it in items if it["date"] == today]
    total = len(today_items)
    done = sum(1 for it in today_items if it["is_done"])
    return {"total": total, "done": done, "left": total - done}


# ---------------------------------------------------------------------------
# Group by date
# ---------------------------------------------------------------------------

def _date_label(d: date, today: date) -> str:
    if d == today:
        return "Сегодня"
    if d == today + timedelta(days=1):
        return "Завтра"
    if d == today - timedelta(days=1):
        return "Вчера"
    return f"{WEEKDAY_SHORT[d.weekday()]}, {d.day:02d}.{d.month:02d}"


def _sort_key(item: dict) -> tuple:
    kind_order = KIND_SORT.get(item["kind"], 9)
    t = item["time"] if item["time"] is not None else _TIME_MAX
    return (kind_order, t, item["title"])


def _group_by_date(items: list[dict], today: date) -> list[dict]:
    # Separate overdue from the rest
    overdue_items = [it for it in items if it["is_overdue"]]
    normal_items = [it for it in items if not it["is_overdue"]]

    # Deduplicate (same kind+id can appear from both in-range and overdue queries)
    seen = set()
    deduped_overdue: list[dict] = []
    for it in overdue_items:
        key = (it["kind"], it["id"])
        if key not in seen:
            seen.add(key)
            deduped_overdue.append(it)

    deduped_normal: list[dict] = []
    for it in normal_items:
        key = (it["kind"], it["id"])
        if key not in seen:
            seen.add(key)
            deduped_normal.append(it)

    groups: list[dict] = []

    # Overdue group (if any)
    if deduped_overdue:
        deduped_overdue.sort(key=_sort_key)
        groups.append({
            "date": None,
            "date_label": "Просрочено",
            "is_today": False,
            "is_overdue_group": True,
            "entries": deduped_overdue,
        })

    # Group normal items by date
    by_date: dict[date, list[dict]] = defaultdict(list)
    for it in deduped_normal:
        by_date[it["date"]].append(it)

    for d in sorted(by_date.keys()):
        by_date[d].sort(key=_sort_key)
        groups.append({
            "date": d,
            "date_label": _date_label(d, today),
            "is_today": d == today,
            "is_overdue_group": False,
            "entries": by_date[d],
        })

    return groups
