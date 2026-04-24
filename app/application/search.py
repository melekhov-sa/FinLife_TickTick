"""
Global search service — dialect-aware (PostgreSQL FTS / SQLite Python-filter fallback).
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.infrastructure.db.models import (
    ArticleModel,
    CalendarEventModel,
    ContactModel,
    EventOccurrenceModel,
    GoalInfo,
    HabitModel,
    OperationOccurrence,
    OperationTemplateModel,
    SubscriptionModel,
    TaskModel,
    TransactionFeed,
)

_EMPTY: dict[str, Any] = {
    "tasks": [],
    "events": [],
    "operations": [],
    "transactions": [],
    "habits": [],
    "goals": [],
    "subscriptions": [],
    "contacts": [],
    "articles": [],
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
        per_type = max(1, min(10, limit // 9)) if limit < 90 else 10

        # Primary pass — only active records.
        tasks = self._search_tasks(user_id, query, dialect, per_type, archived=False)
        events = self._search_events(user_id, query, dialect, per_type, archived=False)
        operations = self._search_operations(user_id, query, dialect, per_type, archived=False)
        transactions = self._search_transactions(user_id, query, dialect, per_type)
        habits = self._search_habits(user_id, query, dialect, per_type, archived=False)
        goals = self._search_goals(user_id, query, dialect, per_type, archived=False)
        subscriptions = self._search_subscriptions(user_id, query, dialect, per_type, archived=False)
        contacts = self._search_contacts(user_id, query, dialect, per_type, archived=False)
        articles = self._search_articles(user_id, query, dialect, per_type, archived=False)

        total = (
            len(tasks) + len(events) + len(operations) + len(transactions)
            + len(habits) + len(goals) + len(subscriptions) + len(contacts)
            + len(articles)
        )

        # Fallback — if nothing was found, look inside the archive and mark
        # each result with is_archived so the UI can label them.
        if total == 0:
            tasks = self._search_tasks(user_id, query, dialect, per_type, archived=True)
            events = self._search_events(user_id, query, dialect, per_type, archived=True)
            operations = self._search_operations(user_id, query, dialect, per_type, archived=True)
            habits = self._search_habits(user_id, query, dialect, per_type, archived=True)
            goals = self._search_goals(user_id, query, dialect, per_type, archived=True)
            subscriptions = self._search_subscriptions(user_id, query, dialect, per_type, archived=True)
            contacts = self._search_contacts(user_id, query, dialect, per_type, archived=True)
            articles = self._search_articles(user_id, query, dialect, per_type, archived=True)
            total = (
                len(tasks) + len(events) + len(operations)
                + len(habits) + len(goals) + len(subscriptions)
                + len(contacts) + len(articles)
            )

        return {
            "tasks": tasks,
            "events": events,
            "operations": operations,
            "transactions": transactions,
            "habits": habits,
            "goals": goals,
            "subscriptions": subscriptions,
            "contacts": contacts,
            "articles": articles,
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
        # Event is "live" if it has at least one non-cancelled occurrence.
        # Resolve to a concrete Python set — works across dialects without
        # subquery/exists quirks.
        live_event_ids: set[int] = {
            row[0]
            for row in (
                self.db.query(EventOccurrenceModel.event_id)
                .filter(
                    EventOccurrenceModel.account_id == user_id,
                    EventOccurrenceModel.is_cancelled.isnot(True),
                )
                .distinct()
                .all()
            )
        }

        base = (
            self.db.query(CalendarEventModel)
            .filter(CalendarEventModel.account_id == user_id)
        )
        if archived:
            # Archived bucket: is_active=False OR active-but-empty (no live
            # occurrence). Both are effectively dead from the user's POV.
            if live_event_ids:
                base = base.filter(
                    (CalendarEventModel.is_active.is_(False))
                    | (~CalendarEventModel.event_id.in_(live_event_ids))
                )
            # else: everything the user owns has no live occurrence → anything
            # active-but-empty or inactive qualifies, so no id filter needed.
        else:
            # Primary pass: active AND has at least one non-cancelled occurrence.
            # If nothing is live for this user, the primary pass is empty.
            if not live_event_ids:
                return []
            base = base.filter(
                CalendarEventModel.is_active.is_(True),
                CalendarEventModel.event_id.in_(live_event_ids),
            )

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

    # ── habits ───────────────────────────────────────────────────────────────

    def _search_habits(
        self, user_id: int, query: str, dialect: str, limit: int, *, archived: bool
    ) -> list[dict[str, Any]]:
        base = self.db.query(HabitModel).filter(HabitModel.account_id == user_id)
        if archived:
            base = base.filter(HabitModel.is_archived.is_(True))
        else:
            base = base.filter(HabitModel.is_archived.is_(False))

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
            candidates = base.order_by(HabitModel.habit_id.desc()).all()
            rows = [r for r in candidates if _matches(q_lower, r.title, r.note)][:limit]

        return [self._habit_item(h, archived) for h in rows]

    def _habit_item(self, h: HabitModel, archived: bool) -> dict[str, Any]:
        if h.reminder_time is not None:
            subtitle = h.reminder_time.strftime("%H:%M")
        else:
            subtitle = "Привычка"
        return {
            "id": h.habit_id,
            "title": h.title,
            "subtitle": subtitle,
            "date": None,
            "url": f"/habits?id={h.habit_id}",
            "is_archived": archived,
        }

    # ── goals ────────────────────────────────────────────────────────────────

    def _search_goals(
        self, user_id: int, query: str, dialect: str, limit: int, *, archived: bool
    ) -> list[dict[str, Any]]:
        base = (
            self.db.query(GoalInfo)
            .filter(GoalInfo.account_id == user_id)
            .filter(GoalInfo.is_system.is_(False))
        )
        if archived:
            base = base.filter(GoalInfo.is_archived.is_(True))
        else:
            base = base.filter(GoalInfo.is_archived.is_(False))

        if dialect == "postgresql":
            base = base.filter(
                text(
                    "to_tsvector('russian', coalesce(title,''))"
                    " @@ plainto_tsquery('russian', :q)"
                )
            ).params(q=query).order_by(
                text(
                    "ts_rank_cd(to_tsvector('russian', coalesce(title,'')),"
                    " plainto_tsquery('russian', :q)) DESC"
                )
            )
            rows = base.limit(limit).all()
        else:
            q_lower = query.lower()
            candidates = base.order_by(GoalInfo.goal_id.desc()).all()
            rows = [r for r in candidates if _matches(q_lower, r.title)][:limit]

        return [self._goal_item(g, archived) for g in rows]

    def _goal_item(self, g: GoalInfo, archived: bool) -> dict[str, Any]:
        if g.target_amount is not None:
            subtitle = f"Цель {g.target_amount} {g.currency}"
        else:
            subtitle = "Цель"
        return {
            "id": g.goal_id,
            "title": g.title,
            "subtitle": subtitle,
            "date": None,
            "url": f"/goals?id={g.goal_id}",
            "is_archived": archived,
        }

    # ── subscriptions ─────────────────────────────────────────────────────────

    def _search_subscriptions(
        self, user_id: int, query: str, dialect: str, limit: int, *, archived: bool
    ) -> list[dict[str, Any]]:
        base = (
            self.db.query(SubscriptionModel)
            .filter(SubscriptionModel.account_id == user_id)
        )
        if archived:
            base = base.filter(SubscriptionModel.is_archived.is_(True))
        else:
            base = base.filter(SubscriptionModel.is_archived.is_(False))

        if dialect == "postgresql":
            base = base.filter(
                text(
                    "to_tsvector('russian', coalesce(name,''))"
                    " @@ plainto_tsquery('russian', :q)"
                )
            ).params(q=query).order_by(
                text(
                    "ts_rank_cd(to_tsvector('russian', coalesce(name,'')),"
                    " plainto_tsquery('russian', :q)) DESC"
                )
            )
            rows = base.limit(limit).all()
        else:
            q_lower = query.lower()
            candidates = base.order_by(SubscriptionModel.id.desc()).all()
            rows = [r for r in candidates if _matches(q_lower, r.name)][:limit]

        return [self._subscription_item(s, archived) for s in rows]

    def _subscription_item(self, s: SubscriptionModel, archived: bool) -> dict[str, Any]:
        if s.paid_until_self is not None:
            subtitle = f"Оплачено до {s.paid_until_self.strftime('%d.%m.%Y')}"
        else:
            subtitle = "Подписка"
        return {
            "id": s.id,
            "title": s.name,
            "subtitle": subtitle,
            "date": s.paid_until_self,
            "url": f"/subscriptions?id={s.id}",
            "is_archived": archived,
        }

    # ── contacts ─────────────────────────────────────────────────────────────

    def _search_contacts(
        self, user_id: int, query: str, dialect: str, limit: int, *, archived: bool
    ) -> list[dict[str, Any]]:
        base = (
            self.db.query(ContactModel)
            .filter(ContactModel.account_id == user_id)
        )
        if archived:
            base = base.filter(ContactModel.is_archived.is_(True))
        else:
            base = base.filter(ContactModel.is_archived.is_(False))

        if dialect == "postgresql":
            base = base.filter(
                text(
                    "to_tsvector('russian', coalesce(name,'') || ' ' || coalesce(note,''))"
                    " @@ plainto_tsquery('russian', :q)"
                )
            ).params(q=query).order_by(
                text(
                    "ts_rank_cd(to_tsvector('russian', coalesce(name,'') || ' ' || coalesce(note,'')),"
                    " plainto_tsquery('russian', :q)) DESC"
                )
            )
            rows = base.limit(limit).all()
        else:
            q_lower = query.lower()
            candidates = base.order_by(ContactModel.id.desc()).all()
            rows = [r for r in candidates if _matches(q_lower, r.name, r.note)][:limit]

        return [self._contact_item(c, archived) for c in rows]

    def _contact_item(self, c: ContactModel, archived: bool) -> dict[str, Any]:
        if c.note:
            subtitle = c.note[:50]
        else:
            subtitle = "Контакт"
        return {
            "id": c.id,
            "title": c.name,
            "subtitle": subtitle,
            "date": None,
            "url": f"/contacts?id={c.id}",
            "is_archived": archived,
        }

    # ── articles ─────────────────────────────────────────────────────────────

    def _search_articles(
        self, user_id: int, query: str, dialect: str, limit: int, *, archived: bool
    ) -> list[dict[str, Any]]:
        base = (
            self.db.query(ArticleModel)
            .filter(ArticleModel.account_id == user_id)
        )
        if archived:
            base = base.filter(ArticleModel.status == "archived")
        else:
            base = base.filter(ArticleModel.status != "archived")

        if dialect == "postgresql":
            base = base.filter(
                text(
                    "to_tsvector('russian', coalesce(title,'') || ' ' || coalesce(content_md,''))"
                    " @@ plainto_tsquery('russian', :q)"
                )
            ).params(q=query).order_by(
                text(
                    "ts_rank_cd(to_tsvector('russian', coalesce(title,'') || ' ' || coalesce(content_md,'')),"
                    " plainto_tsquery('russian', :q)) DESC"
                )
            )
            rows = base.limit(limit).all()
        else:
            q_lower = query.lower()
            candidates = base.order_by(ArticleModel.id.desc()).all()
            rows = [r for r in candidates if _matches(q_lower, r.title, r.content_md)][:limit]

        return [self._article_item(a, archived) for a in rows]

    def _article_item(self, a: ArticleModel, archived: bool) -> dict[str, Any]:
        type_labels = {
            "note": "Заметка",
            "project": "Проект",
        }
        subtitle = type_labels.get(a.type, "Запись")
        return {
            "id": a.id,
            "title": a.title,
            "subtitle": subtitle,
            "date": None,
            "url": f"/knowledge/{a.id}",
            "is_archived": archived,
        }
