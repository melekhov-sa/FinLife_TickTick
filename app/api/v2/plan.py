"""GET /api/v2/plan — Plan timeline view (tasks + events + habits + planned_ops)."""
from datetime import date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy.orm import Session

from app.infrastructure.db.session import get_db
from app.api.v2.deps import get_user_id
from app.application.plan import build_plan_view
from app.config import get_settings

router = APIRouter()


def _serialize_value(v):
    """Convert Python date/time/Decimal to JSON-safe types."""
    if v is None:
        return None
    if isinstance(v, Decimal):
        return float(v)
    if hasattr(v, "isoformat"):
        return v.isoformat()
    return v


def _serialize_meta(meta: dict) -> dict:
    return {k: _serialize_value(v) for k, v in (meta or {}).items()}


def _serialize_item(item: dict) -> dict:
    return {
        "kind": item["kind"],
        "id": item["id"],
        "title": item["title"],
        "date": item["date"].isoformat() if item.get("date") else None,
        "time": str(item["time"])[:5] if item.get("time") else None,
        "is_done": item["is_done"],
        "is_overdue": item["is_overdue"],
        "status": item.get("status"),
        "category_emoji": item.get("category_emoji"),
        "category_title": item.get("category_title"),
        "meta": _serialize_meta(item.get("meta", {})),
    }


def _serialize_group(group: dict) -> dict:
    return {
        "date": group["date"].isoformat() if group.get("date") else None,
        "date_label": group["date_label"],
        "is_today": group["is_today"],
        "is_overdue_group": group["is_overdue_group"],
        "entries": [_serialize_item(e) for e in group["entries"]],
    }


@router.get("/plan")
def get_plan(
    request: Request,
    tab: str = Query("active", regex="^(active|done|archive)$"),
    range: int = Query(7),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(request, db)
    today = datetime.now(ZoneInfo(get_settings().TIMEZONE)).date()
    range_days = max(1, min(range, 90))

    view = build_plan_view(db, user_id, today, tab=tab, range_days=range_days)

    return {
        "tab": view["tab"],
        "range_days": view["range_days"],
        "today": today.isoformat(),
        "summary": view["summary"],
        "today_progress": view["today_progress"],
        "day_groups": [_serialize_group(g) for g in view["day_groups"]],
        "done_today": [_serialize_item(i) for i in view["done_today"]],
    }
