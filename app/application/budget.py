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
    BudgetMonth, BudgetLine, BudgetGoalPlan, BudgetGoalWithdrawalPlan, BudgetVariant, BudgetPlanTemplate,
    BudgetVariantHiddenCategory, BudgetVariantHiddenGoal, BudgetVariantHiddenWithdrawalGoal,
    CategoryInfo, TransactionFeed,
    OperationTemplateModel, OperationOccurrence, GoalInfo,
)
from app.domain.budget import Budget
from app.readmodels.projectors.budget import BudgetProjector


class BudgetValidationError(ValueError):
    pass


# ---------------------------------------------------------------------------
# Budget Variant — granularity restrictions
# ---------------------------------------------------------------------------

# Ordered from finest to coarsest
GRANULARITY_ORDER = ["day", "week", "month", "year"]

GRANULARITY_LABELS = {
    "day": "День",
    "week": "Неделя",
    "month": "Месяц",
    "year": "Год",
}


def get_allowed_granularities(base_granularity: str) -> List[str]:
    """Return list of view granularities allowed for the given base.

    Rule: only base granularity and coarser (upward aggregation).
    e.g. base=MONTH => ["month", "year"]
         base=WEEK  => ["week", "month", "year"]
         base=DAY   => ["day", "week", "month", "year"]
    """
    base = base_granularity.lower()
    if base not in GRANULARITY_ORDER:
        base = "month"
    idx = GRANULARITY_ORDER.index(base)
    return GRANULARITY_ORDER[idx:]


def clamp_granularity(grain: str, base_granularity: str) -> str:
    """If grain is finer than base, return the base. Otherwise return grain as-is."""
    allowed = get_allowed_granularities(base_granularity)
    if grain.lower() in allowed:
        return grain.lower()
    return allowed[0]  # fallback to base


class CreateBudgetVariantUseCase:
    """Create a new BudgetVariant for the account."""

    def __init__(self, db: Session):
        self.db = db

    def execute(
        self,
        account_id: int,
        name: str,
        base_granularity: str = "MONTH",
        week_starts_on: int = 1,
        timezone: str = "Europe/Moscow",
    ) -> BudgetVariant:
        name = name.strip()
        if not name:
            raise BudgetValidationError("Название варианта обязательно")

        bg = base_granularity.upper()
        if bg not in ("DAY", "WEEK", "MONTH", "YEAR"):
            raise BudgetValidationError("Недопустимая гранулярность")

        variant = BudgetVariant(
            account_id=account_id,
            name=name,
            base_granularity=bg,
            week_starts_on=week_starts_on,
            timezone=timezone,
            is_archived=False,
        )
        self.db.add(variant)
        self.db.flush()
        return variant


class AttachBudgetDataUseCase:
    """Attach orphan budget_months (variant_id IS NULL) to the given variant."""

    def __init__(self, db: Session):
        self.db = db

    def execute(self, account_id: int, variant_id: int) -> int:
        """Returns number of budget_months attached."""
        count = (
            self.db.query(BudgetMonth)
            .filter(
                BudgetMonth.account_id == account_id,
                BudgetMonth.budget_variant_id.is_(None),
            )
            .update({BudgetMonth.budget_variant_id: variant_id})
        )
        self.db.flush()
        return count


def get_active_variant(db: Session, account_id: int, variant_id: int | None = None) -> BudgetVariant | None:
    """Load variant by id (if given) or the first non-archived by created_at."""
    if variant_id is not None:
        return db.query(BudgetVariant).filter(
            BudgetVariant.id == variant_id,
            BudgetVariant.account_id == account_id,
        ).first()

    return db.query(BudgetVariant).filter(
        BudgetVariant.account_id == account_id,
        BudgetVariant.is_archived == False,
    ).order_by(BudgetVariant.created_at.asc()).first()


def get_all_variants(db: Session, account_id: int) -> list[BudgetVariant]:
    """All variants for the account, non-archived first, then by created_at."""
    return db.query(BudgetVariant).filter(
        BudgetVariant.account_id == account_id,
    ).order_by(BudgetVariant.is_archived.asc(), BudgetVariant.created_at.asc()).all()


