"""
Budget use cases and query helpers.

Use cases follow Event Sourcing pattern (domain event → EventLog → Projector → read model).
Fact is computed on-the-fly from TransactionFeed.
Plan = manual (BudgetLine) + planned operations (OperationOccurrence).
"""
from datetime import datetime, date as date_type, timedelta
from decimal import Decimal
from typing import Dict, Any, List

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.infrastructure.eventlog.repository import EventLogRepository
from app.infrastructure.db.models import (
    BudgetMonth, BudgetLine, CategoryInfo, TransactionFeed,
    OperationTemplateModel, OperationOccurrence,
)
from app.domain.budget import Budget
from app.readmodels.projectors.budget import BudgetProjector


class BudgetValidationError(ValueError):
    pass


# ---------------------------------------------------------------------------
# Use Cases
# ---------------------------------------------------------------------------


class EnsureBudgetMonthUseCase:
    """Idempotently ensure a BudgetMonth exists for (account_id, year, month)."""

    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(
        self,
        account_id: int,
        year: int,
        month: int,
        actor_user_id: int | None = None,
    ) -> int:
        existing = self.db.query(BudgetMonth).filter(
            BudgetMonth.account_id == account_id,
            BudgetMonth.year == year,
            BudgetMonth.month == month,
        ).first()

        if existing:
            return existing.id

        budget_month_id = self._next_id()

        payload = Budget.create_month(
            account_id=account_id,
            budget_month_id=budget_month_id,
            year=year,
            month=month,
        )
        self.event_repo.append_event(
            account_id=account_id,
            event_type="budget_month_created",
            payload=payload,
            actor_user_id=actor_user_id,
            idempotency_key=f"budget-month-{account_id}-{year}-{month}",
        )
        self.db.commit()
        BudgetProjector(self.db).run(account_id, event_types=["budget_month_created"])
        return budget_month_id

    def _next_id(self) -> int:
        max_id = self.db.query(func.max(BudgetMonth.id)).scalar() or 0
        return max_id + 1


