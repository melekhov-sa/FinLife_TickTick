"""GET/POST/PATCH/DELETE /api/v2/maintenance — maintenance tracker."""
from datetime import date, datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.infrastructure.db.session import get_db
from app.api.v2.deps import get_user_id
from app.config import get_settings

router = APIRouter()


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class MaintenanceOut(BaseModel):
    id: int
    title: str
    description: Optional[str]
    interval_days: int
    last_done_date: Optional[date]
    last_done_note: Optional[str]
    notify_days_before: Optional[int]
    is_archived: bool
    next_due_date: Optional[date]
    days_until_next: Optional[int]
    is_overdue: bool
    is_never_done: bool

    class Config:
        from_attributes = True


class MaintenanceCreate(BaseModel):
    title: str
    description: Optional[str] = None
    interval_days: int
    last_done_date: Optional[date] = None
    notify_days_before: Optional[int] = 3


class MaintenanceUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    interval_days: Optional[int] = None
    notify_days_before: Optional[int] = None


class MarkDoneBody(BaseModel):
    done_date: Optional[date] = None
    note: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _enrich(item, today: date) -> MaintenanceOut:
    next_due: Optional[date] = None
    days_until: Optional[int] = None
    if item.last_done_date:
        next_due = item.last_done_date + timedelta(days=item.interval_days)
        days_until = (next_due - today).days

    return MaintenanceOut(
        id=item.id,
        title=item.title,
        description=item.description,
        interval_days=item.interval_days,
        last_done_date=item.last_done_date,
        last_done_note=item.last_done_note,
        notify_days_before=item.notify_days_before,
        is_archived=item.is_archived,
        next_due_date=next_due,
        days_until_next=days_until,
        is_overdue=days_until is not None and days_until < 0,
        is_never_done=item.last_done_date is None,
    )


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/maintenance", response_model=list[MaintenanceOut])
def list_maintenance(request: Request, include_archived: bool = False, db: Session = Depends(get_db)):
    from app.infrastructure.db.models import MaintenanceItemModel
    user_id = get_user_id(request, db)
    today = datetime.now(ZoneInfo(get_settings().TIMEZONE)).date()

    q = db.query(MaintenanceItemModel).filter(MaintenanceItemModel.account_id == user_id)
    if not include_archived:
        q = q.filter(MaintenanceItemModel.is_archived == False)  # noqa: E712
    items = q.order_by(MaintenanceItemModel.id.asc()).all()
    return [_enrich(i, today) for i in items]


@router.post("/maintenance", response_model=MaintenanceOut, status_code=201)
def create_maintenance(body: MaintenanceCreate, request: Request, db: Session = Depends(get_db)):
    from app.infrastructure.db.models import MaintenanceItemModel
    user_id = get_user_id(request, db)
    today = datetime.now(ZoneInfo(get_settings().TIMEZONE)).date()

    item = MaintenanceItemModel(
        account_id=user_id,
        title=body.title,
        description=body.description,
        interval_days=body.interval_days,
        last_done_date=body.last_done_date,
        notify_days_before=body.notify_days_before,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _enrich(item, today)


@router.patch("/maintenance/{item_id}", response_model=MaintenanceOut)
def update_maintenance(item_id: int, body: MaintenanceUpdate, request: Request, db: Session = Depends(get_db)):
    from app.infrastructure.db.models import MaintenanceItemModel
    user_id = get_user_id(request, db)
    today = datetime.now(ZoneInfo(get_settings().TIMEZONE)).date()

    item = db.query(MaintenanceItemModel).filter(
        MaintenanceItemModel.id == item_id, MaintenanceItemModel.account_id == user_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return _enrich(item, today)


@router.post("/maintenance/{item_id}/done", response_model=MaintenanceOut)
def mark_done(item_id: int, body: MarkDoneBody, request: Request, db: Session = Depends(get_db)):
    from app.infrastructure.db.models import MaintenanceItemModel
    user_id = get_user_id(request, db)
    today = datetime.now(ZoneInfo(get_settings().TIMEZONE)).date()

    item = db.query(MaintenanceItemModel).filter(
        MaintenanceItemModel.id == item_id, MaintenanceItemModel.account_id == user_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    item.last_done_date = body.done_date or today
    item.last_done_note = body.note
    db.commit()
    db.refresh(item)
    return _enrich(item, today)


@router.delete("/maintenance/{item_id}", status_code=204)
def archive_maintenance(item_id: int, request: Request, db: Session = Depends(get_db)):
    from app.infrastructure.db.models import MaintenanceItemModel
    user_id = get_user_id(request, db)

    item = db.query(MaintenanceItemModel).filter(
        MaintenanceItemModel.id == item_id, MaintenanceItemModel.account_id == user_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    item.is_archived = True
    db.commit()