def has_orphan_budget_data(db: Session, account_id: int) -> bool:
    """Check if there are budget_months without a variant."""
    return db.query(BudgetMonth).filter(
        BudgetMonth.account_id == account_id,
        BudgetMonth.budget_variant_id.is_(None),
    ).first() is not None


class ArchiveBudgetVariantUseCase:
    """Archive a budget variant. Cannot archive the last active variant."""

    def __init__(self, db: Session):
        self.db = db

    def execute(self, account_id: int, variant_id: int) -> None:
        variant = self.db.query(BudgetVariant).filter(
            BudgetVariant.id == variant_id,
            BudgetVariant.account_id == account_id,
        ).first()
        if not variant:
            raise BudgetValidationError("Вариант не найден")
        if variant.is_archived:
            raise BudgetValidationError("Вариант уже архивирован")

        # Count remaining active variants
        active_count = self.db.query(BudgetVariant).filter(
            BudgetVariant.account_id == account_id,
            BudgetVariant.is_archived == False,
        ).count()
        if active_count <= 1:
            raise BudgetValidationError("Нельзя архивировать последний активный вариант")

        variant.is_archived = True
        self.db.flush()


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
        budget_variant_id: int | None = None,
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
            budget_variant_id=budget_variant_id,
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
    """Batch-save budget plan lines for a given month.

    Optimized: appends all events in one batch, single commit, single projector run.
    """

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
        budget_variant_id: int | None = None,
    ) -> None:
        """
        Args:
            lines: list of {"category_id": int, "kind": str, "plan_amount": str, "note": str|None}
        """
        # Ensure month exists
        ensure_uc = EnsureBudgetMonthUseCase(self.db)
        budget_month_id = ensure_uc.execute(
            account_id, year, month, actor_user_id,
            budget_variant_id=budget_variant_id,
        )

        # Pre-load existing lines for this month to avoid N+1
        existing_lines = {
            (bl.category_id, bl.kind): bl
            for bl in self.db.query(BudgetLine).filter(
                BudgetLine.budget_month_id == budget_month_id,
            ).all()
        }

        # Collect events to append in batch
        next_id = self.db.query(func.max(BudgetLine.id)).scalar() or 0
        events = []

        for line in lines:
            plan_amount = line.get("plan_amount", "0")
            kind = line.get("kind", "EXPENSE")
            category_id = line["category_id"]

            if kind not in ("INCOME", "EXPENSE"):
                continue

            amount = Decimal(plan_amount)
            if amount < 0:
                continue

            # Skip zero amounts that have no existing line
            if amount == 0 and (category_id, kind) not in existing_lines:
                continue

            next_id += 1
            payload = Budget.set_plan(
                budget_month_id=budget_month_id,
                line_id=next_id,
                category_id=category_id,
                kind=kind,
                plan_amount=str(amount),
                note=line.get("note"),
            )
            events.append(payload)

        if not events:
            return

        # Append all events in batch
        for payload in events:
            self.event_repo.append_event(
                account_id=account_id,
                event_type="budget_line_set",
                payload=payload,
                actor_user_id=actor_user_id,
            )

        # Single commit + single projector run
        self.db.commit()
        BudgetProjector(self.db).run(account_id, event_types=["budget_line_set"])


