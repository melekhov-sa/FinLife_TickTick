"""
Global search service — dialect-aware (PostgreSQL FTS / SQLite Python-filter fallback).
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.infrastructure.db.models import (
    CalendarEventModel,
    EventOccurrenceModel,
    OperationOccurrence,
    OperationTemplateModel,
    TaskModel,
    TransactionFeed,
)

_EMPTY: dict[str, Any] = {
    "tasks": [],
    "events": [],
    "operations": [],
    "transactions": [],
    "total": 0,
}


def _matches(query_lower: str, *fields: str | None) -> bool:
    """Case-insensitive substring match for SQLite fallback."""
    for f in fields:
        if f and query_lower in f.lower():
            return True
    return False


class SearchService:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ── public ───────────────────────────────────────────────────────────────

    def search(self, user_id: int, query: str, limit: int = 30) -> dict[str, Any]:
        if len(query.strip()) < 2:
            return dict(_EMPTY)

        dialect = self._dialect()
        per_type = max(1, min(10, limit // 4)) if limit < 40 else 10

        # Primary pass — only active records.
        tasks = self._search_tasks(user_id, query, dialect, per_type, archived=False)
        events = self._search_events(user_id, query, dialect, per_type, archived=False)
        operations = self._search_operations(user_id, query, dialect, per_type, archived=False)
        transactions = self._search_transactions(user_id, query, dialect, per_type)

        total = len(tasks) + len(events) + len(operations) + len(transactions)

        # Fallback — if nothing was found, look inside the archive and mark
        # each result with is_archived so the UI can label them.
        if total == 0:
            tasks = self._search_tasks(user_id, query, dialect, per_type, archived=True)
            events = self._search_events(user_id, query, dialect, per_type, archived=True)
            operations = self._search_operations(user_id, query, dialect, per_type, archived=True)
            total = len(tasks) + len(events) + len(operations)

        return {
            "tasks": tasks,
            "events": events,
            "operations": operations,
            "transactions": transactions,
            "total": total,
        }

    # ── dialect helper ───────────────────────────────────────────────────────

    def _dialect(self) -> str:
        try:
            return self.db.bind.dialect.name  # type: ignore[union-attr]
        except Exception:
            return "sqlite"

    # ── tasks ────────────────────────────────────────────────────────────────

    def _search_tasks(
        self, user_id: int, query: str, dialect: str, limit: int, *, archived: bool
    ) -> list[dict[str, Any]]:
        base = self.db.query(TaskModel).filter(TaskModel.account_id == user_id)
        if archived:
            base = base.filter(TaskModel.status == "ARCHIVED")
        else:
            base = base.filter(TaskModel.status != "ARCHIVED")

        if dialect == "postgresql":
            base = base.filter(
                text(
                    "to_tsvector('russian', coalesce(title,'') || ' ' || coalesce(note,''))"
                    " @@ plainto_tsquery('russian', :q)"
                )
            ).params(q=query).order_by(
                text(
                    "ts_rank_cd(to_tsvector('russian', coalesce(title,'') || ' ' || coalesce(note,'')),"
                    " plainto_tsquery('russian', :q)) DESC"
                )
            )
            rows = base.limit(limit).all()
        else:
            q_lower = query.lower()
            candidates = base.order_by(TaskModel.task_id.desc()).all()
            rows = [r for r in candidates if _matches(q_lower, r.title, r.note)][:limit]

        return [self._task_item(t, archived) for t in rows]

    def _task_item(self, t: TaskModel, archived: bool) -> dict[str, Any]:
        subtitle = (
            t.due_date.strftime("%d.%m.%Y") if t.due_date else "Без даты"
        )
        return {
            "id": t.task_id,
            "title": t.title,
            "subtitle": subtitle,
            "date": t.due_date,
            "url": f"/plan?task={t.task_id}",
            "is_archived": archived,
        }

    # ── events ───────────────────────────────────────────────────────────────

    def _search_events(
        self, user_id: int, query: str, dialect: str, limit: int, *, archived: bool
    ) -> list[dict[str, Any]]:
        base = (
            self.db.query(CalendarEventModel)
            .filter(CalendarEventModel.account_id == user_id)
        )
        if archived:
            base = base.filter(CalendarEventModel.is_active.is_(False))
        else:
            base = base.filter(CalendarEventModel.is_active.is_(True))

        if dialect == "postgresql":
            base = base.filter(
                text(
                    "to_tsvector('russian', coalesce(title,'') || ' ' || coalesce(description,''))"
                    " @@ plainto_tsquery('russian', :q)"
                )
            ).params(q=query).order_by(
                text(
                    "ts_rank_cd(to_tsvector('russian', coalesce(title,'') || ' ' || coalesce(description,'')),"
                    " plainto_tsquery('russian', :q)) DESC"
                )
            )
            rows = base.limit(limit).all()
        else:
            q_lower = query.lower()
            candidates = base.order_by(CalendarEventModel.event_id.desc()).all()
            rows = [r for r in candidates if _matches(q_lower, r.title, r.description)][:limit]

        return [self._event_item(e, archived) for e in rows]

    def _event_item(self, e: CalendarEventModel, archived: bool) -> dict[str, Any]:
        occ = (
            self.db.query(EventOccurrenceModel)
            .filter(EventOccurrenceModel.event_id == e.event_id)
            .order_by(EventOccurrenceModel.start_date.asc())
            .first()
        )
        if occ:
            subtitle = occ.start_date.strftime("%d.%m.%Y")
            if occ.end_date and occ.end_date != occ.start_date:
                subtitle = f"{subtitle} – {occ.end_date.strftime('%d.%m.%Y')}"
        else:
            subtitle = None

        return {
            "id": e.event_id,
            "title": e.title,
            "subtitle": subtitle,
            "date": occ.start_date if occ else None,
            "url": f"/events?id={e.event_id}",
            "is_archived": archived,
        }

    # ── operation templates ──────────────────────────────────────────────────

    def _search_operations(
        self, user_id: int, query: str, dialect: str, limit: int, *, archived: bool
    ) -> list[dict[str, Any]]:
        base = (
            self.db.query(OperationTemplateModel)
            .filter(OperationTemplateModel.account_id == user_id)
        )
        if archived:
            base = base.filter(OperationTemplateModel.is_archived.is_(True))
        else:
            base = base.filter(OperationTemplateModel.is_archived.is_(False))

        if dialect == "postgresql":
            base = base.filter(
                text(
                    "to_tsvector('russian', coalesce(title,'') || ' ' || coalesce(note,''))"
                    " @@ plainto_tsquery('russian', :q)"
                )
            ).params(q=query).order_by(
                text(
                    "ts_rank_cd(to_tsvector('russian', coalesce(title,'') || ' ' || coalesce(note,'')),"
                    " plainto_tsquery('russian', :q)) DESC"
                )
            )
            rows = base.limit(limit).all()
        else:
            q_lower = query.lower()
            candidates = base.order_by(OperationTemplateModel.template_id.desc()).all()
            rows = [r for r in candidates if _matches(q_lower, r.title, r.note)][:limit]

        return [self._operation_item(t, archived) for t in rows]

    def _operation_item(self, t: OperationTemplateModel, archived: bool) -> dict[str, Any]:
        occ = (
            self.db.query(OperationOccurrence)
            .filter(
                OperationOccurrence.template_id == t.template_id,
                OperationOccurrence.status == "ACTIVE",
            )
            .order_by(OperationOccurrence.scheduled_date.asc())
            .first()
        )
        if occ:
            subtitle = f"{t.kind} · {occ.scheduled_date.strftime('%d.%m.%Y')}"
            nearest_date: date | None = occ.scheduled_date
        else:
            subtitle = t.kind
            nearest_date = None

        return {
            "id": t.template_id,
            "title": t.title,
            "subtitle": subtitle,
            "date": nearest_date,
            "url": f"/planned-ops?id={t.template_id}",
            "is_archived": archived,
        }

    # ── transactions ─────────────────────────────────────────────────────────

    def _search_transactions(
        self, user_id: int, query: str, dialect: str, limit: int
    ) -> list[dict[str, Any]]:
        base = (
            self.db.query(TransactionFeed)
            .filter(TransactionFeed.account_id == user_id)
        )

        if dialect == "postgresql":
            base = base.filter(
                text(
                    "to_tsvector('russian', coalesce(description,''))"
                    " @@ plainto_tsquery('russian', :q)"
                )
            ).params(q=query).order_by(
                text(
                    "ts_rank_cd(to_tsvector('russian', coalesce(description,'')),"
                    " plainto_tsquery('russian', :q)) DESC"
                )
            )
            rows = base.limit(limit).all()
        else:
            q_lower = query.lower()
            candidates = base.order_by(TransactionFeed.transaction_id.desc()).all()
            rows = [r for r in candidates if _matches(q_lower, r.description)][:limit]

        return [self._transaction_item(tx) for tx in rows]

    def _transaction_item(self, tx: TransactionFeed) -> dict[str, Any]:
        subtitle = f"{tx.operation_type} · {tx.amount}"
        return {
            "id": tx.transaction_id,
            "title": tx.description or f"Транзакция #{tx.transaction_id}",
            "subtitle": subtitle,
            "date": tx.occurred_at,
            "url": f"/money?id={tx.transaction_id}",
            "is_archived": False,
        }
