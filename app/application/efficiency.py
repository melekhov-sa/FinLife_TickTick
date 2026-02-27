"""
Efficiency Score 1.0 — transparent productivity dashboard.

Computes a weighted composite score (0–100) from 6 task metrics:
  M1  on-time rate      (last 30 days, higher-is-better)
  M2  overdue open      (current count, lower-is-better)
  M3  reschedule count  (last 7 days, lower-is-better)
  M4  churn count       (archived without completion, last 7 days, lower-is-better)
  M5  WIP count         (in-progress tasks right now, lower-is-better)
  M6  velocity 7d       (tasks done / 7 days, higher-is-better)

All thresholds and weights are user-configurable via EfficiencySettings.
"""
from __future__ import annotations

from datetime import date, timedelta, datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.infrastructure.db.models import (
    TaskModel,
    TaskDueChangeLog,
    EfficiencySettings,
    EfficiencySnapshot,
    EfficiencySnapshotItem,
)


# ── Normalisation helpers (pure, testable in isolation) ──────────────────────

def _s_ratio(actual: float, green: float, yellow: float) -> float:
    """Higher-is-better metric: on-time rate, velocity."""
    if actual >= green:
        return 100.0
    if actual >= yellow:
        return 70.0
    return 40.0


def _s_penalty(actual: float, green: float, yellow: float) -> float:
    """Lower-is-better metric: overdue count, reschedule count, churn, WIP."""
    if actual <= green:
        return 100.0
    if actual <= yellow:
        return 70.0
    return 40.0


# ── Metric labels for UI ──────────────────────────────────────────────────────

METRIC_LABELS: dict[str, str] = {
    "ontime":     "On-time rate",
    "overdue":    "Просрочено",
    "reschedule": "Переносы (7д)",
    "churn":      "Архив без выполнения (7д)",
    "wip":        "В работе (WIP)",
    "velocity":   "Скорость (7д)",
}

METRIC_DESCRIPTIONS: dict[str, str] = {
    "ontime":     "Доля задач, выполненных в срок за последние 30 дней",
    "overdue":    "Активные задачи с прошедшим дедлайном",
    "reschedule": "Задачи, которым переносили срок за последние 7 дней",
    "churn":      "Задачи, архивированные без завершения за последние 7 дней",
    "wip":        "Задачи в статусе 'in_progress' прямо сейчас",
    "velocity":   "Среднее количество выполненных задач в день за 7 дней",
}


