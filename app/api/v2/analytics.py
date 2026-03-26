"""
Analytics API endpoints — income/expense + productivity statistics.

GET /api/v2/analytics/summary           — headline numbers for a month
GET /api/v2/analytics/monthly-trend     — 12-month income/expense trend
GET /api/v2/analytics/category-breakdown — category donut for a month
GET /api/v2/analytics/daily-spending    — daily bar chart for a month
GET /api/v2/analytics/category-trend    — top categories over months
GET /api/v2/analytics/productivity      — tasks + habits stats
"""
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy import func, case, and_, extract
from sqlalchemy.orm import Session

from app.infrastructure.db.session import get_db
from app.api.v2.deps import get_user_id
from app.application.analytics import AnalyticsService
from app.infrastructure.db.models import (
    TaskModel, HabitModel, HabitOccurrence,
)

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _default_period() -> str:
    t = date.today()
    return f"{t.year:04d}-{t.month:02d}"


@router.get("/summary")
def analytics_summary(
    request: Request,
    period: str = Query(default=""),
    currency: str = Query(default="RUB"),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(request, db)
    if not period:
        period = _default_period()
    return AnalyticsService(db).get_period_summary(user_id, currency, period)


@router.get("/monthly-trend")
def analytics_monthly_trend(
    request: Request,
    months: int = Query(default=12, le=24),
    currency: str = Query(default="RUB"),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(request, db)
    return AnalyticsService(db).get_monthly_trend(user_id, currency, months)


@router.get("/category-breakdown")
def analytics_category_breakdown(
    request: Request,
    period: str = Query(default=""),
    op_type: str = Query(default="EXPENSE"),
    currency: str = Query(default="RUB"),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(request, db)
    if not period:
        period = _default_period()
    return AnalyticsService(db).get_category_breakdown(user_id, currency, op_type, period)


@router.get("/daily-spending")
def analytics_daily_spending(
    request: Request,
    period: str = Query(default=""),
    currency: str = Query(default="RUB"),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(request, db)
    if not period:
        period = _default_period()
    return AnalyticsService(db).get_daily_spending(user_id, currency, period)


@router.get("/category-trend")
def analytics_category_trend(
    request: Request,
    op_type: str = Query(default="EXPENSE"),
    months: int = Query(default=6, le=12),
    currency: str = Query(default="RUB"),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(request, db)
    return AnalyticsService(db).get_category_trend(user_id, currency, op_type, months)


# ── Productivity analytics (tasks + habits) ──────────────────────────────────

@router.get("/productivity")
def analytics_productivity(
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = get_user_id(request, db)
    today = date.today()
    d30 = today - timedelta(days=30)
    d7 = today - timedelta(days=7)

    # ── Tasks stats ──
    task_base = db.query(TaskModel).filter(TaskModel.account_id == user_id)

    total_active = task_base.filter(TaskModel.status == "ACTIVE").count()
    total_done_30d = task_base.filter(
        TaskModel.status == "DONE",
        TaskModel.completed_at >= d30,
    ).count()
    total_done_7d = task_base.filter(
        TaskModel.status == "DONE",
        TaskModel.completed_at >= d7,
    ).count()
    overdue = task_base.filter(
        TaskModel.status == "ACTIVE",
        TaskModel.due_date != None,
        TaskModel.due_date < today,
    ).count()

    # Tasks completed per week (last 12 weeks)
    w12 = today - timedelta(weeks=12)
    weekly_tasks_raw = (
        db.query(
            func.date_trunc("week", TaskModel.completed_at).label("week"),
            func.count().label("cnt"),
        )
        .filter(
            TaskModel.account_id == user_id,
            TaskModel.status == "DONE",
            TaskModel.completed_at >= w12,
        )
        .group_by("week")
        .order_by("week")
        .all()
    )
    weekly_tasks = [
        {"week": r.week.strftime("%d.%m") if r.week else "", "count": r.cnt}
        for r in weekly_tasks_raw
    ]

    # ── Habits stats ──
    habit_ids = [
        h.id for h in
        db.query(HabitModel.id).filter(
            HabitModel.account_id == user_id,
            HabitModel.is_archived == False,
        ).all()
    ]

    habits_total = len(habit_ids)

    habits_today_done = 0
    habits_today_total = 0
    habits_7d_done = 0
    habits_7d_total = 0
    habits_30d_done = 0
    habits_30d_total = 0
    best_streak = 0

    if habit_ids:
        # Today
        habits_today_total = (
            db.query(func.count())
            .select_from(HabitOccurrence)
            .filter(
                HabitOccurrence.account_id == user_id,
                HabitOccurrence.habit_id.in_(habit_ids),
                HabitOccurrence.scheduled_date == today,
            ).scalar() or 0
        )
        habits_today_done = (
            db.query(func.count())
            .select_from(HabitOccurrence)
            .filter(
                HabitOccurrence.account_id == user_id,
                HabitOccurrence.habit_id.in_(habit_ids),
                HabitOccurrence.scheduled_date == today,
                HabitOccurrence.status == "DONE",
            ).scalar() or 0
        )

        # 7d
        habits_7d_total = (
            db.query(func.count())
            .select_from(HabitOccurrence)
            .filter(
                HabitOccurrence.account_id == user_id,
                HabitOccurrence.habit_id.in_(habit_ids),
                HabitOccurrence.scheduled_date >= d7,
                HabitOccurrence.scheduled_date <= today,
            ).scalar() or 0
        )
        habits_7d_done = (
            db.query(func.count())
            .select_from(HabitOccurrence)
            .filter(
                HabitOccurrence.account_id == user_id,
                HabitOccurrence.habit_id.in_(habit_ids),
                HabitOccurrence.scheduled_date >= d7,
                HabitOccurrence.scheduled_date <= today,
                HabitOccurrence.status == "DONE",
            ).scalar() or 0
        )

        # 30d
        habits_30d_total = (
            db.query(func.count())
            .select_from(HabitOccurrence)
            .filter(
                HabitOccurrence.account_id == user_id,
                HabitOccurrence.habit_id.in_(habit_ids),
                HabitOccurrence.scheduled_date >= d30,
                HabitOccurrence.scheduled_date <= today,
            ).scalar() or 0
        )
        habits_30d_done = (
            db.query(func.count())
            .select_from(HabitOccurrence)
            .filter(
                HabitOccurrence.account_id == user_id,
                HabitOccurrence.habit_id.in_(habit_ids),
                HabitOccurrence.scheduled_date >= d30,
                HabitOccurrence.scheduled_date <= today,
                HabitOccurrence.status == "DONE",
            ).scalar() or 0
        )

        best_streak = (
            db.query(func.max(HabitModel.best_streak))
            .filter(HabitModel.id.in_(habit_ids))
            .scalar() or 0
        )

    # Daily habit completion (last 14 days)
    d14 = today - timedelta(days=13)
    daily_habits_raw = (
        db.query(
            HabitOccurrence.scheduled_date,
            func.count().label("total"),
            func.sum(case((HabitOccurrence.status == "DONE", 1), else_=0)).label("done"),
        )
        .filter(
            HabitOccurrence.account_id == user_id,
            HabitOccurrence.scheduled_date >= d14,
            HabitOccurrence.scheduled_date <= today,
        )
        .group_by(HabitOccurrence.scheduled_date)
        .order_by(HabitOccurrence.scheduled_date)
        .all()
    )
    daily_habits = [
        {"day": r.scheduled_date.strftime("%d.%m"), "done": int(r.done), "total": int(r.total)}
        for r in daily_habits_raw
    ]

    # Top habits by streak
    top_habits = []
    if habit_ids:
        rows = (
            db.query(HabitModel.title, HabitModel.current_streak, HabitModel.best_streak, HabitModel.done_count_30d)
            .filter(HabitModel.id.in_(habit_ids))
            .order_by(HabitModel.current_streak.desc())
            .limit(5)
            .all()
        )
        top_habits = [
            {"title": r.title, "current_streak": r.current_streak or 0, "best_streak": r.best_streak or 0, "done_30d": r.done_count_30d or 0}
            for r in rows
        ]

    return {
        "tasks": {
            "active": total_active,
            "done_7d": total_done_7d,
            "done_30d": total_done_30d,
            "overdue": overdue,
            "velocity_7d": round(total_done_7d / 7, 1) if total_done_7d else 0,
            "weekly_trend": weekly_tasks,
        },
        "habits": {
            "total": habits_total,
            "today_done": habits_today_done,
            "today_total": habits_today_total,
            "rate_7d": round(habits_7d_done / habits_7d_total * 100) if habits_7d_total else 0,
            "rate_30d": round(habits_30d_done / habits_30d_total * 100) if habits_30d_total else 0,
            "best_streak": best_streak,
            "daily_chart": daily_habits,
            "top_habits": top_habits,
        },
    }