class SaveGoalPlansUseCase:
    """Batch-save goal savings plan amounts for a given month."""

    def __init__(self, db: Session):
        self.db = db

    def execute(
        self,
        account_id: int,
        year: int,
        month: int,
        goal_plans: List[Dict[str, Any]],
        actor_user_id: int | None = None,
        budget_variant_id: int | None = None,
    ) -> None:
        """
        Args:
            goal_plans: list of {"goal_id": int, "plan_amount": str, "note": str|None}
        """
        # Ensure month exists
        ensure_uc = EnsureBudgetMonthUseCase(self.db)
        budget_month_id = ensure_uc.execute(
            account_id, year, month, actor_user_id,
            budget_variant_id=budget_variant_id,
        )

        for gp in goal_plans:
            goal_id = gp["goal_id"]
            plan_amount = Decimal(gp.get("plan_amount", "0"))
            note = gp.get("note")
            if plan_amount < 0:
                raise BudgetValidationError("plan_amount must be >= 0")

            # Validate goal exists and belongs to account
            goal = self.db.query(GoalInfo).filter(
                GoalInfo.goal_id == goal_id,
                GoalInfo.account_id == account_id,
            ).first()
            if not goal:
                continue
            if goal.is_system or goal.is_archived:
                continue

            # Upsert
            existing = self.db.query(BudgetGoalPlan).filter(
                BudgetGoalPlan.budget_month_id == budget_month_id,
                BudgetGoalPlan.goal_id == goal_id,
            ).first()

            if existing:
                existing.plan_amount = plan_amount
                existing.note = note
            else:
                if plan_amount == 0 and not note:
                    continue
                new_plan = BudgetGoalPlan(
                    budget_month_id=budget_month_id,
                    account_id=account_id,
                    goal_id=goal_id,
                    plan_amount=plan_amount,
                    note=note,
                )
                self.db.add(new_plan)

        self.db.commit()


class SaveGoalWithdrawalPlansUseCase:
    """Batch-save goal withdrawal plan amounts ('Взять из отложенного') for a given month."""

    def __init__(self, db: Session):
        self.db = db

    def execute(
        self,
        account_id: int,
        year: int,
        month: int,
        goal_plans: List[Dict[str, Any]],
        actor_user_id: int | None = None,
        budget_variant_id: int | None = None,
    ) -> None:
        """
        Args:
            goal_plans: list of {"goal_id": int, "plan_amount": str, "note": str|None}
        """
        ensure_uc = EnsureBudgetMonthUseCase(self.db)
        budget_month_id = ensure_uc.execute(
            account_id, year, month, actor_user_id,
            budget_variant_id=budget_variant_id,
        )

        for gp in goal_plans:
            goal_id = gp["goal_id"]
            plan_amount = Decimal(gp.get("plan_amount", "0"))
            note = gp.get("note")
            if plan_amount < 0:
                raise BudgetValidationError("plan_amount must be >= 0")

            goal = self.db.query(GoalInfo).filter(
                GoalInfo.goal_id == goal_id,
                GoalInfo.account_id == account_id,
            ).first()
            if not goal or goal.is_system or goal.is_archived:
                continue

            existing = self.db.query(BudgetGoalWithdrawalPlan).filter(
                BudgetGoalWithdrawalPlan.budget_month_id == budget_month_id,
                BudgetGoalWithdrawalPlan.goal_id == goal_id,
            ).first()

            if existing:
                existing.plan_amount = plan_amount
                existing.note = note
            else:
                if plan_amount == 0 and not note:
                    continue
                self.db.add(BudgetGoalWithdrawalPlan(
                    budget_month_id=budget_month_id,
                    account_id=account_id,
                    goal_id=goal_id,
                    plan_amount=plan_amount,
                    note=note,
                ))

        self.db.commit()


# ---------------------------------------------------------------------------
# Copy / Template Use Cases
# ---------------------------------------------------------------------------


