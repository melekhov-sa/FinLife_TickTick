"""
Analytics API endpoints — income/expense statistics.

GET /api/v2/analytics/summary           — headline numbers for a month
GET /api/v2/analytics/monthly-trend     — 12-month income/expense trend
GET /api/v2/analytics/category-breakdown — category donut for a month
GET /api/v2/analytics/daily-spending    — daily bar chart for a month
GET /api/v2/analytics/category-trend    — top categories over months
"""
from datetime import date

from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy.orm import Session

from app.infrastructure.db.session import get_db
from app.api.v2.deps import get_user_id
from app.application.analytics import AnalyticsService

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
