"""
XP History service — read-side queries for XP events with descriptions.
"""
from __future__ import annotations

import math
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.infrastructure.db.models import XpEvent, EventLog

MSK = timezone(timedelta(hours=3))

# Maps event_log reason → base human-readable label
XP_TYPE_LABELS: dict[str, str] = {
    "task_completed": "Закрыта задача",
    "task_occurrence_completed": "Закрыта задача",
    "habit_occurrence_completed": "Выполнена привычка",
    "transaction_created": "Добавлена операция",
    "goal_achieved": "Достигнута цель",
}

# Human-readable labels for the filter dropdown (same keys)
XP_REASON_FILTER_OPTIONS: list[tuple[str, str]] = [
    ("task_completed", "Закрыта задача (одноразовая)"),
    ("task_occurrence_completed", "Закрыта задача (повторяющаяся)"),
    ("habit_occurrence_completed", "Выполнена привычка"),
    ("transaction_created", "Добавлена операция"),
    ("goal_achieved", "Достигнута цель"),
]


def describe_xp_event(
    reason: str,
    title: str | None = None,
    extra: str | None = None,
) -> str:
    """
    Build a human-readable description for an XP event.

    Args:
        reason: The xp_events.reason value (matches event_log.event_type).
        title:  Resolved entity title (task/habit/goal name), if available.
        extra:  For transaction_created — the transaction description text.

    Returns:
        Formatted string, e.g. 'Закрыта задача: «Купить продукты»'.
    """
    base = XP_TYPE_LABELS.get(reason, "Начисление XP")

    if reason == "transaction_created":
        if extra:
            return f"{base}: {extra}"
        return base

    if title:
        return f"{base}: \u00ab{title}\u00bb"

    return base


class XpHistoryService:
    def __init__(self, db: Session):
        self.db = db

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def list_recent(self, user_id: int, limit: int = 5) -> list[dict]:
        """Return the last *limit* XP events for *user_id*, enriched with descriptions."""
        rows = self._base_query(user_id).limit(limit).all()
        return self._enrich(rows)

    def list_paginated(
        self,
        user_id: int,
        page: int = 1,
        page_size: int = 20,
        from_date: date | None = None,
        to_date: date | None = None,
        min_xp: int | None = None,
        reason: str | None = None,
    ) -> tuple[list[dict], int, int]:
        """
        Return (items, total_count, total_pages) for the given filters.

        Dates are interpreted as MSK calendar days.
        """
        q = self._base_query(user_id)

        if from_date:
            from_dt = datetime(from_date.year, from_date.month, from_date.day, 0, 0, 0, tzinfo=MSK)
            q = q.filter(XpEvent.created_at >= from_dt)
        if to_date:
            to_dt = datetime(to_date.year, to_date.month, to_date.day, 23, 59, 59, tzinfo=MSK)
            q = q.filter(XpEvent.created_at <= to_dt)
        if min_xp is not None:
            q = q.filter(XpEvent.xp_amount >= min_xp)
        if reason:
            q = q.filter(XpEvent.reason == reason)

        total = q.count()
        total_pages = max(1, math.ceil(total / page_size))
        page = max(1, min(page, total_pages))

        rows = q.offset((page - 1) * page_size).limit(page_size).all()
        items = self._enrich(rows)
        return items, total, total_pages

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _base_query(self, user_id: int):
        return (
            self.db.query(XpEvent, EventLog)
            .outerjoin(EventLog, EventLog.id == XpEvent.source_event_id)
            .filter(XpEvent.user_id == user_id)
            .order_by(XpEvent.created_at.desc())
        )

    def _enrich(self, rows: list[tuple]) -> list[dict]:
        """Resolve entity titles in batch, then format each row."""
        # --- Collect IDs for batch lookup ---
        task_ids: set[int] = set()
        template_ids: set[int] = set()
        habit_ids: set[int] = set()

        for xp_ev, ev_log in rows:
            p = ev_log.payload_json if ev_log else None
            if not p:
                continue
            if xp_ev.reason == "task_completed" and p.get("task_id"):
                task_ids.add(int(p["task_id"]))
            elif xp_ev.reason == "task_occurrence_completed" and p.get("template_id"):
                template_ids.add(int(p["template_id"]))
            elif xp_ev.reason == "habit_occurrence_completed" and p.get("habit_id"):
                habit_ids.add(int(p["habit_id"]))

        # --- Batch load ---
        from app.infrastructure.db.models import TaskModel, TaskTemplateModel, HabitModel

        task_titles: dict[int, str] = {}
        template_titles: dict[int, str] = {}
        habit_titles: dict[int, str] = {}

        if task_ids:
            for t in self.db.query(TaskModel).filter(TaskModel.task_id.in_(task_ids)).all():
                task_titles[t.task_id] = t.title
        if template_ids:
            for t in self.db.query(TaskTemplateModel).filter(TaskTemplateModel.template_id.in_(template_ids)).all():
                template_titles[t.template_id] = t.title
        if habit_ids:
            for h in self.db.query(HabitModel).filter(HabitModel.habit_id.in_(habit_ids)).all():
                habit_titles[h.habit_id] = h.title

        # --- Format rows ---
        result = []
        for xp_ev, ev_log in rows:
            p = ev_log.payload_json if ev_log else None
            title: str | None = None
            extra: str | None = None

            if p:
                if xp_ev.reason == "task_completed":
                    title = task_titles.get(int(p["task_id"])) if p.get("task_id") else None
                elif xp_ev.reason == "task_occurrence_completed":
                    title = template_titles.get(int(p["template_id"])) if p.get("template_id") else None
                elif xp_ev.reason == "habit_occurrence_completed":
                    title = habit_titles.get(int(p["habit_id"])) if p.get("habit_id") else None
                elif xp_ev.reason == "transaction_created":
                    extra = p.get("description") or None

            description = describe_xp_event(xp_ev.reason, title=title, extra=extra)

            # Convert created_at to MSK
            try:
                created_msk = xp_ev.created_at.astimezone(MSK)
            except (AttributeError, TypeError):
                created_msk = xp_ev.created_at  # fallback if tz-unaware

            result.append({
                "created_at": created_msk.strftime("%d-%m-%Y %H:%M") if created_msk else "—",
                "description": description,
                "xp_amount": xp_ev.xp_amount,
                "reason": xp_ev.reason,
            })

        return result
