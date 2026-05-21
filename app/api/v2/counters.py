"""API v2 — Arbitrary counters for the analytics page."""
from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.v2.deps import get_user_id
from app.infrastructure.db.session import get_db
from app.infrastructure.db.models import CounterModel, CounterEntryModel
from app.application.counters import compute_stats

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class CounterOut(BaseModel):
    id: int
    title: str
    emoji: Optional[str]
    mode: str
    source_category_id: Optional[int]
    period_type: str
    sort_order: int
    current_count: int
    previous_count: int
    current_label: str
    previous_label: str

    class Config:
        from_attributes = True


class CreateCounterRequest(BaseModel):
    title: str
    emoji: Optional[str] = None
    mode: str = "manual"
    source_category_id: Optional[int] = None
    period_type: str = "year"


class UpdateCounterRequest(BaseModel):
    title: Optional[str] = None
    emoji: Optional[str] = None
    mode: Optional[str] = None
    source_category_id: Optional[int] = None
    period_type: Optional[str] = None
    sort_order: Optional[int] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_counter(db: Session, counter_id: int, account_id: int) -> CounterModel:
    c = db.query(CounterModel).filter(
        CounterModel.id == counter_id,
        CounterModel.account_id == account_id,
        CounterModel.is_archived == False,  # noqa: E712
    ).first()
    if not c:
        raise HTTPException(404, "Counter not found")
    return c


def _to_out(db: Session, counter: CounterModel, today: date) -> CounterOut:
    stats = compute_stats(db, counter, today)
    return CounterOut(
        id=counter.id,
        title=counter.title,
        emoji=counter.emoji,
        mode=counter.mode,
        source_category_id=counter.source_category_id,
        period_type=counter.period_type,
        sort_order=counter.sort_order,
        **stats,
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/counters", response_model=list[CounterOut])
def list_counters(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_user_id),
):
    today = date.today()
    counters = (
        db.query(CounterModel)
        .filter(
            CounterModel.account_id == user_id,
            CounterModel.is_archived == False,  # noqa: E712
        )
        .order_by(CounterModel.sort_order, CounterModel.id)
        .all()
    )
    return [_to_out(db, c, today) for c in counters]


@router.post("/counters", response_model=CounterOut, status_code=201)
def create_counter(
    body: CreateCounterRequest,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_user_id),
):
    title = body.title.strip()
    if not title:
        raise HTTPException(400, "title is required")
    if body.mode not in ("manual", "auto_event", "auto_task"):
        raise HTTPException(400, "mode must be manual, auto_event, or auto_task")
    if body.mode != "manual" and not body.source_category_id:
        raise HTTPException(400, "source_category_id required for auto modes")
    if body.period_type not in ("year", "month"):
        raise HTTPException(400, "period_type must be year or month")

    max_order = db.query(CounterModel).filter(
        CounterModel.account_id == user_id
    ).count()

    counter = CounterModel(
        account_id=user_id,
        title=title,
        emoji=body.emoji,
        mode=body.mode,
        source_category_id=body.source_category_id,
        period_type=body.period_type,
        sort_order=max_order,
    )
    db.add(counter)
    db.commit()
    db.refresh(counter)
    return _to_out(db, counter, date.today())


@router.patch("/counters/{counter_id}", response_model=CounterOut)
def update_counter(
    counter_id: int,
    body: UpdateCounterRequest,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_user_id),
):
    counter = _get_counter(db, counter_id, user_id)
    if body.title is not None:
        counter.title = body.title.strip() or counter.title
    if body.emoji is not None:
        counter.emoji = body.emoji or None
    if "emoji" in body.model_fields_set and body.emoji == "":
        counter.emoji = None
    if body.mode is not None:
        counter.mode = body.mode
    if "source_category_id" in body.model_fields_set:
        counter.source_category_id = body.source_category_id
    if body.period_type is not None:
        counter.period_type = body.period_type
    if body.sort_order is not None:
        counter.sort_order = body.sort_order
    db.commit()
    db.refresh(counter)
    return _to_out(db, counter, date.today())


@router.delete("/counters/{counter_id}", status_code=204)
def delete_counter(
    counter_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_user_id),
):
    counter = _get_counter(db, counter_id, user_id)
    counter.is_archived = True
    db.commit()


@router.post("/counters/{counter_id}/increment", response_model=CounterOut)
def increment_counter(
    counter_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_user_id),
):
    counter = _get_counter(db, counter_id, user_id)
    if counter.mode != "manual":
        raise HTTPException(400, "Only manual counters can be incremented")
    entry = CounterEntryModel(
        counter_id=counter.id,
        account_id=user_id,
        recorded_date=date.today(),
        delta=1,
    )
    db.add(entry)
    db.commit()
    return _to_out(db, counter, date.today())


@router.post("/counters/{counter_id}/decrement", response_model=CounterOut)
def decrement_counter(
    counter_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_user_id),
):
    counter = _get_counter(db, counter_id, user_id)
    if counter.mode != "manual":
        raise HTTPException(400, "Only manual counters can be decremented")
    today = date.today()
    stats = compute_stats(db, counter, today)
    if stats["current_count"] <= 0:
        raise HTTPException(400, "Counter is already at 0")
    entry = CounterEntryModel(
        counter_id=counter.id,
        account_id=user_id,
        recorded_date=today,
        delta=-1,
    )
    db.add(entry)
    db.commit()
    return _to_out(db, counter, today)
