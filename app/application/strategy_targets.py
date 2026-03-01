"""
Strategy targets service — personal metric goals with progress tracking.

Supported metric types:
  DEBT_LOAD         — debt-to-assets ratio (%); direction DOWN
  TASK_DISCIPLINE   — on-time task completion (%); direction UP
  HABIT_DISCIPLINE  — habit completion over 30 days (%); direction UP
  INCOME_CATEGORY   — avg monthly income for a category (₽); direction UP
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session

from app.infrastructure.db.models import (
    StrategyTarget, CategoryInfo, TransactionFeed, HabitModel, HabitOccurrence,
)

# Direction is implicit from type (no field needed)
METRIC_DIRECTIONS: dict[str, str] = {
    "DEBT_LOAD": "DOWN",
    "TASK_DISCIPLINE": "UP",
    "HABIT_DISCIPLINE": "UP",
    "INCOME_CATEGORY": "UP",
}

METRIC_UNITS: dict[str, str] = {
    "DEBT_LOAD": "%",
    "TASK_DISCIPLINE": "%",
    "HABIT_DISCIPLINE": "%",
    "INCOME_CATEGORY": "₽",
}

METRIC_LABELS: dict[str, str] = {
    "DEBT_LOAD": "Долговая нагрузка",
    "TASK_DISCIPLINE": "Дисциплина задач",
    "HABIT_DISCIPLINE": "Дисциплина привычек",
    "INCOME_CATEGORY": "Доход по категории",
}


class StrategyTargetService:
    def __init__(self, db: Session):
        self.db = db

    # ── CRUD ──────────────────────────────────────────────────────────────

    def get_targets(self, account_id: int) -> list[StrategyTarget]:
        return (
            self.db.query(StrategyTarget)
            .filter(StrategyTarget.account_id == account_id, StrategyTarget.is_active == True)
            .order_by(StrategyTarget.created_at)
            .all()
        )

    def add_target(
        self,
        account_id: int,
        metric_type: str,
        title: str,
        target_value: float,
        category_id: int | None,
        current_value: float,
    ) -> StrategyTarget:
        t = StrategyTarget(
            account_id=account_id,
            metric_type=metric_type,
            title=title,
            target_value=target_value,
            baseline_value=current_value,
            category_id=category_id,
        )
        self.db.add(t)
        self.db.commit()
        self.db.refresh(t)
        return t

    def update_target(self, target_id: int, account_id: int, target_value: float, title: str) -> None:
        t = self.db.query(StrategyTarget).filter(
            StrategyTarget.id == target_id,
            StrategyTarget.account_id == account_id,
        ).first()
        if t:
            t.target_value = target_value
            t.title = title
            self.db.commit()

    def delete_target(self, target_id: int, account_id: int) -> None:
        t = self.db.query(StrategyTarget).filter(
            StrategyTarget.id == target_id,
            StrategyTarget.account_id == account_id,
        ).first()
        if t:
            self.db.delete(t)
            self.db.commit()

    # ── Current value computation ──────────────────────────────────────────

    def get_current_value(
        self, account_id: int, target: StrategyTarget, strategy_data: dict[str, Any]
    ) -> float:
        if target.metric_type == "DEBT_LOAD":
            return float(strategy_data.get("debt_ratio", 0))
        if target.metric_type == "TASK_DISCIPLINE":
            return float(strategy_data.get("global_discipline_percent", 0))
        if target.metric_type == "HABIT_DISCIPLINE":
            return self._habit_discipline(account_id)
        if target.metric_type == "INCOME_CATEGORY":
            return self._income_category(account_id, target.category_id)
        return 0.0

    def _habit_discipline(self, account_id: int) -> float:
        today = date.today()
        since = today - timedelta(days=30)
        habits = (
            self.db.query(HabitModel.habit_id)
            .filter(HabitModel.account_id == account_id, HabitModel.is_archived == False)
            .all()
        )
        if not habits:
            return 0.0
        habit_ids = [h.habit_id for h in habits]
        total = (
            self.db.query(sa_func.count(HabitOccurrence.id))
            .filter(
                HabitOccurrence.habit_id.in_(habit_ids),
                HabitOccurrence.scheduled_date >= since,
                HabitOccurrence.scheduled_date <= today,
            )
            .scalar() or 0
        )
        if total == 0:
            return 0.0
        done = (
            self.db.query(sa_func.count(HabitOccurrence.id))
            .filter(
                HabitOccurrence.habit_id.in_(habit_ids),
                HabitOccurrence.scheduled_date >= since,
                HabitOccurrence.scheduled_date <= today,
                HabitOccurrence.status == "DONE",
            )
            .scalar() or 0
        )
        return round(done / total * 100, 1)

    def _income_category(self, account_id: int, category_id: int | None) -> float:
        if not category_id:
            return 0.0
        today = date.today()
        # Average over last 3 months
        since = today.replace(day=1) - timedelta(days=60)
        result = (
            self.db.query(sa_func.sum(TransactionFeed.amount))
            .filter(
                TransactionFeed.account_id == account_id,
                TransactionFeed.operation_type == "INCOME",
                TransactionFeed.category_id == category_id,
                TransactionFeed.occurred_at >= since,
                TransactionFeed.currency == "RUB",
            )
            .scalar() or 0
        )
        months = max(1, (today.year - since.year) * 12 + today.month - since.month)
        return round(float(result) / months, 0)

    # ── Progress computation ───────────────────────────────────────────────

    def compute_targets_progress(
        self, account_id: int, strategy_data: dict[str, Any]
    ) -> list[dict[str, Any]]:
        targets = self.get_targets(account_id)
        result = []
        for t in targets:
            current = self.get_current_value(account_id, t, strategy_data)
            direction = METRIC_DIRECTIONS.get(t.metric_type, "UP")
            unit = METRIC_UNITS.get(t.metric_type, "")
            baseline = t.baseline_value if t.baseline_value is not None else current

            # Progress toward target
            if direction == "UP":
                achieved = current >= t.target_value
                if t.target_value > 0:
                    pct = min(100, round(current / t.target_value * 100, 0))
                else:
                    pct = 100.0
            else:  # DOWN
                achieved = current <= t.target_value
                if baseline > t.target_value:
                    pct = min(100, max(0, round(
                        (baseline - current) / (baseline - t.target_value) * 100, 0
                    )))
                elif current <= t.target_value:
                    pct = 100.0
                else:
                    pct = 0.0

            result.append({
                "id": t.id,
                "title": t.title,
                "metric_type": t.metric_type,
                "metric_label": METRIC_LABELS.get(t.metric_type, t.metric_type),
                "direction": direction,
                "unit": unit,
                "current": current,
                "target": t.target_value,
                "baseline": baseline,
                "progress_pct": int(pct),
                "achieved": achieved,
                "category_id": t.category_id,
            })
        return result

    # ── Income categories (for the add-form dropdown) ─────────────────────

    def get_income_categories(self, account_id: int) -> list[CategoryInfo]:
        return (
            self.db.query(CategoryInfo)
            .filter(
                CategoryInfo.account_id == account_id,
                CategoryInfo.category_type == "INCOME",
                CategoryInfo.is_archived == False,
                CategoryInfo.is_system == False,
            )
            .order_by(CategoryInfo.title)
            .all()
        )
