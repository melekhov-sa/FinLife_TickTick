"""GET /api/v2/dashboard — aggregated dashboard data."""
from datetime import date, datetime, timedelta
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


class LevelBlock(BaseModel):
    level: int
    total_xp: int
    current_level_xp: int
    xp_to_next_level: int
    percent_progress: float
    xp_this_month: int


class EfficiencyBlock(BaseModel):
    score: int
    snapshot_date: date | None

    @field_serializer("snapshot_date")
    def serialize_date(self, v: date | None) -> str | None:
        return v.isoformat() if v else None


class WeekEvent(BaseModel):
    event_id: int
    occurrence_id: int
    title: str
    start_date: date
    start_time: str | None
    category_emoji: str | None
    is_today: bool

    @field_serializer("start_date")
    def serialize_date(self, v: date) -> str:
        return v.isoformat()


class ExpiringSub(BaseModel):
    member_id: int
    contact_name: str
    subscription_title: str
    paid_until: date
    days_left: int

    @field_serializer("paid_until")
    def serialize_date(self, v: date) -> str:
        return v.isoformat()


class DashboardResponse(BaseModel):
    today: TodayBlock
    upcoming_payments: list[UpcomingPayment]
    habit_heatmap: list[HeatmapCell]
    financial_summary: dict[str, FinancialCurrencyBlock]
    fin_state: FinStateBlock
    feed: list[FeedGroup]
    level: LevelBlock | None
    efficiency: EfficiencyBlock | None
    week_events: list[WeekEvent]
    expiring_subs: list[ExpiringSub]


# ── Route ─────────────────────────────────────────────────────────────────────

@router.get("/dashboard", response_model=DashboardResponse)
def get_dashboard(request: Request, db: Session = Depends(get_db)):
    from app.infrastructure.db.models import (
        EfficiencySnapshot, EventOccurrenceModel, CalendarEventModel,
        WorkCategory, SubscriptionMemberModel, SubscriptionModel, ContactModel,
    )
    from app.application.xp import XpService

    user_id = get_user_id(request)
    svc = DashboardService(db)
    today = date.today()

    # ── Existing blocks ────────────────────────────────────────────────────────
    today_block_raw = svc.get_today_block(user_id, today)
    upcoming_raw = svc.get_upcoming_payments(user_id, today)
    heatmap_raw = svc.get_habit_heatmap(user_id, today)
    fin_summary_raw = svc.get_financial_summary(user_id, today)
    fin_state_raw = svc.get_fin_state_summary(user_id, today)
    feed_raw = svc.get_dashboard_feed(user_id, today)

    # ── Level ──────────────────────────────────────────────────────────────────
    try:
        xp_data = XpService(db).get_xp_profile(user_id)
        level_block = LevelBlock(
            level=xp_data["level"],
            total_xp=xp_data["total_xp"],
            current_level_xp=xp_data["current_level_xp"],
            xp_to_next_level=xp_data["xp_to_next_level"],
            percent_progress=float(xp_data.get("percent_progress", 0)),
            xp_this_month=xp_data.get("xp_this_month", 0),
        )
    except Exception:
        level_block = None

    # ── Efficiency ─────────────────────────────────────────────────────────────
    try:
        snap = (
            db.query(EfficiencySnapshot)
            .filter(EfficiencySnapshot.account_id == user_id)
            .order_by(EfficiencySnapshot.snapshot_date.desc())
            .first()
        )
        efficiency_block = EfficiencyBlock(
            score=int(snap.efficiency_score) if snap else 0,
            snapshot_date=snap.snapshot_date if snap else None,
        ) if snap else None
    except Exception:
        efficiency_block = None

    # ── Week events ────────────────────────────────────────────────────────────
    week_end = today + timedelta(days=6)
    try:
        # Batch-load category emojis
        wc_rows = db.query(WorkCategory).filter(WorkCategory.account_id == user_id).all()
        wc_emoji_map = {w.category_id: w.emoji for w in wc_rows if w.emoji}

        occ_rows = (
            db.query(EventOccurrenceModel)
            .filter(
                EventOccurrenceModel.account_id == user_id,
                EventOccurrenceModel.is_cancelled == False,  # noqa: E712
                EventOccurrenceModel.start_date >= today,
                EventOccurrenceModel.start_date <= week_end,
            )
            .order_by(
                EventOccurrenceModel.start_date.asc(),
                EventOccurrenceModel.start_time.asc().nullslast(),
            )
            .limit(20)
            .all()
        )

        ev_cache: dict[int, CalendarEventModel] = {}
        week_events: list[WeekEvent] = []
        for occ in occ_rows:
            if occ.event_id not in ev_cache:
                ev = db.query(CalendarEventModel).filter(
                    CalendarEventModel.event_id == occ.event_id
                ).first()
                if ev:
                    ev_cache[occ.event_id] = ev
            ev = ev_cache.get(occ.event_id)
            if ev and ev.is_active:
                week_events.append(WeekEvent(
                    event_id=occ.event_id,
                    occurrence_id=occ.id,
                    title=ev.title,
                    start_date=occ.start_date,
                    start_time=str(occ.start_time) if occ.start_time else None,
                    category_emoji=wc_emoji_map.get(ev.category_id) if ev.category_id else None,
                    is_today=(occ.start_date == today),
                ))
    except Exception:
        week_events = []

    # ── Expiring subscriptions ─────────────────────────────────────────────────
    try:
        horizon = today + timedelta(days=30)
        member_rows = (
            db.query(SubscriptionMemberModel)
            .filter(
                SubscriptionMemberModel.account_id == user_id,
                SubscriptionMemberModel.paid_until != None,  # noqa: E711
                SubscriptionMemberModel.paid_until >= today,
                SubscriptionMemberModel.paid_until <= horizon,
            )
            .order_by(SubscriptionMemberModel.paid_until.asc())
            .limit(10)
            .all()
        )

        contact_cache: dict[int, ContactModel] = {}
        sub_cache: dict[int, SubscriptionModel] = {}
        expiring_subs: list[ExpiringSub] = []

        for m in member_rows:
            if m.contact_id not in contact_cache:
                c = db.query(ContactModel).filter(ContactModel.id == m.contact_id).first()
                if c:
                    contact_cache[m.contact_id] = c
            if m.subscription_id not in sub_cache:
                s = db.query(SubscriptionModel).filter(SubscriptionModel.id == m.subscription_id).first()
                if s:
                    sub_cache[m.subscription_id] = s

            contact = contact_cache.get(m.contact_id)
            sub = sub_cache.get(m.subscription_id)
            if contact and sub:
                expiring_subs.append(ExpiringSub(
                    member_id=m.id,
                    contact_name=contact.name,
                    subscription_title=sub.title,
                    paid_until=m.paid_until,
                    days_left=(m.paid_until - today).days,
                ))
    except Exception:
        expiring_subs = []

    # ── Assemble response ──────────────────────────────────────────────────────

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
        level=level_block,
        efficiency=efficiency_block,
        week_events=week_events,
        expiring_subs=expiring_subs,
    )
