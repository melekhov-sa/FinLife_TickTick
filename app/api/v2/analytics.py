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
    WalletBalance, TransactionFeed, GoalInfo, GoalWalletBalance,
    SubscriptionModel, SubscriptionMemberModel,
    UserActivityDaily,
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


# ── Activity heatmap (GitHub-style, 365 days) ────────────────────────────────

@router.get("/activity-heatmap")
def activity_heatmap(request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    today = date.today()
    start = today - timedelta(days=364)

    rows = (
        db.query(UserActivityDaily.day_date, UserActivityDaily.points)
        .filter(UserActivityDaily.user_id == user_id, UserActivityDaily.day_date >= start)
        .all()
    )
    activity = {r.day_date.isoformat(): r.points for r in rows}

    if not activity:
        task_rows = (
            db.query(func.date(TaskModel.completed_at).label("d"), func.count().label("cnt"))
            .filter(TaskModel.account_id == user_id, TaskModel.status == "DONE", TaskModel.completed_at >= start)
            .group_by("d").all()
        )
        habit_rows = (
            db.query(HabitOccurrence.scheduled_date, func.count().label("cnt"))
            .filter(HabitOccurrence.account_id == user_id, HabitOccurrence.status == "DONE", HabitOccurrence.scheduled_date >= start)
            .group_by(HabitOccurrence.scheduled_date).all()
        )
        for r in task_rows:
            if r.d:
                activity[r.d.isoformat() if hasattr(r.d, 'isoformat') else str(r.d)] = r.cnt
        for r in habit_rows:
            k = r.scheduled_date.isoformat()
            activity[k] = activity.get(k, 0) + r.cnt

    days = []
    for i in range(365):
        d = start + timedelta(days=i)
        days.append({"date": d.isoformat(), "count": activity.get(d.isoformat(), 0)})
    return {"days": days}


# ── Wallet balances + trend ───────────────────────────────────────────────────

@router.get("/wallet-balances")
def wallet_balances_analytics(request: Request, currency: str = Query(default="RUB"), db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    wallets = (
        db.query(WalletBalance)
        .filter(WalletBalance.account_id == user_id, WalletBalance.is_archived == False, WalletBalance.currency == currency)
        .order_by(WalletBalance.title).all()
    )
    wallet_list = [{"title": w.title, "balance": float(w.balance)} for w in wallets]
    total = sum(float(w.balance) for w in wallets)

    today = date.today()
    m12 = today.replace(day=1) - timedelta(days=365)
    monthly_flow = (
        db.query(
            func.date_trunc("month", TransactionFeed.occurred_at).label("month"),
            func.sum(case((TransactionFeed.operation_type == "INCOME", TransactionFeed.amount), else_=0)).label("inc"),
            func.sum(case((TransactionFeed.operation_type == "EXPENSE", TransactionFeed.amount), else_=0)).label("exp"),
        )
        .filter(TransactionFeed.account_id == user_id, TransactionFeed.occurred_at >= m12)
        .group_by("month").order_by("month").all()
    )
    flows = [(r.month, float(r.inc or 0), float(r.exp or 0)) for r in monthly_flow]
    points = []
    running = total
    for m, inc, exp in reversed(flows):
        points.append({"month": m.strftime("%Y-%m") if m else "", "balance": round(running, 2)})
        running = running - inc + exp
    points.reverse()
    return {"wallets": wallet_list, "total": round(total, 2), "balance_trend": points}


# ── Spending by day of week ───────────────────────────────────────────────────

@router.get("/spending-by-weekday")
def spending_by_weekday(request: Request, currency: str = Query(default="RUB"), db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    d90 = date.today() - timedelta(days=90)
    rows = (
        db.query(
            extract("dow", TransactionFeed.occurred_at).label("dow"),
            func.avg(TransactionFeed.amount).label("avg_amount"),
            func.sum(TransactionFeed.amount).label("total"),
            func.count().label("cnt"),
        )
        .filter(TransactionFeed.account_id == user_id, TransactionFeed.operation_type == "EXPENSE", TransactionFeed.occurred_at >= d90)
        .group_by("dow").all()
    )
    WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"]
    dow_map = {int(r.dow): r for r in rows}
    result = []
    for i in range(7):
        r = dow_map.get(i)
        result.append({"day": WEEKDAYS[i], "avg": round(float(r.avg_amount), 0) if r else 0, "total": round(float(r.total), 0) if r else 0, "count": r.cnt if r else 0})
    result = result[1:] + result[:1]
    return {"weekdays": result}


# ── Subscriptions analytics ───────────────────────────────────────────────────

@router.get("/subscriptions-analytics")
def subscriptions_analytics(request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    today = date.today()
    subs = db.query(SubscriptionModel).filter(SubscriptionModel.account_id == user_id, SubscriptionModel.is_archived == False).all()
    members = db.query(SubscriptionMemberModel).filter(SubscriptionMemberModel.account_id == user_id, SubscriptionMemberModel.is_archived == False).all()
    member_map: dict[int, list] = {}
    for m in members:
        member_map.setdefault(m.subscription_id, []).append(m)

    total_monthly = 0
    sub_list = []
    expiring = []
    for s in subs:
        ms = member_map.get(s.id, [])
        cost = sum(float(m.payment_per_month or 0) for m in ms)
        total_monthly += cost
        days_left = (s.paid_until_self - today).days if s.paid_until_self else None
        if days_left is not None and days_left <= 14:
            expiring.append({"name": s.name, "days_left": days_left, "cost": round(cost)})
        sub_list.append({"name": s.name, "cost": round(cost), "days_left": days_left})
    sub_list.sort(key=lambda x: x["cost"], reverse=True)
    expiring.sort(key=lambda x: x["days_left"])
    return {"total_monthly": round(total_monthly), "count": len(subs), "subscriptions": sub_list[:10], "expiring": expiring}


# ── Habits matrix (habit × days, 30 days) ────────────────────────────────────

@router.get("/habits-matrix")
def habits_matrix(request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    today = date.today()
    d30 = today - timedelta(days=29)
    habits = db.query(HabitModel.id, HabitModel.title).filter(HabitModel.account_id == user_id, HabitModel.is_archived == False).order_by(HabitModel.title).all()
    occurrences = db.query(HabitOccurrence.habit_id, HabitOccurrence.scheduled_date, HabitOccurrence.status).filter(
        HabitOccurrence.account_id == user_id, HabitOccurrence.scheduled_date >= d30, HabitOccurrence.scheduled_date <= today).all()
    occ_map = {(o.habit_id, o.scheduled_date.isoformat()): o.status for o in occurrences}
    days = [(d30 + timedelta(days=i)).isoformat() for i in range(30)]
    matrix = []
    for h in habits:
        row = {"habit_id": h.id, "title": h.title, "days": []}
        for d in days:
            status = occ_map.get((h.id, d))
            row["days"].append(1 if status == "DONE" else (0 if status else -1))
        matrix.append(row)
    return {"days": days, "habits": matrix}


# ── Goals progress ────────────────────────────────────────────────────────────

@router.get("/goals-progress")
def goals_progress(request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    goals = db.query(GoalInfo).filter(GoalInfo.account_id == user_id, GoalInfo.is_archived == False).order_by(GoalInfo.sort_order).all()
    balances = db.query(GoalWalletBalance.goal_id, func.sum(GoalWalletBalance.amount).label("total")).filter(GoalWalletBalance.account_id == user_id).group_by(GoalWalletBalance.goal_id).all()
    bal_map = {r.goal_id: float(r.total) for r in balances}
    result = []
    for g in goals:
        current = bal_map.get(g.goal_id, 0)
        target = float(g.target_amount) if g.target_amount else 0
        pct = round(current / target * 100) if target > 0 else 0
        result.append({"title": g.title, "current": round(current), "target": round(target), "percent": min(pct, 100), "currency": g.currency})
    return {"goals": result}


# ── Productivity by day of week ───────────────────────────────────────────────

@router.get("/productivity-by-weekday")
def productivity_by_weekday(request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    d90 = date.today() - timedelta(days=90)
    rows = db.query(extract("dow", TaskModel.completed_at).label("dow"), func.count().label("cnt")).filter(
        TaskModel.account_id == user_id, TaskModel.status == "DONE", TaskModel.completed_at >= d90).group_by("dow").all()
    WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"]
    dow_map = {int(r.dow): r.cnt for r in rows}
    result = [{"day": WEEKDAYS[i], "count": dow_map.get(i, 0)} for i in range(7)]
    result = result[1:] + result[:1]
    return {"weekdays": result}


# ── Month comparison ──────────────────────────────────────────────────────────

@router.get("/month-comparison")
def month_comparison(request: Request, currency: str = Query(default="RUB"), db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    today = date.today()
    cur_start = today.replace(day=1)
    prev_start = (cur_start - timedelta(days=1)).replace(day=1)

    def _stats(start: date, end: date) -> dict:
        rows = db.query(TransactionFeed.operation_type, func.sum(TransactionFeed.amount).label("total"), func.count().label("cnt")).filter(
            TransactionFeed.account_id == user_id, TransactionFeed.occurred_at >= start, TransactionFeed.occurred_at < end,
            TransactionFeed.operation_type.in_(["INCOME", "EXPENSE"])).group_by(TransactionFeed.operation_type).all()
        d = {"income": 0, "expense": 0, "ops": 0}
        for r in rows:
            if r.operation_type == "INCOME": d["income"] = round(float(r.total or 0))
            else: d["expense"] = round(float(r.total or 0))
            d["ops"] += r.cnt
        d["net"] = d["income"] - d["expense"]
        d["tasks_done"] = db.query(func.count()).select_from(TaskModel).filter(
            TaskModel.account_id == user_id, TaskModel.status == "DONE", TaskModel.completed_at >= start, TaskModel.completed_at < end).scalar() or 0
        h_total = db.query(func.count()).select_from(HabitOccurrence).filter(
            HabitOccurrence.account_id == user_id, HabitOccurrence.scheduled_date >= start, HabitOccurrence.scheduled_date < end).scalar() or 0
        h_done = db.query(func.count()).select_from(HabitOccurrence).filter(
            HabitOccurrence.account_id == user_id, HabitOccurrence.status == "DONE", HabitOccurrence.scheduled_date >= start, HabitOccurrence.scheduled_date < end).scalar() or 0
        d["habits_rate"] = round(h_done / h_total * 100) if h_total else 0
        return d

    MONTHS = ["", "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"]
    cur = _stats(cur_start, today + timedelta(days=1))
    cur["label"] = f"{MONTHS[cur_start.month]} {cur_start.year}"
    prev = _stats(prev_start, cur_start)
    prev["label"] = f"{MONTHS[prev_start.month]} {prev_start.year}"
    return {"current": cur, "previous": prev}
