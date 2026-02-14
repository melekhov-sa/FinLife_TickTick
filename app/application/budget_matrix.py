"""
Budget matrix service: multi-period plan-vs-fact view.

Builds a horizontal matrix of N consecutive period columns + totals.
Uses SQL CASE WHEN bucketing for single-query aggregation per data source.
"""
from datetime import datetime, date as date_type, timedelta
from decimal import Decimal
from typing import Dict, Any, List, Tuple

from sqlalchemy import func, case, and_, literal
from sqlalchemy.orm import Session

from app.infrastructure.db.models import (
    BudgetMonth, BudgetLine, CategoryInfo, TransactionFeed,
    OperationTemplateModel, OperationOccurrence,
)
from app.application.budget import MONTH_NAMES, VALID_GRAINS, DAY_NAMES_SHORT

SHORT_MONTH_NAMES = {
    1: "Янв", 2: "Фев", 3: "Мар", 4: "Апр", 5: "Май", 6: "Июн",
    7: "Июл", 8: "Авг", 9: "Сен", 10: "Окт", 11: "Ноя", 12: "Дек",
}

RANGE_LIMITS = {"day": 60, "week": 26, "month": 24, "year": 10}

_ZERO = Decimal("0")


def _zero_cell() -> Dict[str, Decimal]:
    return {"plan": _ZERO, "fact": _ZERO, "deviation": _ZERO}


