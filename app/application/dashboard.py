"""
Dashboard V2 — aggregated daily management view.

Pure read-layer: no domain events, no projectors, no mutations.
Provides three main blocks:
  1. Today block (overdue, active, done, progress)
  2. Upcoming payments
  3. Habit heatmap (mini, 15 days)
  4. Financial summary (current month)
"""
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import func, or_, and_
from sqlalchemy.orm import Session

from app.infrastructure.db.models import (
    TaskModel, TaskTemplateModel, TaskOccurrence,
    HabitModel, HabitOccurrence,
    OperationTemplateModel, OperationOccurrence,
    CalendarEventModel, EventOccurrenceModel,
    TransactionFeed, WalletBalance,
    WorkCategory, WishModel,
)

OP_KIND_LABEL = {"INCOME": "Доход", "EXPENSE": "Расход", "TRANSFER": "Перевод"}


class DashboardService:
    def __init__(self, db: Session):
        self.db = db

    # ------------------------------------------------------------------
    # 1. Today block
    # ------------------------------------------------------------------

    def get_today_block(self, account_id: int, today: date) -> dict:
        """
        Returns:
            overdue:  list[item]   — tasks + planned ops that are overdue (scheduled < today)
            active:   list[item]   — today's active items (tasks, ops, events, habits)
            done:     list[item]   — items completed today
            progress: {total, done, left}  — only today items (overdue excluded from total)
        """
        wc_map = self._load_wc_map(account_id)

        overdue: list[dict] = []
        active: list[dict] = []
        done: list[dict] = []

        # --- One-off tasks ---
        self._collect_oneoff_tasks(account_id, today, wc_map, overdue, active, done)

        # --- Recurring task occurrences ---
        self._collect_task_occurrences(account_id, today, wc_map, overdue, active, done)

        # --- Planned operations ---
        self._collect_operation_occurrences(account_id, today, wc_map, overdue, active, done)

        # --- Events (today only, no overdue concept) ---
        self._collect_events_today(account_id, today, wc_map, active)

        # --- Habits (today only, no overdue concept) ---
        self._collect_habits_today(account_id, today, wc_map, active, done)

        # Sort: events first, then tasks, then ops, then habits
        kind_sort = {"event": 1, "task": 2, "task_occ": 2, "planned_op": 3, "habit": 4}
        _sort = lambda it: (kind_sort.get(it["kind"], 9), it["title"])
        overdue.sort(key=_sort)
        active.sort(key=_sort)
        done.sort(key=_sort)

        # Progress: only today's items (active + done), overdue excluded
        total = len(active) + len(done)
        done_count = len(done)
        progress = {"total": total, "done": done_count, "left": total - done_count}

        return {
            "overdue": overdue,
            "active": active,
            "done": done,
            "progress": progress,
        }

    # --- One-off tasks ---

    def _collect_oneoff_tasks(
        self, account_id: int, today: date, wc_map: dict,
        overdue: list, active: list, done: list,
    ):
        # Overdue: active, due_date < today
        rows = self.db.query(TaskModel).filter(
            TaskModel.account_id == account_id,
            TaskModel.status == "ACTIVE",
            TaskModel.due_date != None,  # noqa: E711
            TaskModel.due_date < today,
        ).all()
        for t in rows:
            overdue.append(self._task_item(t, today, wc_map, is_overdue=True))

        # Active today: due_date == today or due_date is NULL
        rows = self.db.query(TaskModel).filter(
            TaskModel.account_id == account_id,
            TaskModel.status == "ACTIVE",
            or_(TaskModel.due_date == today, TaskModel.due_date == None),  # noqa: E711
        ).all()
        for t in rows:
            active.append(self._task_item(t, today, wc_map, is_overdue=False))

        # Done today
        rows = self.db.query(TaskModel).filter(
            TaskModel.account_id == account_id,
            TaskModel.status == "DONE",
            func.date(TaskModel.completed_at) == today,
        ).all()
        for t in rows:
            done.append(self._task_item(t, today, wc_map, is_overdue=False, is_done=True))

    def _task_item(self, t: TaskModel, today: date, wc_map: dict,
                   is_overdue: bool = False, is_done: bool = False) -> dict:
        return {
            "kind": "task",
            "id": t.task_id,
            "title": t.title,
            "date": t.due_date or today,
            "is_done": is_done or t.status == "DONE",
            "is_overdue": is_overdue,
            "category_emoji": self._wc_emoji(wc_map, t.category_id),
            "meta": {"task_id": t.task_id},
        }

    # --- Task occurrences ---

    def _collect_task_occurrences(
        self, account_id: int, today: date, wc_map: dict,
        overdue: list, active: list, done: list,
    ):
        tmpl_cache: dict[int, TaskTemplateModel] = {}

        def _get_tmpl(tid: int) -> TaskTemplateModel | None:
            if tid not in tmpl_cache:
                tmpl_cache[tid] = self.db.query(TaskTemplateModel).filter(
                    TaskTemplateModel.template_id == tid
                ).first()
            return tmpl_cache[tid]

        # Overdue
        rows = self.db.query(TaskOccurrence).filter(
            TaskOccurrence.account_id == account_id,
            TaskOccurrence.status == "ACTIVE",
            TaskOccurrence.scheduled_date < today,
        ).all()
        for occ in rows:
            tmpl = _get_tmpl(occ.template_id)
            if tmpl and not tmpl.is_archived:
                overdue.append(self._task_occ_item(occ, tmpl, wc_map, is_overdue=True))

        # Active today
        rows = self.db.query(TaskOccurrence).filter(
            TaskOccurrence.account_id == account_id,
            TaskOccurrence.status == "ACTIVE",
            TaskOccurrence.scheduled_date == today,
        ).all()
        for occ in rows:
            tmpl = _get_tmpl(occ.template_id)
            if tmpl and not tmpl.is_archived:
                active.append(self._task_occ_item(occ, tmpl, wc_map, is_overdue=False))

        # Done today
        rows = self.db.query(TaskOccurrence).filter(
            TaskOccurrence.account_id == account_id,
            TaskOccurrence.status == "DONE",
            TaskOccurrence.scheduled_date == today,
        ).all()
        for occ in rows:
            tmpl = _get_tmpl(occ.template_id)
            if tmpl:
                done.append(self._task_occ_item(occ, tmpl, wc_map, is_overdue=False, is_done=True))

    def _task_occ_item(self, occ: TaskOccurrence, tmpl: TaskTemplateModel,
                       wc_map: dict, is_overdue: bool = False, is_done: bool = False) -> dict:
        return {
            "kind": "task_occ",
            "id": occ.id,
            "title": tmpl.title,
            "date": occ.scheduled_date,
            "is_done": is_done or occ.status == "DONE",
            "is_overdue": is_overdue,
            "category_emoji": self._wc_emoji(wc_map, tmpl.category_id),
            "meta": {"occurrence_id": occ.id, "template_id": occ.template_id},
        }

    # --- Planned operations ---

    def _collect_operation_occurrences(
        self, account_id: int, today: date, wc_map: dict,
        overdue: list, active: list, done: list,
    ):
        tmpl_cache: dict[int, OperationTemplateModel] = {}

        def _get_tmpl(tid: int) -> OperationTemplateModel | None:
            if tid not in tmpl_cache:
                tmpl_cache[tid] = self.db.query(OperationTemplateModel).filter(
                    OperationTemplateModel.template_id == tid
                ).first()
            return tmpl_cache[tid]

        # Overdue
        rows = self.db.query(OperationOccurrence).filter(
            OperationOccurrence.account_id == account_id,
            OperationOccurrence.status == "ACTIVE",
            OperationOccurrence.scheduled_date < today,
        ).all()
        for occ in rows:
            tmpl = _get_tmpl(occ.template_id)
            if tmpl and not tmpl.is_archived:
                overdue.append(self._op_occ_item(occ, tmpl, wc_map, is_overdue=True))

        # Active today
        rows = self.db.query(OperationOccurrence).filter(
            OperationOccurrence.account_id == account_id,
            OperationOccurrence.status == "ACTIVE",
            OperationOccurrence.scheduled_date == today,
        ).all()
        for occ in rows:
            tmpl = _get_tmpl(occ.template_id)
            if tmpl and not tmpl.is_archived:
                active.append(self._op_occ_item(occ, tmpl, wc_map, is_overdue=False))

        # Done today
        rows = self.db.query(OperationOccurrence).filter(
            OperationOccurrence.account_id == account_id,
            OperationOccurrence.status == "DONE",
            OperationOccurrence.scheduled_date == today,
        ).all()
        for occ in rows:
            tmpl = _get_tmpl(occ.template_id)
            if tmpl:
                done.append(self._op_occ_item(occ, tmpl, wc_map, is_overdue=False, is_done=True))

    def _op_occ_item(self, occ: OperationOccurrence, tmpl: OperationTemplateModel,
                     wc_map: dict, is_overdue: bool = False, is_done: bool = False) -> dict:
        return {
            "kind": "planned_op",
            "id": occ.id,
            "title": tmpl.title,
            "date": occ.scheduled_date,
            "is_done": is_done or occ.status == "DONE",
            "is_overdue": is_overdue,
            "category_emoji": self._wc_emoji(wc_map, tmpl.work_category_id),
            "meta": {
                "occurrence_id": occ.id,
                "template_id": occ.template_id,
                "op_kind": tmpl.kind,
                "op_kind_label": OP_KIND_LABEL.get(tmpl.kind, tmpl.kind),
                "amount": tmpl.amount,
                "amount_formatted": "{:,.0f}".format(tmpl.amount).replace(",", " "),
            },
        }

    # --- Events today ---

    def _collect_events_today(
        self, account_id: int, today: date, wc_map: dict, active: list,
    ):
        rows = self.db.query(EventOccurrenceModel).filter(
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
        ).all()

        ev_cache: dict[int, CalendarEventModel] = {}
        for occ in rows:
            if occ.event_id not in ev_cache:
                ev_cache[occ.event_id] = self.db.query(CalendarEventModel).filter(
                    CalendarEventModel.event_id == occ.event_id
                ).first()
            ev = ev_cache[occ.event_id]
            if ev and ev.is_active:
                active.append({
                    "kind": "event",
                    "id": occ.id,
                    "title": ev.title,
                    "date": occ.start_date,
                    "time": occ.start_time,
                    "is_done": False,
                    "is_overdue": False,
                    "category_emoji": self._wc_emoji(wc_map, ev.category_id),
                    "meta": {
                        "occurrence_id": occ.id,
                        "event_id": occ.event_id,
                        "start_time": occ.start_time,
                    },
                })

    # --- Habits today ---

    def _collect_habits_today(
        self, account_id: int, today: date, wc_map: dict,
        active: list, done: list,
    ):
        rows = self.db.query(HabitOccurrence).filter(
            HabitOccurrence.account_id == account_id,
            HabitOccurrence.scheduled_date == today,
        ).all()

        habit_cache: dict[int, HabitModel] = {}
        for occ in rows:
            if occ.habit_id not in habit_cache:
                habit_cache[occ.habit_id] = self.db.query(HabitModel).filter(
                    HabitModel.habit_id == occ.habit_id
                ).first()
            habit = habit_cache[occ.habit_id]
            if not habit or habit.is_archived:
                continue

            item = {
                "kind": "habit",
                "id": occ.id,
                "title": habit.title,
                "date": occ.scheduled_date,
                "is_done": occ.status == "DONE",
                "is_overdue": False,
                "category_emoji": self._wc_emoji(wc_map, habit.category_id),
                "meta": {
                    "occurrence_id": occ.id,
                    "habit_id": occ.habit_id,
                    "level": habit.level,
                    "current_streak": habit.current_streak,
                },
            }

            if occ.status == "DONE":
                done.append(item)
            elif occ.status == "ACTIVE":
                active.append(item)

    # ------------------------------------------------------------------
    # 2. Upcoming payments
    # ------------------------------------------------------------------

    def get_upcoming_payments(self, account_id: int, today: date, limit: int = 3) -> list[dict]:
        """Future planned operations (scheduled_date > today), sorted by date, limited."""
        rows = self.db.query(OperationOccurrence).filter(
            OperationOccurrence.account_id == account_id,
            OperationOccurrence.status == "ACTIVE",
            OperationOccurrence.scheduled_date > today,
        ).order_by(OperationOccurrence.scheduled_date.asc()).limit(limit * 3).all()

        tmpl_cache: dict[int, OperationTemplateModel] = {}
        result: list[dict] = []
        for occ in rows:
            if occ.template_id not in tmpl_cache:
                tmpl_cache[occ.template_id] = self.db.query(OperationTemplateModel).filter(
                    OperationTemplateModel.template_id == occ.template_id
                ).first()
            tmpl = tmpl_cache[occ.template_id]
            if not tmpl or tmpl.is_archived:
                continue

            result.append({
                "occurrence_id": occ.id,
                "template_id": occ.template_id,
                "title": tmpl.title,
                "scheduled_date": occ.scheduled_date,
                "kind": tmpl.kind,
                "kind_label": OP_KIND_LABEL.get(tmpl.kind, tmpl.kind),
                "amount": tmpl.amount,
                "amount_formatted": "{:,.0f}".format(tmpl.amount).replace(",", " "),
                "days_until": (occ.scheduled_date - today).days,
            })
            if len(result) >= limit:
                break

        return result

    # ------------------------------------------------------------------
    # 3. Habit heatmap (mini, 15 days)
    # ------------------------------------------------------------------

    def get_habit_heatmap(self, account_id: int, today: date, days: int = 15) -> list[dict]:
        """
        Build a mini heatmap: last `days` days.
        Each cell: {date, done_count, due_count, ratio, level(0-4)}.
        """
        start = today - timedelta(days=days - 1)

        habits = self.db.query(HabitModel).filter(
            HabitModel.account_id == account_id,
            HabitModel.is_archived == False,  # noqa: E712
        ).all()
        if not habits:
            return []

        habit_ids = [h.habit_id for h in habits]
        occs = self.db.query(HabitOccurrence).filter(
            HabitOccurrence.account_id == account_id,
            HabitOccurrence.habit_id.in_(habit_ids),
            HabitOccurrence.scheduled_date >= start,
            HabitOccurrence.scheduled_date <= today,
        ).all()

        by_date: dict[date, list] = {}
        for o in occs:
            by_date.setdefault(o.scheduled_date, []).append(o)

        result = []
        for i in range(days):
            d = start + timedelta(days=i)
            day_occs = by_date.get(d, [])
            due_count = len(day_occs)
            done_count = sum(1 for o in day_occs if o.status == "DONE")

            if due_count == 0:
                ratio = 0.0
                level = 0
            else:
                ratio = done_count / due_count
                if ratio == 0:
                    level = 0
                elif ratio < 0.34:
                    level = 1
                elif ratio < 0.67:
                    level = 2
                elif ratio < 1.0:
                    level = 3
                else:
                    level = 4

            result.append({
                "date": d,
                "done_count": done_count,
                "due_count": due_count,
                "ratio": ratio,
                "level": level,
            })
        return result

    # ------------------------------------------------------------------
    # 4. Financial summary (current month)
    # ------------------------------------------------------------------

    def get_financial_summary(self, account_id: int, today: date) -> dict:
        """Income, expense, difference for current month."""
        from datetime import datetime as dt

        month_start = dt(today.year, today.month, 1)
        if today.month == 12:
            month_end = dt(today.year + 1, 1, 1)
        else:
            month_end = dt(today.year, today.month + 1, 1)

        income = self.db.query(func.sum(TransactionFeed.amount)).filter(
            TransactionFeed.account_id == account_id,
            TransactionFeed.operation_type == "INCOME",
            TransactionFeed.occurred_at >= month_start,
            TransactionFeed.occurred_at < month_end,
        ).scalar() or Decimal("0")

        expense = self.db.query(func.sum(TransactionFeed.amount)).filter(
            TransactionFeed.account_id == account_id,
            TransactionFeed.operation_type == "EXPENSE",
            TransactionFeed.occurred_at >= month_start,
            TransactionFeed.occurred_at < month_end,
        ).scalar() or Decimal("0")

        return {
            "income": income,
            "expense": expense,
            "difference": income - expense,
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _load_wc_map(self, account_id: int) -> dict[int, Any]:
        wcs = self.db.query(WorkCategory).filter(
            WorkCategory.account_id == account_id
        ).all()
        return {wc.category_id: wc for wc in wcs}

    def _wc_emoji(self, wc_map: dict, cat_id: int | None) -> str | None:
        if cat_id and cat_id in wc_map:
            return wc_map[cat_id].emoji
        return None

    # ------------------------------------------------------------------
    # 5. Wishes this month
    # ------------------------------------------------------------------

    def get_wishes_this_month(self, account_id: int, today: date) -> dict:
        """
        Get wishes for current month grouped by type and sorted by date.

        Returns:
            {
                "PURCHASE": [wish, ...],
                "EVENT": [wish, ...],
                "PLACE": [wish, ...],
                "OTHER": [wish, ...]
            }
        """
        # Month boundaries
        month_start = date(today.year, today.month, 1)
        if today.month == 12:
            month_end = date(today.year + 1, 1, 1) - timedelta(days=1)
        else:
            month_end = date(today.year, today.month + 1, 1) - timedelta(days=1)

        current_month_str = today.strftime("%Y-%m")

        # Active statuses
        active_statuses = ["IDEA", "CONSIDERING", "PLANNED"]

        # Query wishes with target_date in current month OR target_month matching current month
        wishes = self.db.query(WishModel).filter(
            WishModel.account_id == account_id,
            WishModel.status.in_(active_statuses),
            or_(
                and_(
                    WishModel.target_date != None,  # noqa: E711
                    WishModel.target_date >= month_start,
                    WishModel.target_date <= month_end,
                ),
                WishModel.target_month == current_month_str,
            ),
        ).order_by(
            WishModel.target_date.asc().nullslast(),
            WishModel.title.asc(),
        ).all()

        # Group by type
        grouped = {
            "PURCHASE": [],
            "EVENT": [],
            "PLACE": [],
            "OTHER": [],
        }

        for wish in wishes:
            if wish.wish_type in grouped:
                grouped[wish.wish_type].append(wish)

        return grouped