class EfficiencyService:
    def __init__(self, db: Session) -> None:
        self._db = db

    # ── Settings ──────────────────────────────────────────────────────────────

    def get_or_create_settings(self, account_id: int) -> EfficiencySettings:
        s = self._db.query(EfficiencySettings).filter_by(account_id=account_id).first()
        if s is None:
            s = EfficiencySettings(account_id=account_id)
            self._db.add(s)
            self._db.flush()
        return s

    def save_settings(self, account_id: int, form_data: dict) -> EfficiencySettings:
        s = self.get_or_create_settings(account_id)

        def _f(key: str, default: float) -> float:
            try:
                return float(form_data.get(key, default))
            except (ValueError, TypeError):
                return default

        def _i(key: str, default: int) -> int:
            try:
                return int(form_data.get(key, default))
            except (ValueError, TypeError):
                return default

        # Read raw weights
        w_ontime = _f("w_ontime", 0.25)
        w_overdue = _f("w_overdue", 0.20)
        w_reschedule = _f("w_reschedule", 0.15)
        w_churn = _f("w_churn", 0.15)
        w_wip = _f("w_wip", 0.15)
        w_velocity = _f("w_velocity", 0.10)

        # Auto-normalise weights to sum = 1.0
        total = w_ontime + w_overdue + w_reschedule + w_churn + w_wip + w_velocity
        if total <= 0:
            total = 1.0
        s.w_ontime = round(w_ontime / total, 3)
        s.w_overdue = round(w_overdue / total, 3)
        s.w_reschedule = round(w_reschedule / total, 3)
        s.w_churn = round(w_churn / total, 3)
        s.w_wip = round(w_wip / total, 3)
        s.w_velocity = round(w_velocity / total, 3)

        # Thresholds
        s.thr_ontime_green = _f("thr_ontime_green", 85.0)
        s.thr_ontime_yellow = _f("thr_ontime_yellow", 70.0)
        s.thr_overdue_green = _i("thr_overdue_green", 3)
        s.thr_overdue_yellow = _i("thr_overdue_yellow", 7)
        s.thr_reschedule_green = _i("thr_reschedule_green", 3)
        s.thr_reschedule_yellow = _i("thr_reschedule_yellow", 7)
        s.thr_churn_green = _i("thr_churn_green", 2)
        s.thr_churn_yellow = _i("thr_churn_yellow", 5)
        s.thr_wip_green = _i("thr_wip_green", 5)
        s.thr_wip_yellow = _i("thr_wip_yellow", 10)
        s.thr_velocity_green = _f("thr_velocity_green", 5.0)
        s.thr_velocity_yellow = _f("thr_velocity_yellow", 2.0)

        s.updated_at = datetime.now(tz=timezone.utc)
        self._db.commit()
        return s

    # ── Score computation ─────────────────────────────────────────────────────

    def calculate(self, account_id: int, snap_date: date) -> dict[str, Any]:
        """
        Compute efficiency metrics, upsert snapshot + items, return full data dict.
        """
        db = self._db
        settings = self.get_or_create_settings(account_id)

        window_30 = snap_date - timedelta(days=30)
        window_7 = snap_date - timedelta(days=7)

        # ── M1: On-time rate (last 30 days) ──────────────────────────────────
        completed_tasks = (
            db.query(TaskModel)
            .filter(
                TaskModel.account_id == account_id,
                TaskModel.status == "DONE",
                TaskModel.completed_at >= window_30,
                TaskModel.due_date.isnot(None),
            )
            .all()
        )
        ontime_items: list[dict] = []
        on_time_count = 0
        for t in completed_tasks:
            completed_day = t.completed_at.date() if hasattr(t.completed_at, "date") else t.completed_at
            if completed_day <= t.due_date:
                on_time_count += 1
            else:
                days_late = (completed_day - t.due_date).days
                ontime_items.append({
                    "task_id": t.task_id,
                    "detail": f"Сдано {days_late} дн. позже срока",
                })
        total_with_due = len(completed_tasks)
        ontime_rate = (on_time_count / total_with_due * 100.0) if total_with_due > 0 else 0.0

        # ── M2: Overdue open ──────────────────────────────────────────────────
        overdue_tasks = (
            db.query(TaskModel)
            .filter(
                TaskModel.account_id == account_id,
                TaskModel.status == "ACTIVE",
                TaskModel.due_date < snap_date,
            )
            .all()
        )
        overdue_open = len(overdue_tasks)
        overdue_items = [{"task_id": t.task_id, "detail": f"Просрочено на {(snap_date - t.due_date).days} дн."} for t in overdue_tasks]

        # ── M3: Reschedule count (last 7 days) ────────────────────────────────
        reschedule_rows = (
            db.query(TaskDueChangeLog)
            .filter(
                TaskDueChangeLog.user_id == account_id,
                TaskDueChangeLog.changed_at >= window_7,
            )
            .all()
        )
        seen_reschedule: set[int] = set()
        reschedule_items: list[dict] = []
        for r in reschedule_rows:
            if r.task_id not in seen_reschedule:
                seen_reschedule.add(r.task_id)
                reschedule_items.append({"task_id": r.task_id, "detail": f"{r.old_due_date} → {r.new_due_date}"})
        reschedule_count = len(seen_reschedule)

        # ── M4: Churn (archived without completion, last 7 days) ──────────────
        churn_tasks = (
            db.query(TaskModel)
            .filter(
                TaskModel.account_id == account_id,
                TaskModel.status == "ARCHIVED",
                TaskModel.archived_at >= window_7,
            )
            .all()
        )
        churn_count = len(churn_tasks)
        churn_items = [{"task_id": t.task_id, "detail": "Архивировано без выполнения"} for t in churn_tasks]

        # ── M5: WIP count ─────────────────────────────────────────────────────
        wip_tasks = (
            db.query(TaskModel)
            .filter(
                TaskModel.account_id == account_id,
                TaskModel.board_status == "in_progress",
                TaskModel.status == "ACTIVE",
            )
            .all()
        )
        wip_count = len(wip_tasks)
        wip_items = [{"task_id": t.task_id, "detail": "In progress"} for t in wip_tasks]

        # ── M6: Velocity 7d ────────────────────────────────────────────────────
        velocity_tasks = (
            db.query(TaskModel)
            .filter(
                TaskModel.account_id == account_id,
                TaskModel.status == "DONE",
                TaskModel.completed_at >= window_7,
            )
            .all()
        )
        velocity_7d_count = len(velocity_tasks)
        velocity_7d = round(velocity_7d_count / 7.0, 2)
        velocity_items = [{"task_id": t.task_id, "detail": f"Завершено"} for t in velocity_tasks]

        # ── Normalise to sub-scores ────────────────────────────────────────────
        s_ontime = _s_ratio(ontime_rate, float(settings.thr_ontime_green), float(settings.thr_ontime_yellow))
        s_overdue = _s_penalty(overdue_open, settings.thr_overdue_green, settings.thr_overdue_yellow)
        s_reschedule = _s_penalty(reschedule_count, settings.thr_reschedule_green, settings.thr_reschedule_yellow)
        s_churn = _s_penalty(churn_count, settings.thr_churn_green, settings.thr_churn_yellow)
        s_wip = _s_penalty(wip_count, settings.thr_wip_green, settings.thr_wip_yellow)
        s_velocity = _s_ratio(velocity_7d, float(settings.thr_velocity_green), float(settings.thr_velocity_yellow))

        # ── Composite score ────────────────────────────────────────────────────
        w_ontime = float(settings.w_ontime)
        w_overdue = float(settings.w_overdue)
        w_reschedule = float(settings.w_reschedule)
        w_churn = float(settings.w_churn)
        w_wip = float(settings.w_wip)
        w_velocity = float(settings.w_velocity)

        efficiency_score = round(
            w_ontime * s_ontime
            + w_overdue * s_overdue
            + w_reschedule * s_reschedule
            + w_churn * s_churn
            + w_wip * s_wip
            + w_velocity * s_velocity,
            2,
        )

        # ── Upsert snapshot ────────────────────────────────────────────────────
        snap = db.query(EfficiencySnapshot).filter_by(
            account_id=account_id, snapshot_date=snap_date
        ).first()
        if snap is None:
            snap = EfficiencySnapshot(account_id=account_id, snapshot_date=snap_date)
            db.add(snap)
            db.flush()

        snap.ontime_rate = ontime_rate
        snap.overdue_open = overdue_open
        snap.reschedule_count = reschedule_count
        snap.churn_count = churn_count
        snap.wip_count = wip_count
        snap.velocity_7d = velocity_7d
        snap.s_ontime = s_ontime
        snap.s_overdue = s_overdue
        snap.s_reschedule = s_reschedule
        snap.s_churn = s_churn
        snap.s_wip = s_wip
        snap.s_velocity = s_velocity
        snap.efficiency_score = efficiency_score
        snap.calculated_at = datetime.now(tz=timezone.utc)
        db.flush()

        # Delete old items and re-insert
        db.query(EfficiencySnapshotItem).filter_by(snapshot_id=snap.id).delete()

        all_items: list[tuple[str, list[dict]]] = [
            ("ontime", ontime_items),
            ("overdue", overdue_items),
            ("reschedule", reschedule_items),
            ("churn", churn_items),
            ("wip", wip_items),
            ("velocity", velocity_items),
        ]
        for metric_key, items in all_items:
            for item in items:
                db.add(EfficiencySnapshotItem(
                    snapshot_id=snap.id,
                    metric_key=metric_key,
                    task_id=item["task_id"],
                    detail=item.get("detail"),
                ))
        db.commit()

        return {
            "snapshot_id": snap.id,
            "snapshot_date": snap_date,
            # Raw values
            "ontime_rate": ontime_rate,
            "overdue_open": overdue_open,
            "reschedule_count": reschedule_count,
            "churn_count": churn_count,
            "wip_count": wip_count,
            "velocity_7d": velocity_7d,
            # Sub-scores
            "s_ontime": s_ontime,
            "s_overdue": s_overdue,
            "s_reschedule": s_reschedule,
            "s_churn": s_churn,
            "s_wip": s_wip,
            "s_velocity": s_velocity,
            # Weights (for display)
            "w_ontime": w_ontime,
            "w_overdue": w_overdue,
            "w_reschedule": w_reschedule,
            "w_churn": w_churn,
            "w_wip": w_wip,
            "w_velocity": w_velocity,
            # Composite
            "efficiency_score": efficiency_score,
        }

    def get_metric_items(self, snapshot_id: int, metric_key: str) -> list[dict]:
        """Return per-task drill-down items for a given metric, with task titles."""
        rows = (
            self._db.query(EfficiencySnapshotItem, TaskModel)
            .outerjoin(TaskModel, TaskModel.task_id == EfficiencySnapshotItem.task_id)
            .filter(
                EfficiencySnapshotItem.snapshot_id == snapshot_id,
                EfficiencySnapshotItem.metric_key == metric_key,
            )
            .all()
        )
        result = []
        for item, task in rows:
            result.append({
                "task_id": item.task_id,
                "title": task.title if task else f"Task #{item.task_id}",
                "due_date": task.due_date if task else None,
                "detail": item.detail,
            })
        return result
