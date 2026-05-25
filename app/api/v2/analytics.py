"""
Analytics API endpoints — income/expense + productivity statistics.

GET /api/v2/analytics/summary           — headline numbers for a month
GET /api/v2/analytics/monthly-trend     — 12-month income/expense trend
GET /api/v2/analytics/category-breakdown — category donut for a month
GET /api/v2/analytics/daily-spending    — daily bar chart for a month
GET /api/v2/analytics/category-trend    — top categories over months
GET /api/v2/analytics/productivity      — tasks + habits stats
"""
import logging
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request, Query

logger = logging.getLogger(__name__)
from sqlalchemy import func, case, and_, or_, extract
from sqlalchemy.orm import Session

from app.infrastructure.db.session import get_db
from app.api.v2.deps import get_user_id
from app.application.analytics import AnalyticsService
from app.infrastructure.db.models import (
    TaskModel, HabitModel, HabitOccurrence,
    WalletBalance, TransactionFeed, GoalInfo, GoalWalletBalance,
    SubscriptionModel, SubscriptionMemberModel,
    UserActivityDaily, CategoryInfo, WorkCategory,
    BudgetLine, BudgetMonth,
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
    try:
        return _analytics_productivity_impl(request, db)
    except Exception as exc:
        logger.exception("analytics/productivity failed: %s", exc)
        raise


def _analytics_productivity_impl(request: Request, db: Session):
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

    # Daily habit completion (last 91 days = 13 weeks, covers heatmap)
    d91 = today - timedelta(days=90)
    daily_habits_raw = (
        db.query(
            HabitOccurrence.scheduled_date,
            func.count().label("total"),
            func.sum(case((HabitOccurrence.status == "DONE", 1), else_=0)).label("done"),
        )
        .filter(
            HabitOccurrence.account_id == user_id,
            HabitOccurrence.scheduled_date >= d91,
            HabitOccurrence.scheduled_date <= today,
        )
        .group_by(HabitOccurrence.scheduled_date)
        .order_by(HabitOccurrence.scheduled_date)
        .all()
    )
    daily_habits = [
        {"date": r.scheduled_date.isoformat(), "done": int(r.done), "total": int(r.total)}
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


# ── Activity feed ─────────────────────────────────────────────────────────────

@router.get("/activity-feed")
def activity_feed(
    request: Request,
    days: int = Query(default=7, le=30),
    limit: int = Query(default=15, le=30),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(request, db)
    since_dt = datetime.now(timezone.utc) - timedelta(days=days)
    since_date = since_dt.date()
    items = []

    # Recent income/expense transactions with category name
    txns = (
        db.query(TransactionFeed, CategoryInfo)
        .outerjoin(CategoryInfo, and_(
            CategoryInfo.category_id == TransactionFeed.category_id,
            CategoryInfo.account_id == user_id,
        ))
        .filter(
            TransactionFeed.account_id == user_id,
            TransactionFeed.occurred_at >= since_dt,
            TransactionFeed.operation_type.in_(["INCOME", "EXPENSE"]),
        )
        .order_by(TransactionFeed.occurred_at.desc())
        .limit(limit)
        .all()
    )
    for txn, cat in txns:
        items.append({
            "type": "transaction",
            "title": cat.title if cat else ("Доход" if txn.operation_type == "INCOME" else "Расход"),
            "amount": float(txn.amount),
            "op_type": txn.operation_type,
            "currency": txn.currency,
            "ts": txn.occurred_at.isoformat(),
        })

    # Completed tasks
    tasks = (
        db.query(TaskModel)
        .filter(
            TaskModel.account_id == user_id,
            TaskModel.status == "DONE",
            TaskModel.completed_at >= since_dt,
        )
        .order_by(TaskModel.completed_at.desc())
        .limit(limit)
        .all()
    )
    for t in tasks:
        items.append({
            "type": "task",
            "title": t.title,
            "ts": t.completed_at.isoformat(),
        })

    # Completed habits
    habit_occs = (
        db.query(HabitOccurrence, HabitModel)
        .join(HabitModel, HabitOccurrence.habit_id == HabitModel.id)
        .filter(
            HabitOccurrence.account_id == user_id,
            HabitOccurrence.status == "DONE",
            HabitOccurrence.scheduled_date >= since_date,
        )
        .order_by(HabitOccurrence.scheduled_date.desc())
        .limit(limit)
        .all()
    )
    for occ, habit in habit_occs:
        items.append({
            "type": "habit",
            "title": habit.title,
            "ts": occ.scheduled_date.isoformat(),
        })

    items.sort(key=lambda x: x["ts"], reverse=True)
    return {"items": items[:limit]}


# ── Tasks overview (progress page) ───────────────────────────────────────────

@router.get("/tasks-overview")
def tasks_overview(request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    today = date.today()

    # ── Period boundaries ────────────────────────────────────────────────────
    cur_start = today.replace(day=1)
    prev_start = (cur_start - timedelta(days=1)).replace(day=1)
    d30 = today - timedelta(days=29)
    d91 = today - timedelta(days=90)
    d90 = today - timedelta(days=90)

    task_q = db.query(TaskModel).filter(TaskModel.account_id == user_id)

    # ── KPI: current month ───────────────────────────────────────────────────
    done_cur = task_q.filter(
        TaskModel.status == "DONE",
        TaskModel.completed_at >= cur_start,
    ).count()
    done_prev = task_q.filter(
        TaskModel.status == "DONE",
        TaskModel.completed_at >= prev_start,
        TaskModel.completed_at < cur_start,
    ).count()

    days_elapsed = max((today - cur_start).days + 1, 1)
    avg_per_day = round(done_cur / days_elapsed, 1)

    # On-time rate: tasks with due_date completed on or before due_date
    with_due = task_q.filter(
        TaskModel.status == "DONE",
        TaskModel.completed_at >= d30,
        TaskModel.due_date != None,
    ).all()
    on_time = sum(
        1 for t in with_due
        if t.completed_at and t.due_date
        and t.completed_at.date() <= t.due_date
    )
    on_time_rate = round(on_time / len(with_due) * 100) if with_due else None

    # Completion rate: done / (done + active-with-due this month)
    active_with_due_cur = task_q.filter(
        TaskModel.status == "ACTIVE",
        TaskModel.due_date >= cur_start,
        TaskModel.due_date <= today,
    ).count()
    completion_rate = (
        round(done_cur / (done_cur + active_with_due_cur) * 100)
        if (done_cur + active_with_due_cur) > 0 else None
    )

    # ── Heatmap: 91 days daily task completion ───────────────────────────────
    heatmap_raw = (
        db.query(
            func.date(TaskModel.completed_at).label("day"),
            func.count().label("cnt"),
        )
        .filter(
            TaskModel.account_id == user_id,
            TaskModel.status == "DONE",
            TaskModel.completed_at >= d91,
        )
        .group_by("day")
        .all()
    )
    heatmap_map = {str(r.day): r.cnt for r in heatmap_raw}
    heatmap = []
    for i in range(91):
        d = d91 + timedelta(days=i)
        cnt = heatmap_map.get(d.isoformat(), 0)
        heatmap.append({"date": d.isoformat(), "count": cnt})

    # ── Category breakdown: last 30 days ────────────────────────────────────
    cat_raw = (
        db.query(
            TaskModel.category_id,
            func.count().label("cnt"),
        )
        .filter(
            TaskModel.account_id == user_id,
            TaskModel.status == "DONE",
            TaskModel.completed_at >= d30,
        )
        .group_by(TaskModel.category_id)
        .order_by(func.count().desc())
        .all()
    )
    cat_ids = [r.category_id for r in cat_raw if r.category_id]
    cats_map: dict = {}
    if cat_ids:
        cats = db.query(WorkCategory).filter(WorkCategory.category_id.in_(cat_ids)).all()
        cats_map = {c.category_id: c for c in cats}
    total_cat = sum(r.cnt for r in cat_raw)
    categories = []
    for r in cat_raw:
        cat = cats_map.get(r.category_id) if r.category_id else None
        categories.append({
            "category_id": r.category_id,
            "title": cat.title if cat else "Без категории",
            "emoji": cat.emoji if cat else None,
            "count": r.cnt,
            "pct": round(r.cnt / total_cat * 100) if total_cat else 0,
        })

    # ── Weekday rhythm: last 90 days ─────────────────────────────────────────
    wd_raw = (
        db.query(
            extract("dow", TaskModel.completed_at).label("dow"),
            func.count().label("cnt"),
        )
        .filter(
            TaskModel.account_id == user_id,
            TaskModel.status == "DONE",
            TaskModel.completed_at >= d90,
        )
        .group_by("dow")
        .all()
    )
    WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"]
    wd_map = {int(r.dow): r.cnt for r in wd_raw}
    # Count of each weekday in the 90-day window to get average
    weekday_counts = [0] * 7
    for i in range(90):
        d = d90 + timedelta(days=i)
        weekday_counts[d.weekday() + 1 if d.weekday() < 6 else 0] += 1
    weekday_counts[0] = weekday_counts[0] or 1  # avoid div-by-zero for Sunday
    weekdays_result = []
    for i in range(7):
        dow_i = i  # 0=Sun in postgres extract
        total_in_window = weekday_counts[dow_i] or 1
        avg = round(wd_map.get(dow_i, 0) / total_in_window, 1)
        weekdays_result.append({"day": WEEKDAYS[dow_i], "avg": avg, "total": wd_map.get(dow_i, 0)})
    # Reorder Mon→Sun
    weekdays_result = weekdays_result[1:] + weekdays_result[:1]

    # ── Habits per-habit stats ───────────────────────────────────────────────
    habits = (
        db.query(HabitModel)
        .filter(HabitModel.account_id == user_id, HabitModel.is_archived == False)
        .order_by(HabitModel.current_streak.desc())
        .all()
    )
    habit_ids = [h.habit_id for h in habits]

    # Weekly completion rates for each habit over last 4 weeks
    habits_out = []
    for h in habits:
        # Per-week done/total for last 4 weeks
        weekly = []
        for w in range(4):
            wend = today - timedelta(weeks=w)
            wstart = wend - timedelta(days=6)
            total_w = db.query(func.count()).select_from(HabitOccurrence).filter(
                HabitOccurrence.habit_id == h.habit_id,
                HabitOccurrence.scheduled_date >= wstart,
                HabitOccurrence.scheduled_date <= wend,
            ).scalar() or 0
            done_w = db.query(func.count()).select_from(HabitOccurrence).filter(
                HabitOccurrence.habit_id == h.habit_id,
                HabitOccurrence.scheduled_date >= wstart,
                HabitOccurrence.scheduled_date <= wend,
                HabitOccurrence.status == "DONE",
            ).scalar() or 0
            weekly.append(round(done_w / total_w * 100) if total_w else 0)
        weekly.reverse()  # oldest first

        habits_out.append({
            "habit_id": h.habit_id,
            "title": h.title,
            "emoji": h.category_emoji if hasattr(h, "category_emoji") else None,
            "current_streak": h.current_streak or 0,
            "best_streak": h.best_streak or 0,
            "done_30d": h.done_count_30d or 0,
            "rate_30d": round(h.done_count_30d / 30 * 100) if h.done_count_30d else 0,
            "weekly_rates": weekly,  # [w-3, w-2, w-1, current_week] completion %
        })

    return {
        "kpi": {
            "done_cur": done_cur,
            "done_prev": done_prev,
            "avg_per_day": avg_per_day,
            "on_time_rate": on_time_rate,
            "completion_rate": completion_rate,
        },
        "heatmap": heatmap,
        "categories": categories,
        "weekdays": weekdays_result,
        "habits": habits_out,
    }


# ── Budget stats (budget/stats page + category panel) ────────────────────────

_SHORT_MONTHS = {
    1: "Янв", 2: "Фев", 3: "Мар", 4: "Апр", 5: "Май", 6: "Июн",
    7: "Июл", 8: "Авг", 9: "Сен", 10: "Окт", 11: "Ноя", 12: "Дек",
}


def _months_back(today: date, n: int) -> list[tuple[int, int]]:
    """Return list of (year, month) for last n months, oldest first, including today's month."""
    result = []
    for i in range(n - 1, -1, -1):
        m = today.month - i
        y = today.year
        while m <= 0:
            m += 12
            y -= 1
        result.append((y, m))
    return result


@router.get("/budget-stats")
def budget_stats(request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    today = date.today()

    months_12 = _months_back(today, 12)
    months_6 = months_12[-6:]
    months_3 = months_12[-3:]
    cur_month = months_12[-1]

    # Date range for fact query
    d_start = datetime(months_12[0][0], months_12[0][1], 1)
    next_m = cur_month[1] % 12 + 1
    next_y = cur_month[0] + (1 if cur_month[1] == 12 else 0)
    d_end = datetime(next_y, next_m, 1)

    # ── Fact per month per category (all INCOME/EXPENSE, 12 months) ──────────
    fact_rows = (
        db.query(
            extract("year", TransactionFeed.occurred_at).label("yr"),
            extract("month", TransactionFeed.occurred_at).label("mo"),
            TransactionFeed.category_id,
            TransactionFeed.operation_type,
            func.sum(TransactionFeed.amount).label("total"),
        )
        .filter(
            TransactionFeed.account_id == user_id,
            TransactionFeed.operation_type.in_(["INCOME", "EXPENSE"]),
            TransactionFeed.occurred_at >= d_start,
            TransactionFeed.occurred_at < d_end,
        )
        .group_by("yr", "mo", TransactionFeed.category_id, TransactionFeed.operation_type)
        .all()
    )

    fact_map: dict = {}      # (year, month, category_id, op_type) -> float
    monthly_totals: dict = {}  # (year, month, op_type) -> float
    for r in fact_rows:
        y, m = int(r.yr), int(r.mo)
        val = float(r.total)
        fact_map[(y, m, r.category_id, r.operation_type)] = (
            fact_map.get((y, m, r.category_id, r.operation_type), 0.0) + val
        )
        key = (y, m, r.operation_type)
        monthly_totals[key] = monthly_totals.get(key, 0.0) + val

    # ── Plan per month per category (6 months) ────────────────────────────────
    plan_conditions = or_(
        *[and_(BudgetMonth.year == y, BudgetMonth.month == m) for y, m in months_6]
    )
    plan_rows = (
        db.query(
            BudgetMonth.year,
            BudgetMonth.month,
            BudgetLine.category_id,
            BudgetLine.kind,
            func.sum(BudgetLine.plan_amount).label("total"),
        )
        .join(BudgetLine, BudgetLine.budget_month_id == BudgetMonth.id)
        .filter(BudgetMonth.account_id == user_id, plan_conditions)
        .group_by(BudgetMonth.year, BudgetMonth.month, BudgetLine.category_id, BudgetLine.kind)
        .all()
    )
    plan_map: dict = {}  # (year, month, category_id, kind) -> float
    for r in plan_rows:
        plan_map[(r.year, r.month, r.category_id, r.kind)] = float(r.total)

    # ── Categories ────────────────────────────────────────────────────────────
    cats = (
        db.query(CategoryInfo)
        .filter(
            CategoryInfo.account_id == user_id,
            CategoryInfo.is_archived == False,
            CategoryInfo.is_system == False,
        )
        .all()
    )

    # ── Monthly trend (12 months) ─────────────────────────────────────────────
    monthly_trend = []
    for (y, m) in months_12:
        inc = monthly_totals.get((y, m, "INCOME"), 0.0)
        exp = monthly_totals.get((y, m, "EXPENSE"), 0.0)
        monthly_trend.append({
            "year": y, "month": m,
            "label": f"{_SHORT_MONTHS[m]} '{y % 100:02d}",
            "income": round(inc),
            "expense": round(exp),
            "savings": round(inc - exp),
        })

    # ── KPI — 6-month averages ────────────────────────────────────────────────
    inc_6m = [monthly_totals.get((y, m, "INCOME"), 0.0) for y, m in months_6]
    exp_6m = [monthly_totals.get((y, m, "EXPENSE"), 0.0) for y, m in months_6]
    avg_inc = sum(inc_6m) / 6
    avg_exp = sum(exp_6m) / 6
    avg_sav = avg_inc - avg_exp
    avg_sav_rate = round(avg_sav / avg_inc * 100) if avg_inc else None

    # Plan accuracy: expense categories, only months where plan > 0
    acc_total = acc_ok = 0
    for (y, m) in months_6:
        for cat in cats:
            if cat.category_type != "EXPENSE":
                continue
            plan = plan_map.get((y, m, cat.category_id, "EXPENSE"), 0.0)
            if plan > 0:
                acc_total += 1
                if fact_map.get((y, m, cat.category_id, "EXPENSE"), 0.0) <= plan:
                    acc_ok += 1
    plan_accuracy_6m = round(acc_ok / acc_total * 100) if acc_total else None

    # ── Per-category stats ────────────────────────────────────────────────────
    total_exp_6m = sum(exp_6m)
    total_inc_6m = sum(inc_6m)

    cat_results = []
    for cat in cats:
        op = cat.category_type  # "INCOME" or "EXPENSE"

        facts_6m = [fact_map.get((y, m, cat.category_id, op), 0.0) for y, m in months_6]
        facts_3m = facts_6m[-3:]
        total_6m = sum(facts_6m)
        if total_6m == 0:
            continue

        avg_6m_cat = total_6m / 6
        avg_3m_cat = sum(facts_3m) / 3
        trend_pct = round((avg_3m_cat - avg_6m_cat) / avg_6m_cat * 100) if avg_6m_cat else None

        total_ref = total_exp_6m if op == "EXPENSE" else total_inc_6m
        pct = round(total_6m / total_ref * 100) if total_ref else 0

        # Per-category plan accuracy (6 months)
        cat_acc_total = cat_acc_ok = 0
        for (y, m) in months_6:
            plan = plan_map.get((y, m, cat.category_id, op), 0.0)
            if plan > 0:
                cat_acc_total += 1
                fact = fact_map.get((y, m, cat.category_id, op), 0.0)
                ok = fact <= plan if op == "EXPENSE" else fact >= plan
                if ok:
                    cat_acc_ok += 1
        cat_plan_acc = round(cat_acc_ok / cat_acc_total * 100) if cat_acc_total else None

        months_data = []
        for (y, m) in months_6:
            months_data.append({
                "year": y, "month": m,
                "label": f"{_SHORT_MONTHS[m]} '{y % 100:02d}",
                "fact": round(fact_map.get((y, m, cat.category_id, op), 0.0)),
                "plan": round(plan_map.get((y, m, cat.category_id, op), 0.0)),
            })

        cat_results.append({
            "category_id": cat.category_id,
            "title": cat.title,
            "kind": op,
            "avg_3m": round(avg_3m_cat),
            "avg_6m": round(avg_6m_cat),
            "pct_of_total_6m": pct,
            "trend_pct": trend_pct,
            "plan_accuracy_6m": cat_plan_acc,
            "months": months_data,
        })

    cat_results.sort(key=lambda x: -x["avg_6m"])

    return {
        "kpi": {
            "avg_income_6m": round(avg_inc),
            "avg_expense_6m": round(avg_exp),
            "avg_savings_6m": round(avg_sav),
            "avg_savings_rate_6m": avg_sav_rate,
            "plan_accuracy_expense_6m": plan_accuracy_6m,
        },
        "monthly_trend": monthly_trend,
        "categories": cat_results,
    }