class CopyBudgetPlanUseCase:
    """Copy plan_amounts from a source period to a target period within the same variant.

    Copies both BudgetLine (category plans) and BudgetGoalPlan (goal savings).
    Overwrites existing values in target.
    """

    def __init__(self, db: Session):
        self.db = db

    def execute(
        self,
        account_id: int,
        from_year: int,
        from_month: int,
        to_year: int,
        to_month: int,
        budget_variant_id: int | None = None,
        actor_user_id: int | None = None,
    ) -> int:
        """Copy plan from source to target. Returns number of lines copied."""
        # Find source budget_month
        q = self.db.query(BudgetMonth).filter(
            BudgetMonth.account_id == account_id,
            BudgetMonth.year == from_year,
            BudgetMonth.month == from_month,
        )
        if budget_variant_id is not None:
            q = q.filter(BudgetMonth.budget_variant_id == budget_variant_id)
        source_bm = q.first()

        if not source_bm:
            return 0

        # Read source lines
        source_lines = self.db.query(BudgetLine).filter(
            BudgetLine.budget_month_id == source_bm.id,
        ).all()

        source_goal_plans = self.db.query(BudgetGoalPlan).filter(
            BudgetGoalPlan.budget_month_id == source_bm.id,
        ).all()

        if not source_lines and not source_goal_plans:
            return 0

        # Ensure target month exists
        target_bm_id = EnsureBudgetMonthUseCase(self.db).execute(
            account_id=account_id,
            year=to_year,
            month=to_month,
            actor_user_id=actor_user_id,
            budget_variant_id=budget_variant_id,
        )

        # Copy budget lines via batch save
        if source_lines:
            lines_data = [
                {
                    "category_id": sl.category_id,
                    "kind": sl.kind,
                    "plan_amount": str(sl.plan_amount),
                    "note": sl.note,
                }
                for sl in source_lines
            ]
            SaveBudgetPlanUseCase(self.db).execute(
                account_id=account_id,
                year=to_year,
                month=to_month,
                lines=lines_data,
                actor_user_id=actor_user_id,
                budget_variant_id=budget_variant_id,
            )

        # Copy goal plans
        if source_goal_plans:
            goal_plans_data = [
                {"goal_id": gp.goal_id, "plan_amount": str(gp.plan_amount)}
                for gp in source_goal_plans
            ]
            SaveGoalPlansUseCase(self.db).execute(
                account_id=account_id,
                year=to_year,
                month=to_month,
                goal_plans=goal_plans_data,
                actor_user_id=actor_user_id,
                budget_variant_id=budget_variant_id,
            )

        return len(source_lines) + len(source_goal_plans)


class SaveAsTemplateUseCase:
    """Save current period's plan as a template for the variant.

    Overwrites existing template for this variant entirely.
    """

    def __init__(self, db: Session):
        self.db = db

    def execute(
        self,
        account_id: int,
        year: int,
        month: int,
        budget_variant_id: int,
    ) -> int:
        """Save plan as template. Returns number of template lines created."""
        # Find budget_month
        bm = self.db.query(BudgetMonth).filter(
            BudgetMonth.account_id == account_id,
            BudgetMonth.year == year,
            BudgetMonth.month == month,
            BudgetMonth.budget_variant_id == budget_variant_id,
        ).first()

        if not bm:
            return 0

        # Read source lines
        source_lines = self.db.query(BudgetLine).filter(
            BudgetLine.budget_month_id == bm.id,
            BudgetLine.plan_amount > 0,
        ).all()

        # Delete existing template for this variant
        self.db.query(BudgetPlanTemplate).filter(
            BudgetPlanTemplate.budget_variant_id == budget_variant_id,
            BudgetPlanTemplate.account_id == account_id,
        ).delete()
        self.db.flush()

        # Create new template lines
        for sl in source_lines:
            self.db.add(BudgetPlanTemplate(
                budget_variant_id=budget_variant_id,
                account_id=account_id,
                category_id=sl.category_id,
                kind=sl.kind,
                default_planned_amount=sl.plan_amount,
                position=sl.position,
            ))

        self.db.commit()
        return len(source_lines)