class SetBudgetLineUseCase:
    """Set (upsert) a budget plan line for a category + kind."""

    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(
        self,
        account_id: int,
        budget_month_id: int,
        category_id: int,
        kind: str,
        plan_amount: str,
        note: str | None = None,
        actor_user_id: int | None = None,
    ) -> None:
        if kind not in ("INCOME", "EXPENSE"):
            raise BudgetValidationError("kind must be INCOME or EXPENSE")

        amount = Decimal(plan_amount)
        if amount < 0:
            raise BudgetValidationError("plan_amount must be >= 0")

        line_id = self._next_id()

        payload = Budget.set_plan(
            budget_month_id=budget_month_id,
            line_id=line_id,
            category_id=category_id,
            kind=kind,
            plan_amount=str(amount),
            note=note,
        )
        self.event_repo.append_event(
            account_id=account_id,
            event_type="budget_line_set",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        BudgetProjector(self.db).run(account_id, event_types=["budget_line_set"])

    def _next_id(self) -> int:
        max_id = self.db.query(func.max(BudgetLine.id)).scalar() or 0
        return max_id + 1


class SaveBudgetPlanUseCase:
    """Batch-save budget plan lines for a given month."""

    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(
        self,
        account_id: int,
        year: int,
        month: int,
        lines: List[Dict[str, Any]],
        actor_user_id: int | None = None,
    ) -> None:
        """
        Args:
            lines: list of {"category_id": int, "kind": str, "plan_amount": str, "note": str|None}
        """
        # Ensure month exists
        ensure_uc = EnsureBudgetMonthUseCase(self.db)
        budget_month_id = ensure_uc.execute(account_id, year, month, actor_user_id)

        # Set each line
        set_uc = SetBudgetLineUseCase(self.db)
        for line in lines:
            plan_amount = line.get("plan_amount", "0")
            # Skip lines with zero plan (don't create noise)
            if Decimal(plan_amount) == 0:
                # Check if there's an existing line to clear
                existing = self.db.query(BudgetLine).filter(
                    BudgetLine.budget_month_id == budget_month_id,
                    BudgetLine.category_id == line["category_id"],
                    BudgetLine.kind == line["kind"],
                ).first()
                if not existing:
                    continue

            set_uc.execute(
                account_id=account_id,
                budget_month_id=budget_month_id,
                category_id=line["category_id"],
                kind=line["kind"],
                plan_amount=plan_amount,
                note=line.get("note"),
                actor_user_id=actor_user_id,
            )


# ---------------------------------------------------------------------------
# Query Helpers
# ---------------------------------------------------------------------------

MONTH_NAMES = {
    1: "Январь", 2: "Февраль", 3: "Март", 4: "Апрель",
    5: "Май", 6: "Июнь", 7: "Июль", 8: "Август",
    9: "Сентябрь", 10: "Октябрь", 11: "Ноябрь", 12: "Декабрь",
}

VALID_GRAINS = ("day", "week", "month", "year")

DAY_NAMES_SHORT = {0: "Пн", 1: "Вт", 2: "Ср", 3: "Чт", 4: "Пт", 5: "Сб", 6: "Вс"}


# ---------------------------------------------------------------------------
# BudgetViewService — unified budget view builder
# ---------------------------------------------------------------------------


class BudgetViewService:
    """Build budget view for any period grain: day, week, month, year."""

    def __init__(self, db: Session):
        self.db = db

    def build(
        self,
        account_id: int,
        grain: str = "month",
        year: int | None = None,
        month: int | None = None,
        date_param: date_type | None = None,
        category_ids: List[int] | None = None,
    ) -> Dict[str, Any]:
        if grain not in VALID_GRAINS:
            grain = "month"

        now = datetime.now()
        if year is None:
            year = now.year
        if month is None:
            month = now.month
        if date_param is None:
            date_param = date_type.today()

        range_start, range_end = self._compute_date_range(grain, date_param, year, month)
        period_label = self._period_label(grain, range_start, range_end, year, month)
        has_manual_plan = grain == "month"

        # --- Categories ---
        all_categories = self.db.query(CategoryInfo).filter(
            CategoryInfo.account_id == account_id,
        ).all()

        active_income = [c for c in all_categories if c.category_type == "INCOME" and not c.is_archived]
        active_expense = [c for c in all_categories if c.category_type == "EXPENSE" and not c.is_archived]
        archived_ids = {c.category_id for c in all_categories if c.is_archived}

        # Apply category filter
        if category_ids:
            filter_set = set(category_ids)
            active_income = [c for c in active_income if c.category_id in filter_set]
            active_expense = [c for c in active_expense if c.category_id in filter_set]

        # System "Прочие" categories
        system_other_income_id = None
        system_other_expense_id = None
        for c in all_categories:
            if c.is_system and c.title == "Прочие доходы" and c.category_type == "INCOME":
                system_other_income_id = c.category_id
            if c.is_system and c.title == "Прочие расходы" and c.category_type == "EXPENSE":
                system_other_expense_id = c.category_id

        # --- Manual plan (month grain only) ---
        plan_map: Dict[tuple, Decimal] = {}
        position_map: Dict[tuple, int] = {}
        budget_month_id = None

        if has_manual_plan:
            budget_month = self.db.query(BudgetMonth).filter(
                BudgetMonth.account_id == account_id,
                BudgetMonth.year == year,
                BudgetMonth.month == month,
            ).first()

            if budget_month:
                budget_month_id = budget_month.id
                for line in self.db.query(BudgetLine).filter(
                    BudgetLine.budget_month_id == budget_month.id
                ).all():
                    key = (line.category_id, line.kind)
                    plan_map[key] = line.plan_amount
                    position_map[key] = line.position

        # --- Planned occurrences (all grains) ---
        planned_map = self._aggregate_planned_occurrences(
            account_id, range_start, range_end,
        )

        # --- Fact data ---
        fact_map = self._aggregate_fact(account_id, range_start, range_end)

        # --- Build lines ---
        def _build_line(cat: CategoryInfo, kind: str) -> Dict[str, Any]:
            plan_manual = plan_map.get((cat.category_id, kind), Decimal("0"))
            plan_planned = planned_map.pop((cat.category_id, kind), Decimal("0"))
            plan_total = plan_manual + plan_planned if has_manual_plan else plan_planned
            fact = fact_map.pop((cat.category_id, kind), Decimal("0"))
            deviation = fact - plan_total
            pct = (fact / plan_total * 100) if plan_total > 0 else Decimal("0")
            return {
                "category_id": cat.category_id,
                "title": cat.title,
                "is_system": cat.is_system,
                "position": position_map.get((cat.category_id, kind), 0),
                "plan": plan_total,
                "plan_manual": plan_manual,
                "plan_planned": plan_planned,
                "fact": fact,
                "deviation": deviation,
                "pct": pct,
            }

        # Sort by position (if set), then is_system, then title
        def _sort_key(cat: CategoryInfo, kind: str):
            pos = position_map.get((cat.category_id, kind), 0)
            return (cat.is_system, pos if pos > 0 else 9999, cat.title)

        income_lines = [
            _build_line(c, "INCOME")
            for c in sorted(active_income, key=lambda c: _sort_key(c, "INCOME"))
        ]
        expense_lines = [
            _build_line(c, "EXPENSE")
            for c in sorted(active_expense, key=lambda c: _sort_key(c, "EXPENSE"))
        ]

        # --- Remaining fact → "Прочие" ---
        other_income_fact = Decimal("0")
        other_expense_fact = Decimal("0")
        for (cat_id, op_type), total in fact_map.items():
            if op_type == "INCOME":
                other_income_fact += total
            elif op_type == "EXPENSE":
                other_expense_fact += total

        # Remaining planned occurrences for uncategorized
        other_income_planned = Decimal("0")
        other_expense_planned = Decimal("0")
        for (cat_id, kind), total in planned_map.items():
            if kind == "INCOME":
                other_income_planned += total
            elif kind == "EXPENSE":
                other_expense_planned += total

        other_income_manual = plan_map.get((system_other_income_id, "INCOME"), Decimal("0")) if system_other_income_id else Decimal("0")
        other_expense_manual = plan_map.get((system_other_expense_id, "EXPENSE"), Decimal("0")) if system_other_expense_id else Decimal("0")

        other_income_plan = (other_income_manual + other_income_planned) if has_manual_plan else other_income_planned
        other_expense_plan = (other_expense_manual + other_expense_planned) if has_manual_plan else other_expense_planned

        other_income = {
            "plan": other_income_plan,
            "fact": other_income_fact,
            "deviation": other_income_fact - other_income_plan,
        }
        other_expense = {
            "plan": other_expense_plan,
            "fact": other_expense_fact,
            "deviation": other_expense_fact - other_expense_plan,
        }

        # --- Totals ---
        plan_income = sum(l["plan"] for l in income_lines) + other_income["plan"]
        fact_income = sum(l["fact"] for l in income_lines) + other_income["fact"]
        plan_expense = sum(l["plan"] for l in expense_lines) + other_expense["plan"]
        fact_expense = sum(l["fact"] for l in expense_lines) + other_expense["fact"]

        totals = {
            "plan_income": plan_income,
            "fact_income": fact_income,
            "plan_expense": plan_expense,
            "fact_expense": fact_expense,
            "plan_result": plan_income - plan_expense,
            "fact_result": fact_income - fact_expense,
        }

        # All active categories for filter UI (unfiltered)
        all_active_cats = [
            {"category_id": c.category_id, "title": c.title, "category_type": c.category_type}
            for c in all_categories if not c.is_archived
        ]

        return {
            "grain": grain,
            "period_label": period_label,
            "year": year,
            "month": month,
            "date_param": date_param.isoformat() if date_param else None,
            "has_manual_plan": has_manual_plan,
            "month_name": MONTH_NAMES.get(month, str(month)),
            "income_lines": income_lines,
            "expense_lines": expense_lines,
            "other_income": other_income,
            "other_expense": other_expense,
            "totals": totals,
            "all_categories": all_active_cats,
            "selected_category_ids": category_ids or [],
        }

    def _compute_date_range(
        self,
        grain: str,
        date_param: date_type,
        year: int,
        month: int,
    ) -> tuple[date_type, date_type]:
        if grain == "day":
            return date_param, date_param + timedelta(days=1)
        elif grain == "week":
            monday = date_param - timedelta(days=date_param.weekday())
            return monday, monday + timedelta(days=7)
        elif grain == "month":
            start = date_type(year, month, 1)
            if month == 12:
                end = date_type(year + 1, 1, 1)
            else:
                end = date_type(year, month + 1, 1)
            return start, end
        else:  # year
            return date_type(year, 1, 1), date_type(year + 1, 1, 1)

    def _period_label(
        self,
        grain: str,
        range_start: date_type,
        range_end: date_type,
        year: int,
        month: int,
    ) -> str:
        if grain == "day":
            wd = DAY_NAMES_SHORT[range_start.weekday()]
            return f"{wd}, {range_start.strftime('%d.%m.%Y')}"
        elif grain == "week":
            end_day = range_end - timedelta(days=1)
            return f"{range_start.strftime('%d.%m')} – {end_day.strftime('%d.%m.%Y')}"
        elif grain == "month":
            return f"{MONTH_NAMES.get(month, str(month))} {year}"
        else:  # year
            return str(year)

    def _aggregate_planned_occurrences(
        self,
        account_id: int,
        range_start: date_type,
        range_end: date_type,
    ) -> Dict[tuple, Decimal]:
        """Aggregate planned operation amounts by (category_id, kind)."""
        rows = (
            self.db.query(
                OperationTemplateModel.category_id,
                OperationTemplateModel.kind,
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
                OperationOccurrence.scheduled_date >= range_start,
                OperationOccurrence.scheduled_date < range_end,
                OperationOccurrence.status != "SKIPPED",
            )
            .group_by(OperationTemplateModel.category_id, OperationTemplateModel.kind)
            .all()
        )
        result: Dict[tuple, Decimal] = {}
        for row in rows:
            result[(row.category_id, row.kind)] = row.total or Decimal("0")
        return result

    def _aggregate_fact(
        self,
        account_id: int,
        range_start: date_type,
        range_end: date_type,
    ) -> Dict[tuple, Decimal]:
        """Aggregate transactions by (category_id, operation_type)."""
        # Convert date to datetime for TransactionFeed.occurred_at comparison
        dt_start = datetime(range_start.year, range_start.month, range_start.day)
        dt_end = datetime(range_end.year, range_end.month, range_end.day)

        rows = (
            self.db.query(
                TransactionFeed.category_id,
                TransactionFeed.operation_type,
                func.sum(TransactionFeed.amount).label("total"),
            )
            .filter(
                TransactionFeed.account_id == account_id,
                TransactionFeed.operation_type.in_(["INCOME", "EXPENSE"]),
                TransactionFeed.occurred_at >= dt_start,
                TransactionFeed.occurred_at < dt_end,
            )
            .group_by(TransactionFeed.category_id, TransactionFeed.operation_type)
            .all()
        )
        result: Dict[tuple, Decimal] = {}
        for row in rows:
            result[(row.category_id, row.operation_type)] = row.total or Decimal("0")
        return result


def build_budget_view(
    db: Session,
    account_id: int,
    year: int,
    month: int,
) -> Dict[str, Any]:
    """Legacy wrapper — delegates to BudgetViewService for month grain."""
    return BudgetViewService(db).build(
        account_id=account_id,
        grain="month",
        year=year,
        month=month,
    )


# ---------------------------------------------------------------------------
# Position management (read-model-level, not event-sourced)
# ---------------------------------------------------------------------------


def ensure_budget_positions(db: Session, budget_month_id: int, kind: str) -> None:
    """Auto-assign sequential positions if all are 0 (uninitialized)."""
    lines = db.query(BudgetLine).filter(
        BudgetLine.budget_month_id == budget_month_id,
        BudgetLine.kind == kind,
    ).order_by(BudgetLine.position, BudgetLine.category_id).all()

    if len(lines) <= 1:
        return

    if all(line.position == 0 for line in lines):
        for i, line in enumerate(lines):
            line.position = i + 1
        db.flush()


def swap_budget_position(
    db: Session,
    budget_month_id: int,
    category_id: int,
    kind: str,
    direction: str,
) -> bool:
    """Swap position of a budget line with its neighbor. Returns True if swapped."""
    ensure_budget_positions(db, budget_month_id, kind)

    current = db.query(BudgetLine).filter(
        BudgetLine.budget_month_id == budget_month_id,
        BudgetLine.category_id == category_id,
        BudgetLine.kind == kind,
    ).first()
    if not current:
        return False

    if direction == "up":
        neighbor = db.query(BudgetLine).filter(
            BudgetLine.budget_month_id == budget_month_id,
            BudgetLine.kind == kind,
            BudgetLine.position < current.position,
        ).order_by(BudgetLine.position.desc()).first()
    else:
        neighbor = db.query(BudgetLine).filter(
            BudgetLine.budget_month_id == budget_month_id,
            BudgetLine.kind == kind,
            BudgetLine.position > current.position,
        ).order_by(BudgetLine.position.asc()).first()

    if not neighbor:
        return False

    current.position, neighbor.position = neighbor.position, current.position
    db.flush()
    return True
