from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.infrastructure.db.models import (
    DigestModel, TaskModel, HabitModel, HabitOccurrence,
    TransactionFeed, CategoryInfo, XpEvent, UserXpState, TaskDueChangeLog,
)

logger = logging.getLogger(__name__)


def iso_week_key(d: date) -> str:
    iso = d.isocalendar()
    return "{}-W{:02d}".format(iso.year, iso.week)


def parse_week_key(key: str) -> tuple[date, date]:
    year_str, week_str = key.split("-W")
    year = int(year_str)
    week = int(week_str)
    monday = date.fromisocalendar(year, week, 1)
    sunday = monday + timedelta(days=6)
    return monday, sunday


def build_weekly_payload(db: Session, account_id: int, week_start: date) -> dict:
    week_end = week_start + timedelta(days=6)
    return {
        "period": {
            "type": "week",
            "key": iso_week_key(week_start),
            "from": week_start.isoformat(),
            "to": week_end.isoformat(),
        },
        "tasks": _aggregate_tasks(db, account_id, week_start, week_end),
        "habits": _aggregate_habits(db, account_id, week_start, week_end),
        "finance": _aggregate_finance(db, account_id, week_start, week_end),
        "efficiency": _aggregate_efficiency(db, account_id, week_end),
        "xp": _aggregate_xp(db, account_id, week_start, week_end),
        "highlights": _aggregate_highlights(db, account_id, week_start, week_end),
    }


def _aggregate_tasks(db: Session, account_id: int, week_start: date, week_end: date) -> dict:
    ws = datetime(week_start.year, week_start.month, week_start.day, tzinfo=timezone.utc)
    we = datetime(week_end.year, week_end.month, week_end.day, 23, 59, 59, tzinfo=timezone.utc)

    completed_tasks = (
        db.query(TaskModel)
        .filter(
            TaskModel.account_id == account_id,
            TaskModel.status == "DONE",
            TaskModel.completed_at >= ws,
            TaskModel.completed_at <= we,
        )
        .all()
    )

    overdue_open = (
        db.query(func.count(TaskModel.task_id))
        .filter(
            TaskModel.account_id == account_id,
            TaskModel.status == "ACTIVE",
            TaskModel.due_date.isnot(None),
            TaskModel.due_date <= week_end,
        )
        .scalar() or 0
    )

    rescheduled = (
        db.query(func.count(TaskDueChangeLog.id))
        .filter(
            TaskDueChangeLog.user_id == account_id,
            TaskDueChangeLog.changed_at >= ws,
            TaskDueChangeLog.changed_at <= we,
        )
        .scalar() or 0
    )

    by_category: dict[str, int] = {}
    for task in completed_tasks:
        k = "Без категории"
        by_category[k] = by_category.get(k, 0) + 1
    top_categories = sorted(by_category.items(), key=lambda x: -x[1])[:3]

    return {
        "completed": len(completed_tasks),
        "overdue_open": overdue_open,
        "rescheduled": rescheduled,
        "by_category_top": [[name, count] for name, count in top_categories],
    }


def _aggregate_habits(db: Session, account_id: int, week_start: date, week_end: date) -> dict:
    active_habits = (
        db.query(HabitModel)
        .filter(
            HabitModel.account_id == account_id,
            HabitModel.is_archived.is_(False),
        )
        .all()
    )
    if not active_habits:
        return {"longest_streak": None, "broken_streaks": [], "completion_rate": 0.0}

    habit_ids = [h.habit_id for h in active_habits]
    habit_map = {h.habit_id: h for h in active_habits}

    occurrences = (
        db.query(HabitOccurrence)
        .filter(
            HabitOccurrence.account_id == account_id,
            HabitOccurrence.habit_id.in_(habit_ids),
            HabitOccurrence.scheduled_date >= week_start,
            HabitOccurrence.scheduled_date <= week_end,
        )
        .all()
    )
    total_scheduled = len(occurrences)
    done_count = sum(1 for o in occurrences if o.status == "DONE")
    completion_rate = (done_count / total_scheduled) if total_scheduled > 0 else 0.0

    best_habit = max(active_habits, key=lambda h: h.current_streak, default=None)
    longest_streak = None
    if best_habit and best_habit.current_streak > 0:
        longest_streak = {"name": best_habit.title, "days": best_habit.current_streak}

    habits_with_miss: dict[int, int] = {}
    for occ in occurrences:
        if occ.status == "ACTIVE":
            habits_with_miss[occ.habit_id] = habits_with_miss.get(occ.habit_id, 0) + 1

    broken_streaks = []
    for habit_id in habits_with_miss:
        h = habit_map.get(habit_id)
        if h and h.best_streak >= 3:
            broken_streaks.append({"name": h.title, "days_before": h.best_streak})

    return {
        "longest_streak": longest_streak,
        "broken_streaks": broken_streaks[:3],
        "completion_rate": round(completion_rate, 2),
    }


def _aggregate_finance(db: Session, account_id: int, week_start: date, week_end: date) -> dict:
    ws = datetime(week_start.year, week_start.month, week_start.day, tzinfo=timezone.utc)
    we = datetime(week_end.year, week_end.month, week_end.day, 23, 59, 59, tzinfo=timezone.utc)

    rows = (
        db.query(TransactionFeed.operation_type, func.sum(TransactionFeed.amount))
        .filter(
            TransactionFeed.account_id == account_id,
            TransactionFeed.operation_type.in_(["INCOME", "EXPENSE"]),
            TransactionFeed.occurred_at >= ws,
            TransactionFeed.occurred_at <= we,
        )
        .group_by(TransactionFeed.operation_type)
        .all()
    )
    totals = {kind: float(amount or 0) for kind, amount in rows}
    income = totals.get("INCOME", 0.0)
    expense = totals.get("EXPENSE", 0.0)
    top_cat = _top_expense_category(db, account_id, ws, we)
    return {
        "income_total": income,
        "expense_total": expense,
        "balance_delta": income - expense,
        "top_expense_category": top_cat,
    }