class ApplyTemplateToPeriodUseCase:
    """Apply a variant's template to a specific period.

    Creates/updates BudgetLines using the template's default amounts.
    """

    def __init__(self, db: Session):
        self.db = db

    def execute(
        self,
        account_id: int,
        year: int,
        month: int,
        budget_variant_id: int,
        actor_user_id: int | None = None,
    ) -> int:
        """Apply template. Returns number of lines applied."""
        # Read template
        template_lines = self.db.query(BudgetPlanTemplate).filter(
            BudgetPlanTemplate.budget_variant_id == budget_variant_id,
            BudgetPlanTemplate.account_id == account_id,
        ).all()

        if not template_lines:
            return 0

        # Convert to SaveBudgetPlan format
        lines_data = [
            {
                "category_id": tl.category_id,
                "kind": tl.kind,
                "plan_amount": str(tl.default_planned_amount),
            }
            for tl in template_lines
        ]

        SaveBudgetPlanUseCase(self.db).execute(
            account_id=account_id,
            year=year,
            month=month,
            lines=lines_data,
            actor_user_id=actor_user_id,
            budget_variant_id=budget_variant_id,
        )

        return len(template_lines)


class CopyManualPlanForwardUseCase:
    """Copy manual plan (BudgetLine amounts) from a source period to N future periods.

    Supports copying all categories or a single category.
    Supports skip-filled or overwrite mode.
    """

    MAX_PERIODS_AHEAD = 24

    def __init__(self, db: Session):
        self.db = db

    def execute(
        self,
        account_id: int,
        from_year: int,
        from_month: int,
        periods_ahead: int,
        budget_variant_id: int,
        category_id: int | None = None,
        overwrite: bool = False,
        actor_user_id: int | None = None,
    ) -> int:
        """Copy manual plan forward. Returns total lines written."""
        if periods_ahead < 1:
            raise BudgetValidationError("periods_ahead должно быть >= 1")
        if periods_ahead > self.MAX_PERIODS_AHEAD:
            raise BudgetValidationError(f"periods_ahead не может быть > {self.MAX_PERIODS_AHEAD}")

        # Find source budget_month
        source_bm = self.db.query(BudgetMonth).filter(
            BudgetMonth.account_id == account_id,
            BudgetMonth.year == from_year,
            BudgetMonth.month == from_month,
            BudgetMonth.budget_variant_id == budget_variant_id,
        ).first()

        if not source_bm:
            return 0

        # Load source lines
        q = self.db.query(BudgetLine).filter(
            BudgetLine.budget_month_id == source_bm.id,
            BudgetLine.plan_amount > 0,
        )
        if category_id is not None:
            q = q.filter(BudgetLine.category_id == category_id)
        source_lines = q.all()

        if not source_lines:
            return 0

        total_written = 0

        for offset in range(1, periods_ahead + 1):
            target_year, target_month = _shift_month(from_year, from_month, offset)

            # Ensure target month exists
            target_bm_id = EnsureBudgetMonthUseCase(self.db).execute(
                account_id=account_id,
                year=target_year,
                month=target_month,
                actor_user_id=actor_user_id,
                budget_variant_id=budget_variant_id,
            )

            if not overwrite:
                # Load existing lines in target to skip filled
                existing_keys = {
                    (bl.category_id, bl.kind)
                    for bl in self.db.query(BudgetLine).filter(
                        BudgetLine.budget_month_id == target_bm_id,
                        BudgetLine.plan_amount > 0,
                    ).all()
                }
            else:
                existing_keys = set()

            # Build lines to copy (filtering out already-filled if not overwrite)
            lines_data = []
            for sl in source_lines:
                if not overwrite and (sl.category_id, sl.kind) in existing_keys:
                    continue
                lines_data.append({
                    "category_id": sl.category_id,
                    "kind": sl.kind,
                    "plan_amount": str(sl.plan_amount),
                    "note": sl.note,
                })

            if lines_data:
                SaveBudgetPlanUseCase(self.db).execute(
                    account_id=account_id,
                    year=target_year,
                    month=target_month,
                    lines=lines_data,
                    actor_user_id=actor_user_id,
                    budget_variant_id=budget_variant_id,
                )
                total_written += len(lines_data)

        return total_written


def _shift_month(year: int, month: int, offset: int) -> tuple[int, int]:
    """Shift (year, month) forward by offset months."""
    total = year * 12 + (month - 1) + offset
    return total // 12, total % 12 + 1


