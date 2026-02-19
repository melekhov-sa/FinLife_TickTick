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
    EventLog,
)
from app.utils.money import format_money

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
        wcur_map = self._load_wallet_currency_map(account_id)

        overdue: list[dict] = []
        active: list[dict] = []
        done: list[dict] = []

        # --- One-off tasks ---
        self._collect_oneoff_tasks(account_id, today, wc_map, overdue, active, done)

        # --- Recurring task occurrences ---
        self._collect_task_occurrences(account_id, today, wc_map, overdue, active, done)

        # --- Planned operations ---
        self._collect_operation_occurrences(account_id, today, wc_map, wcur_map, overdue, active, done)

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
        Wallet balance totals by type (REGULAR / CREDIT / SAVINGS) for RUB wallets,
        net balance change over the last 30 days, and monthly income / expense.

        Δ30d is derived from TransactionFeed: the sum of all INCOME, EXPENSE, and
        TRANSFER entries touching each wallet set within the rolling 30-day window.

        Returns a flat dict with pre-computed sign / abs / fmt fields so Jinja
        contains zero arithmetic.
        """
        from datetime import datetime as dt, timedelta

        # ── Wallet totals (RUB, non-archived) ──
        wallets = self.db.query(WalletBalance).filter(
            WalletBalance.account_id == account_id,
            WalletBalance.is_archived == False,  # noqa: E712
            WalletBalance.currency == "RUB",
        ).all()

        def _ids_and_total(wtype: str):
            ws = [w for w in wallets if w.wallet_type == wtype]
            total = sum(w.balance for w in ws) if ws else Decimal("0")
            return {w.wallet_id for w in ws}, int(total)

        regular_ids, regular_total = _ids_and_total("REGULAR")
        credit_ids,  credit_total  = _ids_and_total("CREDIT")
        savings_ids, savings_total = _ids_and_total("SAVINGS")

        # ── Δ30d: net balance change via TransactionFeed ──
        window_start = dt(today.year, today.month, today.day) - timedelta(days=30)
        window_end   = dt(today.year, today.month, today.day) + timedelta(days=1)

        def _net_30d(wallet_ids: set) -> int:
            if not wallet_ids:
                return 0
            ids = list(wallet_ids)
            base = [
                TransactionFeed.account_id == account_id,
                TransactionFeed.occurred_at >= window_start,
                TransactionFeed.occurred_at < window_end,
            ]
            inc = self.db.query(
                func.coalesce(func.sum(TransactionFeed.amount), 0)
            ).filter(*base,
                     TransactionFeed.operation_type == "INCOME",
                     TransactionFeed.wallet_id.in_(ids)).scalar() or Decimal("0")

            exp = self.db.query(
                func.coalesce(func.sum(TransactionFeed.amount), 0)
            ).filter(*base,
                     TransactionFeed.operation_type == "EXPENSE",
                     TransactionFeed.wallet_id.in_(ids)).scalar() or Decimal("0")

            t_in = self.db.query(
                func.coalesce(func.sum(TransactionFeed.amount), 0)
            ).filter(*base,
                     TransactionFeed.operation_type == "TRANSFER",
                     TransactionFeed.to_wallet_id.in_(ids)).scalar() or Decimal("0")

            t_out = self.db.query(
                func.coalesce(func.sum(TransactionFeed.amount), 0)
            ).filter(*base,
                     TransactionFeed.operation_type == "TRANSFER",
                     TransactionFeed.from_wallet_id.in_(ids)).scalar() or Decimal("0")

            return int(inc - exp + t_in - t_out)

        regular_delta = _net_30d(regular_ids)
        credit_delta  = _net_30d(credit_ids)
        savings_delta = _net_30d(savings_ids)

        # ── Monthly income / expense (RUB) ──
        month_start = dt(today.year, today.month, 1)
        if today.month == 12:
            month_end = dt(today.year + 1, 1, 1)
        else:
            month_end = dt(today.year, today.month + 1, 1)

        m_base = [
            TransactionFeed.account_id == account_id,
            TransactionFeed.currency == "RUB",
            TransactionFeed.occurred_at >= month_start,
            TransactionFeed.occurred_at < month_end,
        ]
        month_income = int(self.db.query(
            func.coalesce(func.sum(TransactionFeed.amount), 0)
        ).filter(*m_base, TransactionFeed.operation_type == "INCOME").scalar() or 0)

        month_expense = int(self.db.query(
            func.coalesce(func.sum(TransactionFeed.amount), 0)
        ).filter(*m_base, TransactionFeed.operation_type == "EXPENSE").scalar() or 0)

        # ── Helpers ──
        def _sign_abs(delta: int):
            if delta > 0:
                return "up", delta
            if delta < 0:
                return "down", abs(delta)
            return "zero", 0

        def _fmt_int(n: int) -> str:
            return f"{n:,}".replace(",", " ")

        r_sign, r_abs = _sign_abs(regular_delta)
        c_sign, c_abs = _sign_abs(credit_delta)
        s_sign, s_abs = _sign_abs(savings_delta)

        return {
            "regular_total":      regular_total,
            "credit_total":       credit_total,
            "savings_total":      savings_total,
            "regular_delta_sign": r_sign,
            "regular_delta_abs":  r_abs,
            "regular_delta_fmt":  _fmt_int(r_abs),
            "credit_delta_sign":  c_sign,
            "credit_delta_abs":   c_abs,
            "credit_delta_fmt":   _fmt_int(c_abs),
            "savings_delta_sign": s_sign,
            "savings_delta_abs":  s_abs,
            "savings_delta_fmt":  _fmt_int(s_abs),
            "month_income":       month_income,
            "month_expense":      month_expense,
            "month_net":          month_income - month_expense,
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
        Unified activity feed for the last 7 MSK calendar days.

        Sources:
          - EventLog: task/habit/goal completion events
          - TransactionFeed: all financial operations

        Returns a list of day-groups, newest first:
          [{"label": "Сегодня"|"Вчера"|"DD.MM", "date": date, "items": [...]}, ...]

        Each item has: kind, icon, title, occurred_at, time_str, amount_fmt, amount_sign.
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
        habit_titles = (
            {h.habit_id: h.title for h in self.db.query(HabitModel)
             .filter(HabitModel.habit_id.in_(habit_ids)).all()}
            if habit_ids else {}
        )

        # Build unified item list
        items: list[dict] = []

        for ev in ev_rows:
            p = ev.payload_json or {}
            if ev.event_type == "task_completed":
                title = task_titles.get(int(p.get("task_id", 0)), "Задача")
                icon = "✅"
                cancel_url = f"/plan/tasks/{p.get('task_id')}/uncomplete" if p.get("task_id") else None
            elif ev.event_type == "task_occurrence_completed":
                title = tmpl_titles.get(int(p.get("template_id", 0)), "Задача")
                icon = "✅"
                cancel_url = f"/plan/task-occurrences/{p.get('occurrence_id')}/uncomplete" if p.get("occurrence_id") else None
            elif ev.event_type == "habit_occurrence_completed":
                title = habit_titles.get(int(p.get("habit_id", 0)), "Привычка")
                icon = "💪"
                cancel_url = f"/plan/habit-occurrences/{p.get('occurrence_id')}/toggle" if p.get("occurrence_id") else None
            else:  # goal_achieved
                title = "Достигнута цель"
                icon = "🏆"
                cancel_url = None
            items.append({
                "kind": "event",
                "icon": icon,
                "title": title,
                "occurred_at": ev.occurred_at,
                "amount_fmt": None,
                "amount_sign": None,
                "cancel_url": cancel_url,
            })

        for tx in tx_rows:
            desc = tx.description.strip() if tx.description else ""
            title = desc or (
                "Доход" if tx.operation_type == "INCOME"
                else "Расход" if tx.operation_type == "EXPENSE"
                else "Перевод"
            )
            items.append({
                "kind": "transaction",
                "icon": self._OP_ICONS.get(tx.operation_type, "💳"),
                "title": title,
                "occurred_at": tx.occurred_at,
                "amount_fmt": format_money(tx.amount, tx.currency),
                "amount_sign": (
                    "income" if tx.operation_type == "INCOME"
                    else "expense" if tx.operation_type == "EXPENSE"
                    else "transfer"
                ),
                "cancel_url": None,
            })

        # Sort combined list desc, cap at 30
        items.sort(key=lambda x: x["occurred_at"], reverse=True)
        items = items[:30]

        # Group by MSK date
        yesterday = today_msk - timedelta(days=1)
        groups: dict[date, dict] = {}
        for item in items:
            day = item["occurred_at"].astimezone(MSK).date()
            item["time_str"] = item["occurred_at"].astimezone(MSK).strftime("%H:%M")
            if day not in groups:
                if day == today_msk:
                    label = "Сегодня"
                elif day == yesterday:
                    label = "Вчера"
                else:
                    label = day.strftime("%d.%m")
                groups[day] = {"label": label, "date": day, "events": []}
            groups[day]["events"].append(item)

        return sorted(groups.values(), key=lambda g: g["date"], reverse=True)

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
