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
    EventLog, CategoryInfo,
)
from app.utils.money import format_money

OP_KIND_LABEL = {"INCOME": "Доход", "EXPENSE": "Расход", "TRANSFER": "Перевод"}

_MONTH_GENITIVE_RU = {
    1: "января", 2: "февраля", 3: "марта", 4: "апреля",
    5: "мая", 6: "июня", 7: "июля", 8: "августа",
    9: "сентября", 10: "октября", 11: "ноября", 12: "декабря",
}
_WEEKDAY_RU = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"]


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
            active:   list[item]   — today's active items (tasks, ops, habits)
            done:     list[item]   — items completed today (tasks, ops, habits)
            events:   list[item]   — today's events (separate, NOT in progress)
            progress: {total, done, left}  — tasks-only progress (events excluded)
        """
        wc_map = self._load_wc_map(account_id)
        wcur_map = self._load_wallet_currency_map(account_id)

        overdue: list[dict] = []
        active: list[dict] = []
        done: list[dict] = []
        events: list[dict] = []

        # --- One-off tasks ---
        self._collect_oneoff_tasks(account_id, today, wc_map, overdue, active, done)

        # --- Recurring task occurrences ---
        self._collect_task_occurrences(account_id, today, wc_map, overdue, active, done)

        # --- Planned operations ---
        self._collect_operation_occurrences(account_id, today, wc_map, wcur_map, overdue, active, done)

        # --- Events (today only, separate list — NOT in progress) ---
        self._collect_events_today(account_id, today, wc_map, events)

        # --- Habits (today only, no overdue concept) ---
        self._collect_habits_today(account_id, today, wc_map, active, done)

        # Sort: tasks, then ops, then habits
        kind_sort = {"task": 1, "task_occ": 1, "planned_op": 2, "habit": 3}
        _sort = lambda it: (kind_sort.get(it["kind"], 9), it["title"])
        overdue.sort(key=_sort)
        active.sort(key=_sort)
        done.sort(key=_sort)
        events.sort(key=lambda it: (it.get("time") or "", it["title"]))

        # Progress: tasks only (active + done), events excluded, overdue excluded
        _task_kinds = ("task", "task_occ", "planned_op", "habit")
        total = len(active) + len(done)
        done_count = len(done)
        progress = {"total": total, "done": done_count, "left": total - done_count}

        return {
            "overdue": overdue,
            "active": active,
            "done": done,
            "events": events,
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
        self, account_id: int, today: date, wc_map: dict, wcur_map: dict,
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
                overdue.append(self._op_occ_item(occ, tmpl, wc_map, wcur_map, is_overdue=True))

        # Active today
        rows = self.db.query(OperationOccurrence).filter(
            OperationOccurrence.account_id == account_id,
            OperationOccurrence.status == "ACTIVE",
            OperationOccurrence.scheduled_date == today,
        ).all()
        for occ in rows:
            tmpl = _get_tmpl(occ.template_id)
            if tmpl and not tmpl.is_archived:
                active.append(self._op_occ_item(occ, tmpl, wc_map, wcur_map, is_overdue=False))

        # Done today
        rows = self.db.query(OperationOccurrence).filter(
            OperationOccurrence.account_id == account_id,
            OperationOccurrence.status == "DONE",
            OperationOccurrence.scheduled_date == today,
        ).all()
        for occ in rows:
            tmpl = _get_tmpl(occ.template_id)
            if tmpl:
                done.append(self._op_occ_item(occ, tmpl, wc_map, wcur_map, is_overdue=False, is_done=True))

    def _op_occ_item(self, occ: OperationOccurrence, tmpl: OperationTemplateModel,
                     wc_map: dict, wcur_map: dict,
                     is_overdue: bool = False, is_done: bool = False) -> dict:
        currency = self._wallet_currency(wcur_map, tmpl.wallet_id)
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
                "amount_formatted": format_money(tmpl.amount, currency),
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

        wcur_map = self._load_wallet_currency_map(account_id)
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

            currency = self._wallet_currency(wcur_map, tmpl.wallet_id)
            result.append({
                "occurrence_id": occ.id,
                "template_id": occ.template_id,
                "title": tmpl.title,
                "scheduled_date": occ.scheduled_date,
                "kind": tmpl.kind,
                "kind_label": OP_KIND_LABEL.get(tmpl.kind, tmpl.kind),
                "amount": tmpl.amount,
                "amount_formatted": format_money(tmpl.amount, currency),
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
        """Income, expense, difference for current month, grouped by currency.

        Returns:
            {currency: {"income": Decimal, "expense": Decimal, "difference": Decimal}}
        """
        from datetime import datetime as dt

        month_start = dt(today.year, today.month, 1)
        if today.month == 12:
            month_end = dt(today.year + 1, 1, 1)
        else:
            month_end = dt(today.year, today.month + 1, 1)

        base_filter = [
            TransactionFeed.account_id == account_id,
            TransactionFeed.occurred_at >= month_start,
            TransactionFeed.occurred_at < month_end,
        ]

        income_rows = self.db.query(
            TransactionFeed.currency,
            func.sum(TransactionFeed.amount),
        ).filter(
            *base_filter,
            TransactionFeed.operation_type == "INCOME",
        ).group_by(TransactionFeed.currency).all()

        expense_rows = self.db.query(
            TransactionFeed.currency,
            func.sum(TransactionFeed.amount),
        ).filter(
            *base_filter,
            TransactionFeed.operation_type == "EXPENSE",
        ).group_by(TransactionFeed.currency).all()

        # Collect all currencies
        currencies: set[str] = set()
        income_map: dict[str, Decimal] = {}
        expense_map: dict[str, Decimal] = {}

        for cur, total in income_rows:
            currencies.add(cur)
            income_map[cur] = total or Decimal("0")

        for cur, total in expense_rows:
            currencies.add(cur)
            expense_map[cur] = total or Decimal("0")

        if not currencies:
            currencies.add("RUB")

        result = {}
        for cur in sorted(currencies):
            inc = income_map.get(cur, Decimal("0"))
            exp = expense_map.get(cur, Decimal("0"))
            result[cur] = {
                "income": inc,
                "expense": exp,
                "difference": inc - exp,
            }

        return result

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

    def _load_wallet_currency_map(self, account_id: int) -> dict[int, str]:
        """wallet_id -> currency"""
        rows = self.db.query(
            WalletBalance.wallet_id, WalletBalance.currency
        ).filter(WalletBalance.account_id == account_id).all()
        return {wid: cur for wid, cur in rows}

    def _wallet_currency(self, wcur_map: dict[int, str], wallet_id: int | None) -> str:
        if wallet_id and wallet_id in wcur_map:
            return wcur_map[wallet_id]
        return "RUB"

    # ------------------------------------------------------------------
    # 5. Finance state summary (wallet totals + Δ30d + monthly result)
    # ------------------------------------------------------------------

    def get_fin_state_summary(self, account_id: int, today: date) -> dict:
        """
        Wallet balance totals by type (REGULAR / CREDIT / SAVINGS) for RUB wallets.
        financial_result = regular + savings + credits (credit balances are negative).
        debt_load_pct = round(debt / assets * 100) if assets > 0.
        capital_delta_30 = net_worth_now - net_worth_30d_ago (via balance_30d_ago).
        """
        # ── Wallet totals (RUB, non-archived) ──
        wallets = self.db.query(WalletBalance).filter(
            WalletBalance.account_id == account_id,
            WalletBalance.is_archived == False,  # noqa: E712
            WalletBalance.currency == "RUB",
        ).all()

        def _total(wtype: str) -> int:
            ws = [w for w in wallets if w.wallet_type == wtype]
            return int(sum(w.balance for w in ws)) if ws else 0

        def _total_30d_ago(wtype: str) -> int | None:
            ws = [w for w in wallets if w.wallet_type == wtype]
            if not ws:
                return 0
            if any(w.balance_30d_ago is None for w in ws):
                return None
            return int(sum(w.balance_30d_ago for w in ws))

        regular_total = _total("REGULAR")
        credit_total  = _total("CREDIT")
        savings_total = _total("SAVINGS")

        financial_result = regular_total + savings_total + credit_total

        # ── Debt load ──
        assets = regular_total + savings_total
        debt = abs(credit_total)
        if assets > 0:
            debt_load_pct = round(debt / assets * 100)
        else:
            debt_load_pct = None

        # ── Capital delta 30d (via balance_30d_ago snapshots) ──
        regular_30 = _total_30d_ago("REGULAR")
        credit_30  = _total_30d_ago("CREDIT")
        savings_30 = _total_30d_ago("SAVINGS")

        if regular_30 is not None and credit_30 is not None and savings_30 is not None:
            net_worth_30 = regular_30 + savings_30 + credit_30
            capital_delta_30 = financial_result - net_worth_30
        else:
            capital_delta_30 = None

        return {
            "regular_total":    regular_total,
            "credit_total":     credit_total,
            "savings_total":    savings_total,
            "financial_result": financial_result,
            "debt_load_pct":    debt_load_pct,
            "capital_delta_30": capital_delta_30,
        }

    # ------------------------------------------------------------------
    # 6. Dashboard event feed (last 7 MSK days, max 30 items, grouped by date)
    # ------------------------------------------------------------------

    _FEED_EVENT_TYPES = [
        "task_completed", "task_occurrence_completed",
        "habit_occurrence_completed", "goal_achieved",
    ]
    _OP_ICONS = {"INCOME": "💰", "EXPENSE": "💸", "TRANSFER": "🔄"}

    def get_dashboard_feed(self, account_id: int, today_msk: date) -> list[dict]:
        """
        Diary-style activity feed for the last 7 MSK calendar days.

        Sources:
          - EventLog: task/habit/goal completion events
          - TransactionFeed: all financial operations

        Returns a list of day-groups, newest first:
          [{"label": "Сегодня, 20 февраля", "date": date, "events": [...]}, ...]

        Each item: icon, title, subtitle, time_str, amount_label, amount_css.
        """
        from datetime import datetime as dt, timezone
        MSK = timezone(timedelta(hours=3))
        window_start = dt(
            today_msk.year, today_msk.month, today_msk.day, tzinfo=MSK
        ) - timedelta(days=6)

        # 1. EventLog: task / habit / goal completions
        ev_rows = self.db.query(EventLog).filter(
            EventLog.account_id == account_id,
            EventLog.event_type.in_(self._FEED_EVENT_TYPES),
            EventLog.occurred_at >= window_start,
        ).order_by(EventLog.occurred_at.desc()).limit(50).all()

        # 2. TransactionFeed: financial operations
        tx_rows = self.db.query(TransactionFeed).filter(
            TransactionFeed.account_id == account_id,
            TransactionFeed.occurred_at >= window_start,
        ).order_by(TransactionFeed.occurred_at.desc()).limit(50).all()

        # Batch-load titles for EventLog items
        task_ids: set[int] = set()
        tmpl_ids: set[int] = set()
        habit_ids: set[int] = set()
        for ev in ev_rows:
            p = ev.payload_json or {}
            if ev.event_type == "task_completed" and p.get("task_id"):
                task_ids.add(int(p["task_id"]))
            elif ev.event_type == "task_occurrence_completed" and p.get("template_id"):
                tmpl_ids.add(int(p["template_id"]))
            elif ev.event_type == "habit_occurrence_completed" and p.get("habit_id"):
                habit_ids.add(int(p["habit_id"]))

        task_titles = (
            {t.task_id: t.title for t in self.db.query(TaskModel)
             .filter(TaskModel.task_id.in_(task_ids)).all()}
            if task_ids else {}
        )
        tmpl_titles = (
            {t.template_id: t.title for t in self.db.query(TaskTemplateModel)
             .filter(TaskTemplateModel.template_id.in_(tmpl_ids)).all()}
            if tmpl_ids else {}
        )
        habit_map = (
            {h.habit_id: h for h in self.db.query(HabitModel)
             .filter(HabitModel.habit_id.in_(habit_ids)).all()}
            if habit_ids else {}
        )

        # Batch-load wallet/category titles for transaction subtitles
        wallet_ids: set[int] = set()
        cat_ids: set[int] = set()
        for tx in tx_rows:
            if tx.wallet_id:
                wallet_ids.add(tx.wallet_id)
            if tx.from_wallet_id:
                wallet_ids.add(tx.from_wallet_id)
            if tx.to_wallet_id:
                wallet_ids.add(tx.to_wallet_id)
            if tx.category_id:
                cat_ids.add(tx.category_id)

        wallet_titles = (
            {w.wallet_id: w.title for w in self.db.query(WalletBalance)
             .filter(WalletBalance.wallet_id.in_(wallet_ids)).all()}
            if wallet_ids else {}
        )
        cat_titles = (
            {c.category_id: c.title for c in self.db.query(CategoryInfo)
             .filter(CategoryInfo.category_id.in_(cat_ids)).all()}
            if cat_ids else {}
        )

        # Build unified item list
        items: list[dict] = []

        for ev in ev_rows:
            p = ev.payload_json or {}
            if ev.event_type == "task_completed":
                title = task_titles.get(int(p.get("task_id", 0)), "Задача")
                icon = "✅"
                subtitle = "Задача выполнена"
            elif ev.event_type == "task_occurrence_completed":
                title = tmpl_titles.get(int(p.get("template_id", 0)), "Задача")
                icon = "✅"
                subtitle = "Повтор. задача выполнена"
            elif ev.event_type == "habit_occurrence_completed":
                hid = int(p.get("habit_id", 0))
                habit = habit_map.get(hid)
                title = habit.title if habit else "Привычка"
                icon = "💪"
                streak = habit.current_streak if habit else 0
                subtitle = f"Привычка · серия {streak} дн." if streak and streak > 0 else "Привычка выполнена"
            else:  # goal_achieved
                title = "Достигнута цель"
                icon = "🏆"
                subtitle = "Цель достигнута"
            items.append({
                "icon": icon,
                "title": title,
                "subtitle": subtitle,
                "occurred_at": ev.occurred_at,
                "amount_label": None,
                "amount_css": None,
            })

        for tx in tx_rows:
            desc = tx.description.strip() if tx.description else ""
            title = desc or (
                "Доход" if tx.operation_type == "INCOME"
                else "Расход" if tx.operation_type == "EXPENSE"
                else "Перевод"
            )

            # Subtitle: wallet · category (or from → to for transfers)
            if tx.operation_type == "TRANSFER":
                from_name = wallet_titles.get(tx.from_wallet_id, "")
                to_name = wallet_titles.get(tx.to_wallet_id, "")
                subtitle = f"{from_name} → {to_name}" if from_name and to_name else "Перевод"
            else:
                w_name = wallet_titles.get(tx.wallet_id, "")
                c_name = cat_titles.get(tx.category_id, "")
                if w_name and c_name:
                    subtitle = f"{w_name} · {c_name}"
                else:
                    subtitle = w_name or c_name or ""

            # Amount with sign
            if tx.operation_type == "INCOME":
                amount_label = f"+{format_money(tx.amount, tx.currency)}"
                amount_css = "income"
            elif tx.operation_type == "EXPENSE":
                amount_label = f"\u2212{format_money(tx.amount, tx.currency)}"
                amount_css = "expense"
            else:
                amount_label = format_money(tx.amount, tx.currency)
                amount_css = "transfer"

            items.append({
                "icon": self._OP_ICONS.get(tx.operation_type, "💳"),
                "title": title,
                "subtitle": subtitle,
                "occurred_at": tx.occurred_at,
                "amount_label": amount_label,
                "amount_css": amount_css,
            })

        # Sort combined list desc, cap at 30
        items.sort(key=lambda x: x["occurred_at"], reverse=True)
        items = items[:30]

        # Group by MSK date with diary-style labels
        groups: dict[date, dict] = {}
        for item in items:
            day = item["occurred_at"].astimezone(MSK).date()
            item["time_str"] = item["occurred_at"].astimezone(MSK).strftime("%H:%M")
            if day not in groups:
                label = self._diary_day_label(day, today_msk)
                groups[day] = {"label": label, "date": day, "events": []}
            groups[day]["events"].append(item)

        return sorted(groups.values(), key=lambda g: g["date"], reverse=True)

    @staticmethod
    def _diary_day_label(day: date, today_msk: date) -> str:
        d_num = day.day
        month_g = _MONTH_GENITIVE_RU[day.month]
        if day == today_msk:
            prefix = "Сегодня"
        elif day == today_msk - timedelta(days=1):
            prefix = "Вчера"
        else:
            prefix = _WEEKDAY_RU[day.weekday()].capitalize()
        return f"{prefix}, {d_num} {month_g}"

    # ------------------------------------------------------------------
    # 7. Wishes this month
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