def _top_expense_category(db: Session, account_id: int, start_dt, end_dt):
    rows = (
        db.query(
            TransactionFeed.category_id,
            func.sum(TransactionFeed.amount).label("total"),
        )
        .filter(
            TransactionFeed.account_id == account_id,
            TransactionFeed.operation_type == "EXPENSE",
            TransactionFeed.occurred_at >= start_dt,
            TransactionFeed.occurred_at <= end_dt,
            TransactionFeed.category_id.isnot(None),
        )
        .group_by(TransactionFeed.category_id)
        .order_by(func.sum(TransactionFeed.amount).desc())
        .limit(1)
        .all()
    )
    if not rows:
        return None
    category_id, total = rows[0]
    cat = db.query(CategoryInfo).filter(CategoryInfo.category_id == category_id).first()
    name = cat.title if cat else "Category #{}".format(category_id)
    return [name, float(total or 0)]


def _aggregate_efficiency(db: Session, account_id: int, snap_date: date) -> dict:
    try:
        from app.application.efficiency import EfficiencyService
        from app.infrastructure.db.models import EfficiencySnapshot
        svc = EfficiencyService(db)
        result = svc.calculate(account_id, snap_date)
        score = int(result.get("efficiency_score", 0))
        prior_date = snap_date - timedelta(days=7)
        prior_snap = (
            db.query(EfficiencySnapshot)
            .filter(
                EfficiencySnapshot.account_id == account_id,
                EfficiencySnapshot.snapshot_date == prior_date,
            )
            .first()
        )
        delta = 0
        if prior_snap:
            delta = score - int(prior_snap.efficiency_score)
        return {"score": score, "delta_vs_prev": delta}
    except Exception:
        logger.exception("Efficiency aggregation failed for account_id=%s", account_id)
        return {"score": 0, "delta_vs_prev": 0}


def _aggregate_xp(db: Session, account_id: int, week_start: date, week_end: date) -> dict:
    ws = datetime(week_start.year, week_start.month, week_start.day, tzinfo=timezone.utc)
    we = datetime(week_end.year, week_end.month, week_end.day, 23, 59, 59, tzinfo=timezone.utc)
    gained = (
        db.query(func.sum(XpEvent.xp_amount))
        .filter(XpEvent.user_id == account_id, XpEvent.created_at >= ws, XpEvent.created_at <= we)
        .scalar() or 0
    )
    xp_state = db.query(UserXpState).filter(UserXpState.user_id == account_id).first()
    level = xp_state.level if xp_state else 1
    return {"gained": int(gained), "level_before": level, "level_after": level}


def _aggregate_highlights(db: Session, account_id: int, week_start: date, week_end: date) -> dict:
    ws = datetime(week_start.year, week_start.month, week_start.day, tzinfo=timezone.utc)
    we = datetime(week_end.year, week_end.month, week_end.day, 23, 59, 59, tzinfo=timezone.utc)
    rows = (
        db.query(
            func.date(TaskModel.completed_at).label("day"),
            func.count(TaskModel.task_id).label("cnt"),
        )
        .filter(
            TaskModel.account_id == account_id,
            TaskModel.status == "DONE",
            TaskModel.completed_at >= ws,
            TaskModel.completed_at <= we,
        )
        .group_by(func.date(TaskModel.completed_at))
        .order_by(func.count(TaskModel.task_id).desc())
        .limit(1)
        .all()
    )
    if rows:
        best_day, best_count = rows[0]
        day_str = best_day.isoformat() if hasattr(best_day, "isoformat") else str(best_day)
        return {"most_productive_day": day_str, "most_productive_count": int(best_count)}
    return {"most_productive_day": None, "most_productive_count": 0}


def save_digest(
    db: Session,
    account_id: int,
    period_type: str,
    period_key: str,
    payload: dict,
    ai_comment: Optional[str] = None,
) -> int:
    existing = (
        db.query(DigestModel)
        .filter(
            DigestModel.account_id == account_id,
            DigestModel.period_type == period_type,
            DigestModel.period_key == period_key,
        )
        .first()
    )
    if existing:
        existing.payload = payload
        if ai_comment is not None:
            existing.ai_comment = ai_comment
        db.commit()
        return existing.id

    digest = DigestModel(
        account_id=account_id,
        period_type=period_type,
        period_key=period_key,
        payload=payload,
        ai_comment=ai_comment,
    )
    db.add(digest)
    db.commit()
    db.refresh(digest)
    return digest.id


def generate_and_save_weekly_digest(db: Session, account_id: int, week_start: date) -> DigestModel:
    period_key = iso_week_key(week_start)
    payload = build_weekly_payload(db, account_id, week_start)

    # AI commentary only if the user opted in
    from app.infrastructure.db.models import User
    user = db.query(User).filter(User.id == account_id).first()
    ai_comment = None
    if user and user.ai_digest_enabled:
        from app.infrastructure.ai import generate_digest_comment
        from app.application.app_config import get_openai_key
        ai_comment = generate_digest_comment(payload, api_key=get_openai_key(db))

    save_digest(db, account_id, "week", period_key, payload, ai_comment)
    return (
        db.query(DigestModel)
        .filter(
            DigestModel.account_id == account_id,
            DigestModel.period_type == "week",
            DigestModel.period_key == period_key,
        )
        .first()
    )
