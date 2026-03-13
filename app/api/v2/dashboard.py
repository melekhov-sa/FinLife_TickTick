"""GET /api/v2/dashboard — aggregated dashboard data."""
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, field_serializer
from sqlalchemy.orm import Session

from app.infrastructure.db.session import get_db
from app.api.v2.deps import get_user_id
from app.application.dashboard import DashboardService

router = APIRouter()


# ── Pydantic response models ──────────────────────────────────────────────────

class ProgressBlock(BaseModel):
    total: int
    done: int
    left: int


class DashboardItem(BaseModel):
    kind: str
    id: int
    title: str
    date: date | None
    time: str | None = None
    is_done: bool
    is_overdue: bool
    category_emoji: str | None
    meta: dict[str, Any]

    @field_serializer("date")
    def serialize_date(self, v: date | None) -> str | None:
        return v.isoformat() if v else None


class TodayBlock(BaseModel):
    overdue: list[DashboardItem]
    active: list[DashboardItem]
    done: list[DashboardItem]
    events: list[DashboardItem]
    progress: ProgressBlock


class UpcomingPayment(BaseModel):
    occurrence_id: int
    template_id: int
    title: str
    scheduled_date: date
    kind: str
    kind_label: str
    amount: Decimal
    amount_formatted: str
    days_until: int

    @field_serializer("scheduled_date")
    def serialize_date(self, v: date) -> str:
        return v.isoformat()

    @field_serializer("amount")
    def serialize_amount(self, v: Decimal) -> float:
        return float(v)


class HeatmapCell(BaseModel):
    date: date
    done_count: int
    due_count: int
    ratio: float
    level: int

    @field_serializer("date")
    def serialize_date(self, v: date) -> str:
        return v.isoformat()


class FinancialCurrencyBlock(BaseModel):
    income: float
    expense: float
    difference: float


class FinStateBlock(BaseModel):
    regular_total: int
    credit_total: int
    savings_total: int
    financial_result: int
    debt_load_pct: int | None
    capital_delta_30: int | None


class FeedEvent(BaseModel):
    icon: str
    title: str
    subtitle: str
    occurred_at: datetime
    time_str: str
    amount_label: str | None
    amount_css: str | None

    @field_serializer("occurred_at")
    def serialize_dt(self, v: datetime) -> str:
        return v.isoformat()


class FeedGroup(BaseModel):
    label: str
    date: date
    events: list[FeedEvent]

    @field_serializer("date")
    def serialize_date(self, v: date) -> str:
        return v.isoformat()


class DashboardResponse(BaseModel):
    today: TodayBlock
    upcoming_payments: list[UpcomingPayment]
    habit_heatmap: list[HeatmapCell]
    financial_summary: dict[str, FinancialCurrencyBlock]
    fin_state: FinStateBlock
    feed: list[FeedGroup]


# ── Route ─────────────────────────────────────────────────────────────────────

@router.get("/dashboard", response_model=DashboardResponse)
def get_dashboard(request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request)
    svc = DashboardService(db)
    today = date.today()

    today_block_raw = svc.get_today_block(user_id, today)
    upcoming_raw = svc.get_upcoming_payments(user_id, today)
    heatmap_raw = svc.get_habit_heatmap(user_id, today)
    fin_summary_raw = svc.get_financial_summary(user_id, today)
    fin_state_raw = svc.get_fin_state_summary(user_id, today)
    feed_raw = svc.get_dashboard_feed(user_id, today)

    def _to_item(d: dict) -> DashboardItem:
        return DashboardItem(
            kind=d["kind"],
            id=d["id"],
            title=d["title"],
            date=d.get("date"),
            time=str(d["time"]) if d.get("time") else None,
            is_done=d["is_done"],
            is_overdue=d["is_overdue"],
            category_emoji=d.get("category_emoji"),
            meta={k: (str(v) if isinstance(v, Decimal) else v) for k, v in d.get("meta", {}).items()},
        )

    today_block = TodayBlock(
        overdue=[_to_item(x) for x in today_block_raw["overdue"]],
        active=[_to_item(x) for x in today_block_raw["active"]],
        done=[_to_item(x) for x in today_block_raw["done"]],
        events=[_to_item(x) for x in today_block_raw["events"]],
        progress=ProgressBlock(**today_block_raw["progress"]),
    )

    upcoming = [
        UpcomingPayment(
            occurrence_id=p["occurrence_id"],
            template_id=p["template_id"],
            title=p["title"],
            scheduled_date=p["scheduled_date"],
            kind=p["kind"],
            kind_label=p["kind_label"],
            amount=p["amount"],
            amount_formatted=p["amount_formatted"],
            days_until=p["days_until"],
        )
        for p in upcoming_raw
    ]

    heatmap = [HeatmapCell(**c) for c in heatmap_raw]

    fin_summary = {
        cur: FinancialCurrencyBlock(
            income=float(v["income"]),
            expense=float(v["expense"]),
            difference=float(v["difference"]),
        )
        for cur, v in fin_summary_raw.items()
    }

    fin_state = FinStateBlock(**fin_state_raw)

    feed = []
    for group in feed_raw:
        events = [
            FeedEvent(
                icon=e["icon"],
                title=e["title"],
                subtitle=e["subtitle"],
                occurred_at=e["occurred_at"],
                time_str=e["time_str"],
                amount_label=e.get("amount_label"),
                amount_css=e.get("amount_css"),
            )
            for e in group["events"]
        ]
        feed.append(FeedGroup(label=group["label"], date=group["date"], events=events))

    return DashboardResponse(
        today=today_block,
        upcoming_payments=upcoming,
        habit_heatmap=heatmap,
        financial_summary=fin_summary,
        fin_state=fin_state,
        feed=feed,
    )