class BudgetMatrixService:
    """Build multi-period budget matrix view."""

    def __init__(self, db: Session):
        self.db = db

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def build(
        self,
        account_id: int,
        grain: str = "month",
        range_count: int = 3,
        anchor_date: date_type | None = None,
        anchor_year: int | None = None,
        anchor_month: int | None = None,
        category_ids: List[int] | None = None,
    ) -> Dict[str, Any]:
        if grain not in VALID_GRAINS:
            grain = "month"
        max_rc = RANGE_LIMITS.get(grain, 12)
        range_count = max(1, min(range_count, max_rc))

        now = datetime.now()
        if anchor_year is None:
            anchor_year = now.year
        if anchor_month is None:
            anchor_month = now.month
        if anchor_date is None:
            if grain in ("day", "week"):
                anchor_date = date_type.today()
            else:
                anchor_date = date_type(anchor_year, anchor_month, 1)

        # Normalize week anchor to Monday
        if grain == "week":
            anchor_date = anchor_date - timedelta(days=anchor_date.weekday())

        periods = self._compute_periods(grain, range_count, anchor_date, anchor_year, anchor_month)

        # --- Categories ---
        all_categories = self.db.query(CategoryInfo).filter(
            CategoryInfo.account_id == account_id,
        ).all()

        active_income = [c for c in all_categories if c.category_type == "INCOME" and not c.is_archived and not c.is_system]
        active_expense = [c for c in all_categories if c.category_type == "EXPENSE" and not c.is_archived and not c.is_system]

        if category_ids:
            filter_set = set(category_ids)
            active_income = [c for c in active_income if c.category_id in filter_set]
            active_expense = [c for c in active_expense if c.category_id in filter_set]

        system_other_income_id = None
        system_other_expense_id = None
        for c in all_categories:
            if c.is_system and c.category_type == "INCOME":
                system_other_income_id = c.category_id
            if c.is_system and c.category_type == "EXPENSE":
                system_other_expense_id = c.category_id

        # --- Data aggregation (single query per source) ---
        fact_map = self._aggregate_fact_bucketed(account_id, periods)
        planned_map = self._aggregate_planned_bucketed(account_id, periods)
        manual_map = self._load_manual_plans(account_id, periods) if grain == "month" else {}

        n = len(periods)
        has_manual = grain == "month"

        # --- Build rows ---
        consumed_fact: set = set()
        consumed_planned: set = set()

        def _build_row(cat: CategoryInfo, kind: str) -> Dict[str, Any]:
            cells = []
            total_plan = _ZERO
            total_fact = _ZERO
            for i in range(n):
                key_f = (cat.category_id, kind, i)
                key_p = (cat.category_id, kind, i)
                plan_manual = manual_map.get(key_p, _ZERO)
                plan_planned = planned_map.get(key_p, _ZERO)
                plan = (plan_manual + plan_planned) if has_manual else plan_planned
                fact = fact_map.get(key_f, _ZERO)
                cells.append({"plan": plan, "fact": fact, "deviation": fact - plan})
                total_plan += plan
                total_fact += fact
                consumed_fact.add(key_f)
                consumed_planned.add(key_p)
            return {
                "category_id": cat.category_id,
                "title": cat.title,
                "is_system": cat.is_system,
                "cells": cells,
                "total": {"plan": total_plan, "fact": total_fact, "deviation": total_fact - total_plan},
            }

        income_rows = [_build_row(c, "INCOME") for c in sorted(active_income, key=lambda c: (c.sort_order, c.title))]
        expense_rows = [_build_row(c, "EXPENSE") for c in sorted(active_expense, key=lambda c: (c.sort_order, c.title))]

        # --- "Прочие" (uncategorized/system) ---
        other_income = self._build_other_row(
            fact_map, planned_map, manual_map, consumed_fact, consumed_planned,
            "INCOME", system_other_income_id, n, has_manual,
        )
        other_expense = self._build_other_row(
            fact_map, planned_map, manual_map, consumed_fact, consumed_planned,
            "EXPENSE", system_other_expense_id, n, has_manual,
        )

        # --- Section totals ---
        income_totals = self._sum_section(income_rows, other_income, n)
        expense_totals = self._sum_section(expense_rows, other_expense, n)

        # --- Result (income - expense) ---
        result_cells = []
        for i in range(n):
            rp = income_totals["cells"][i]["plan"] - expense_totals["cells"][i]["plan"]
            rf = income_totals["cells"][i]["fact"] - expense_totals["cells"][i]["fact"]
            result_cells.append({"plan": rp, "fact": rf})
        result_total = {
            "plan": income_totals["total"]["plan"] - expense_totals["total"]["plan"],
            "fact": income_totals["total"]["fact"] - expense_totals["total"]["fact"],
        }

        # All active categories for filter UI
        all_active_cats = [
            {"category_id": c.category_id, "title": c.title, "category_type": c.category_type}
            for c in all_categories if not c.is_archived
        ]

        return {
            "grain": grain,
            "range_count": range_count,
            "periods": periods,
            "income_rows": income_rows,
            "expense_rows": expense_rows,
            "other_income": other_income,
            "other_expense": other_expense,
            "income_totals": income_totals,
            "expense_totals": expense_totals,
            "result": {"cells": result_cells, "total": result_total},
            "all_categories": all_active_cats,
            "selected_category_ids": category_ids or [],
        }

    # ------------------------------------------------------------------
    # Period computation
    # ------------------------------------------------------------------

    def _compute_periods(
        self,
        grain: str,
        range_count: int,
        anchor_date: date_type,
        anchor_year: int,
        anchor_month: int,
    ) -> List[Dict[str, Any]]:
        periods = []
        for i in range(range_count):
            shifted, y, m = self._shift_anchor(grain, anchor_date, anchor_year, anchor_month, i)
            start, end = self._date_range(grain, shifted, y, m)
            periods.append({
                "index": i,
                "label": self._period_label(grain, start, end, y, m),
                "short_label": self._short_label(grain, start, y, m),
                "range_start": start,
                "range_end": end,
                "year": y,
                "month": m,
                "has_manual_plan": grain == "month",
            })
        return periods

    @staticmethod
    def _shift_anchor(
        grain: str, anchor: date_type, year: int, month: int, offset: int,
    ) -> Tuple[date_type, int, int]:
        if grain == "day":
            d = anchor + timedelta(days=offset)
            return d, d.year, d.month
        elif grain == "week":
            d = anchor + timedelta(weeks=offset)
            return d, d.year, d.month
        elif grain == "month":
            total = year * 12 + (month - 1) + offset
            y = total // 12
            m = total % 12 + 1
            return date_type(y, m, 1), y, m
        else:  # year
            y = year + offset
            return date_type(y, 1, 1), y, 1

    @staticmethod
    def _date_range(grain: str, d: date_type, year: int, month: int) -> Tuple[date_type, date_type]:
        if grain == "day":
            return d, d + timedelta(days=1)
        elif grain == "week":
            monday = d - timedelta(days=d.weekday())
            return monday, monday + timedelta(days=7)
        elif grain == "month":
            start = date_type(year, month, 1)
            end = date_type(year + 1, 1, 1) if month == 12 else date_type(year, month + 1, 1)
            return start, end
        else:  # year
            return date_type(year, 1, 1), date_type(year + 1, 1, 1)

    @staticmethod
    def _period_label(grain: str, start: date_type, end: date_type, year: int, month: int) -> str:
        if grain == "day":
            wd = DAY_NAMES_SHORT[start.weekday()]
            return f"{wd}, {start.strftime('%d.%m.%Y')}"
        elif grain == "week":
            end_day = end - timedelta(days=1)
            return f"{start.strftime('%d.%m')} – {end_day.strftime('%d.%m.%Y')}"
        elif grain == "month":
            return f"{MONTH_NAMES.get(month, str(month))} {year}"
        else:
            return str(year)

    @staticmethod
    def _short_label(grain: str, start: date_type, year: int, month: int) -> str:
        if grain == "day":
            return start.strftime("%d.%m")
        elif grain == "week":
            end_day = start + timedelta(days=6)
            return f"{start.strftime('%d.%m')}–{end_day.strftime('%d.%m')}"
        elif grain == "month":
            return f"{SHORT_MONTH_NAMES.get(month, str(month))} {year % 100:02d}"
        else:
            return str(year)

    # ------------------------------------------------------------------
    # Data aggregation — single query per source
    # ------------------------------------------------------------------

    def _aggregate_fact_bucketed(
        self, account_id: int, periods: List[Dict],
    ) -> Dict[Tuple, Decimal]:
        if not periods:
            return {}
        global_start = periods[0]["range_start"]
        global_end = periods[-1]["range_end"]
        dt_start = datetime(global_start.year, global_start.month, global_start.day)
        dt_end = datetime(global_end.year, global_end.month, global_end.day)

        whens = []
        for p in periods:
            s = p["range_start"]
            e = p["range_end"]
            cond = and_(
                TransactionFeed.occurred_at >= datetime(s.year, s.month, s.day),
                TransactionFeed.occurred_at < datetime(e.year, e.month, e.day),
            )
            whens.append((cond, literal(p["index"])))

        period_col = case(*whens, else_=literal(-1)).label("period_idx")

        rows = (
            self.db.query(
                TransactionFeed.category_id,
                TransactionFeed.operation_type,
                period_col,
                func.sum(TransactionFeed.amount).label("total"),
            )
            .filter(
                TransactionFeed.account_id == account_id,
                TransactionFeed.operation_type.in_(["INCOME", "EXPENSE"]),
                TransactionFeed.occurred_at >= dt_start,
                TransactionFeed.occurred_at < dt_end,
            )
            .group_by(
                TransactionFeed.category_id,
                TransactionFeed.operation_type,
                period_col,
            )
            .all()
        )

        result: Dict[Tuple, Decimal] = {}
        for row in rows:
            if row.period_idx >= 0:
                result[(row.category_id, row.operation_type, row.period_idx)] = row.total or _ZERO
        return result

    def _aggregate_planned_bucketed(
        self, account_id: int, periods: List[Dict],
    ) -> Dict[Tuple, Decimal]:
        if not periods:
            return {}
        global_start = periods[0]["range_start"]
        global_end = periods[-1]["range_end"]

        whens = []
        for p in periods:
            cond = and_(
                OperationOccurrence.scheduled_date >= p["range_start"],
                OperationOccurrence.scheduled_date < p["range_end"],
            )
            whens.append((cond, literal(p["index"])))

        period_col = case(*whens, else_=literal(-1)).label("period_idx")

        rows = (
            self.db.query(
                OperationTemplateModel.category_id,
                OperationTemplateModel.kind,
                period_col,
                func.sum(OperationTemplateModel.amount).label("total"),
            )
            .join(
                OperationOccurrence,
                OperationOccurrence.template_id == OperationTemplateModel.template_id,
            )
            .filter(
                OperationTemplateModel.account_id == account_id,
                OperationTemplateModel.kind.in_(["INCOME", "EXPENSE"]),
                OperationTemplateModel.category_id.isnot(None),
                OperationOccurrence.scheduled_date >= global_start,
                OperationOccurrence.scheduled_date < global_end,
                OperationOccurrence.status != "SKIPPED",
            )
            .group_by(
                OperationTemplateModel.category_id,
                OperationTemplateModel.kind,
                period_col,
            )
            .all()
        )

        result: Dict[Tuple, Decimal] = {}
        for row in rows:
            if row.period_idx >= 0:
                result[(row.category_id, row.kind, row.period_idx)] = row.total or _ZERO
        return result

    def _load_manual_plans(
        self, account_id: int, periods: List[Dict],
    ) -> Dict[Tuple, Decimal]:
        ym_pairs = []
        ym_to_idx: Dict[Tuple[int, int], int] = {}
        for p in periods:
            if p["has_manual_plan"]:
                ym = (p["year"], p["month"])
                ym_pairs.append(ym)
                ym_to_idx[ym] = p["index"]

        if not ym_pairs:
            return {}

        from sqlalchemy import or_

        budget_months = (
            self.db.query(BudgetMonth)
            .filter(
                BudgetMonth.account_id == account_id,
                or_(*(
                    and_(BudgetMonth.year == y, BudgetMonth.month == m)
                    for y, m in ym_pairs
                )),
            )
            .all()
        )
        if not budget_months:
            return {}

        bm_id_to_idx: Dict[int, int] = {}
        for bm in budget_months:
            idx = ym_to_idx.get((bm.year, bm.month))
            if idx is not None:
                bm_id_to_idx[bm.id] = idx

        lines = (
            self.db.query(BudgetLine)
            .filter(BudgetLine.budget_month_id.in_(list(bm_id_to_idx.keys())))
            .all()
        )

        result: Dict[Tuple, Decimal] = {}
        for line in lines:
            period_idx = bm_id_to_idx.get(line.budget_month_id)
            if period_idx is not None:
                result[(line.category_id, line.kind, period_idx)] = line.plan_amount
        return result

    # ------------------------------------------------------------------
    # Row helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _build_other_row(
        fact_map: Dict, planned_map: Dict, manual_map: Dict,
        consumed_fact: set, consumed_planned: set,
        kind: str, system_cat_id: int | None,
        n: int, has_manual: bool,
    ) -> Dict[str, Any]:
        cells = []
        total_plan = _ZERO
        total_fact = _ZERO
        for i in range(n):
            # Remaining fact for this kind/period
            fact = _ZERO
            for key, val in fact_map.items():
                if key not in consumed_fact and key[1] == kind and key[2] == i:
                    fact += val
            # Remaining planned for this kind/period
            planned = _ZERO
            for key, val in planned_map.items():
                if key not in consumed_planned and key[1] == kind and key[2] == i:
                    planned += val
            # Manual plan for system category
            manual = _ZERO
            if has_manual and system_cat_id is not None:
                manual = manual_map.get((system_cat_id, kind, i), _ZERO)
            plan = (manual + planned) if has_manual else planned
            cells.append({"plan": plan, "fact": fact, "deviation": fact - plan})
            total_plan += plan
            total_fact += fact
        return {
            "cells": cells,
            "total": {"plan": total_plan, "fact": total_fact, "deviation": total_fact - total_plan},
        }

    @staticmethod
    def _sum_section(
        rows: List[Dict], other: Dict, n: int,
    ) -> Dict[str, Any]:
        cells = []
        total_plan = _ZERO
        total_fact = _ZERO
        for i in range(n):
            p = sum((r["cells"][i]["plan"] for r in rows), _ZERO) + other["cells"][i]["plan"]
            f = sum((r["cells"][i]["fact"] for r in rows), _ZERO) + other["cells"][i]["fact"]
            cells.append({"plan": p, "fact": f, "deviation": f - p})
            total_plan += p
            total_fact += f
        return {
            "cells": cells,
            "total": {"plan": total_plan, "fact": total_fact, "deviation": total_fact - total_plan},
        }