def has_template(db: Session, account_id: int, budget_variant_id: int) -> bool:
    """Check if a variant has a saved template."""
    return db.query(BudgetPlanTemplate).filter(
        BudgetPlanTemplate.budget_variant_id == budget_variant_id,
        BudgetPlanTemplate.account_id == account_id,
    ).first() is not None


def get_previous_period(year: int, month: int) -> tuple[int, int]:
    """Get the (year, month) of the previous period."""
    if month == 1:
        return year - 1, 12
    return year, month - 1


def has_previous_period_plan(
    db: Session, account_id: int, year: int, month: int,
    budget_variant_id: int | None = None,
) -> bool:
    """Check if the previous period has any budget lines."""
    prev_year, prev_month = get_previous_period(year, month)
    q = db.query(BudgetMonth).filter(
        BudgetMonth.account_id == account_id,
        BudgetMonth.year == prev_year,
        BudgetMonth.month == prev_month,
    )
    if budget_variant_id is not None:
        q = q.filter(BudgetMonth.budget_variant_id == budget_variant_id)
    bm = q.first()
    if not bm:
        return False
    return db.query(BudgetLine).filter(
        BudgetLine.budget_month_id == bm.id,
        BudgetLine.plan_amount > 0,
    ).first() is not None


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


# ---------------------------------------------------------------------------
# Category visibility per variant
# ---------------------------------------------------------------------------

def get_hidden_category_ids(db: Session, variant_id: int) -> set:
    """Return set of category IDs hidden for this budget variant."""
    rows = db.query(BudgetVariantHiddenCategory.category_id).filter(
        BudgetVariantHiddenCategory.variant_id == variant_id,
    ).all()
    return {r.category_id for r in rows}


def save_hidden_category_ids(db: Session, variant_id: int, hidden_ids: set) -> None:
    """Replace all hidden category records for a variant."""
    db.query(BudgetVariantHiddenCategory).filter(
        BudgetVariantHiddenCategory.variant_id == variant_id,
    ).delete()
    for cat_id in hidden_ids:
        db.add(BudgetVariantHiddenCategory(variant_id=variant_id, category_id=cat_id))
    db.flush()


# ---------------------------------------------------------------------------
# Goal visibility per variant
# ---------------------------------------------------------------------------

def get_hidden_goal_ids(db: Session, variant_id: int) -> set:
    """Return set of goal IDs hidden for this budget variant."""
    rows = db.query(BudgetVariantHiddenGoal.goal_id).filter(
        BudgetVariantHiddenGoal.variant_id == variant_id,
    ).all()
    return {r.goal_id for r in rows}


def save_hidden_goal_ids(db: Session, variant_id: int, hidden_ids: set) -> None:
    """Replace all hidden goal records for a variant."""
    db.query(BudgetVariantHiddenGoal).filter(
        BudgetVariantHiddenGoal.variant_id == variant_id,
    ).delete()
    for goal_id in hidden_ids:
        db.add(BudgetVariantHiddenGoal(variant_id=variant_id, goal_id=goal_id))
    db.flush()


# Withdrawal goal visibility per variant
# ---------------------------------------------------------------------------

def get_hidden_withdrawal_goal_ids(db: Session, variant_id: int) -> set:
    """Return set of goal IDs hidden in the 'Взять из отложенного' section."""
    rows = db.query(BudgetVariantHiddenWithdrawalGoal.goal_id).filter(
        BudgetVariantHiddenWithdrawalGoal.variant_id == variant_id,
    ).all()
    return {r.goal_id for r in rows}


def save_hidden_withdrawal_goal_ids(db: Session, variant_id: int, hidden_ids: set) -> None:
    """Replace all hidden withdrawal goal records for a variant."""
    db.query(BudgetVariantHiddenWithdrawalGoal).filter(
        BudgetVariantHiddenWithdrawalGoal.variant_id == variant_id,
    ).delete()
    for goal_id in hidden_ids:
        db.add(BudgetVariantHiddenWithdrawalGoal(variant_id=variant_id, goal_id=goal_id))
    db.flush()
