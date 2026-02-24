"""
Project analytics — discipline, velocity, cycle-time computation.

Computes metrics from the TaskModel read-model and EventLog,
caches results in ProjectAnalyticsSnapshot.
"""
from __future__ import annotations

import json
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session

from app.infrastructure.db.models import (
    TaskModel,
    ProjectModel,
    ProjectAnalyticsSnapshot,
    EventLog,
)


class ProjectAnalyticsService:
    def __init__(self, db: Session):
        self.db = db

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def compute(
        self,
        project_id: int,
        account_id: int,
        year: int,
        month: int,
    ) -> dict[str, Any]:
        """Compute full analytics for a project/month and cache in snapshot."""
        tasks = self._project_tasks(project_id, account_id)
        if not tasks:
            return self._empty(project_id, year, month)

        month_start, month_end = _month_range(year, month)
        today = date.today()

        completed_in_month = [
            t for t in tasks
            if t.completed_at is not None
            and month_start <= t.completed_at.date() < month_end
        ]

        # ── Discipline ──
        on_time = 0
        late = 0
        for t in completed_in_month:
            if t.due_date is None:
                continue
            if t.completed_at.date() <= t.due_date:
                on_time += 1
            else:
                late += 1

        total_with_due = on_time + late
        discipline_pct = round(on_time / total_with_due * 100, 2) if total_with_due else Decimal(0)

        # ── Overdue open ──
        overdue_open = sum(
            1 for t in tasks
            if t.due_date is not None
            and t.due_date < today
            and t.completed_at is None
            and t.status == "ACTIVE"
        )

        # ── Velocity by week ──
        weeks = [0, 0, 0, 0, 0]
        for t in completed_in_month:
            day = t.completed_at.day
            idx = min((day - 1) // 7, 4)
            weeks[idx] += 1

        # ── Cycle time ──
        cycle_days: list[float] = []
        for t in completed_in_month:
            if t.created_at is not None:
                delta = t.completed_at - t.created_at
                cycle_days.append(delta.total_seconds() / 86400)
        avg_cycle = round(sum(cycle_days) / len(cycle_days), 2) if cycle_days else Decimal(0)

        # ── Reschedule count ──
        task_ids = [t.task_id for t in tasks]
        reschedule_count = self._count_reschedules(
            account_id, task_ids, month_start, month_end,
        )

        result = {
            "project_id": project_id,
            "year": year,
            "month": month,
            "tasks_completed_total": len(completed_in_month),
            "tasks_completed_on_time": on_time,
            "tasks_completed_late": late,
            "discipline_percent": float(discipline_pct),
            "overdue_open_count": overdue_open,
            "reschedule_count": reschedule_count,
            "velocity_week1": weeks[0],
            "velocity_week2": weeks[1],
            "velocity_week3": weeks[2],
            "velocity_week4": weeks[3],
            "velocity_week5": weeks[4],
            "velocity_total": sum(weeks),
            "avg_cycle_time_days": float(avg_cycle),
        }

        self._upsert_snapshot(result)
        return result

    def get_mini_summary(
        self,
        project_id: int,
        account_id: int,
    ) -> dict[str, Any] | None:
        """Lightweight summary for the project detail page (current month)."""
        tasks = self._project_tasks(project_id, account_id)
        if not tasks:
            return None

        today = date.today()
        month_start, month_end = _month_range(today.year, today.month)

        completed_in_month = [
            t for t in tasks
            if t.completed_at is not None
            and month_start <= t.completed_at.date() < month_end
        ]

        on_time = 0
        late = 0
        for t in completed_in_month:
            if t.due_date is None:
                continue
            if t.completed_at.date() <= t.due_date:
                on_time += 1
            else:
                late += 1

        total_with_due = on_time + late
        discipline_pct = round(on_time / total_with_due * 100, 1) if total_with_due else 0

        overdue_open = sum(
            1 for t in tasks
            if t.due_date is not None
            and t.due_date < today
            and t.completed_at is None
            and t.status == "ACTIVE"
        )

        cycle_days: list[float] = []
        for t in completed_in_month:
            if t.created_at is not None:
                delta = t.completed_at - t.created_at
                cycle_days.append(delta.total_seconds() / 86400)
        avg_cycle = round(sum(cycle_days) / len(cycle_days), 1) if cycle_days else 0

        return {
            "discipline_percent": discipline_pct,
            "overdue_open_count": overdue_open,
            "velocity_total": len(completed_in_month),
            "avg_cycle_time_days": avg_cycle,
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _project_tasks(self, project_id: int, account_id: int) -> list[TaskModel]:
        return (
            self.db.query(TaskModel)
            .filter(
                TaskModel.project_id == project_id,
                TaskModel.account_id == account_id,
            )
            .all()
        )

    def _count_reschedules(
        self,
        account_id: int,
        task_ids: list[int],
        month_start: date,
        month_end: date,
    ) -> int:
        if not task_ids:
            return 0

        month_start_dt = datetime(month_start.year, month_start.month, month_start.day, tzinfo=timezone.utc)
        month_end_dt = datetime(month_end.year, month_end.month, month_end.day, tzinfo=timezone.utc)

        try:
            # PostgreSQL path: use JSONB operators
            count = (
                self.db.query(sa_func.count(EventLog.id))
                .filter(
                    EventLog.event_type == "task_updated",
                    EventLog.account_id == account_id,
                    EventLog.payload_json.has_key("due_date"),  # noqa: W601
                    EventLog.payload_json["task_id"].as_integer().in_(task_ids),
                    EventLog.occurred_at >= month_start_dt,
                    EventLog.occurred_at < month_end_dt,
                )
                .scalar()
            )
            return count or 0
        except Exception:
            # SQLite fallback for tests: load events and filter in Python
            events = (
                self.db.query(EventLog)
                .filter(
                    EventLog.event_type == "task_updated",
                    EventLog.account_id == account_id,
                    EventLog.occurred_at >= month_start_dt,
                    EventLog.occurred_at < month_end_dt,
                )
                .all()
            )
            count = 0
            for ev in events:
                payload = ev.payload_json
                if isinstance(payload, str):
                    payload = json.loads(payload)
                if "due_date" in payload and payload.get("task_id") in task_ids:
                    count += 1
            return count

    def _upsert_snapshot(self, data: dict[str, Any]) -> None:
        snap = (
            self.db.query(ProjectAnalyticsSnapshot)
            .filter(
                ProjectAnalyticsSnapshot.project_id == data["project_id"],
                ProjectAnalyticsSnapshot.year == data["year"],
                ProjectAnalyticsSnapshot.month == data["month"],
            )
            .first()
        )
        if snap is None:
            snap = ProjectAnalyticsSnapshot(
                project_id=data["project_id"],
                year=data["year"],
                month=data["month"],
            )
            self.db.add(snap)

        snap.tasks_completed_total = data["tasks_completed_total"]
        snap.tasks_completed_on_time = data["tasks_completed_on_time"]
        snap.tasks_completed_late = data["tasks_completed_late"]
        snap.discipline_percent = data["discipline_percent"]
        snap.overdue_open_count = data["overdue_open_count"]
        snap.reschedule_count = data["reschedule_count"]
        snap.velocity_week1 = data["velocity_week1"]
        snap.velocity_week2 = data["velocity_week2"]
        snap.velocity_week3 = data["velocity_week3"]
        snap.velocity_week4 = data["velocity_week4"]
        snap.velocity_week5 = data["velocity_week5"]
        snap.avg_cycle_time_days = data["avg_cycle_time_days"]
        snap.calculated_at = sa_func.now()

        self.db.flush()

    @staticmethod
    def _empty(project_id: int, year: int, month: int) -> dict[str, Any]:
        return {
            "project_id": project_id,
            "year": year,
            "month": month,
            "tasks_completed_total": 0,
            "tasks_completed_on_time": 0,
            "tasks_completed_late": 0,
            "discipline_percent": 0,
            "overdue_open_count": 0,
            "reschedule_count": 0,
            "velocity_week1": 0,
            "velocity_week2": 0,
            "velocity_week3": 0,
            "velocity_week4": 0,
            "velocity_week5": 0,
            "velocity_total": 0,
            "avg_cycle_time_days": 0,
        }


# ------------------------------------------------------------------
# Pure helpers
# ------------------------------------------------------------------

def _month_range(year: int, month: int) -> tuple[date, date]:
    """Return (first_day, first_day_of_next_month)."""
    start = date(year, month, 1)
    if month == 12:
        end = date(year + 1, 1, 1)
    else:
        end = date(year, month + 1, 1)
    return start, end
