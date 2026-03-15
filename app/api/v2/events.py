"""
GET  /api/v2/events  — upcoming event occurrences
POST /api/v2/events  — create a one-time event
"""
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.v2.deps import get_user_id
from app.infrastructure.db.models import EventOccurrenceModel, CalendarEventModel, WorkCategory
from app.infrastructure.db.session import get_db

router = APIRouter()


class EventItem(BaseModel):
    occurrence_id: int
    event_id: int
    title: str
    description: str | None
    start_date: str
    start_time: str | None
    end_date: str | None
    is_all_day: bool
    category_emoji: str | None
    category_title: str | None
    is_today: bool
    is_past: bool


@router.get("/events", response_model=list[EventItem])
def get_events(
    days: int = Query(default=30, ge=1, le=90),
    user_id: int = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    today = date.today()
    until = today + timedelta(days=days)

    occurrences = (
        db.query(EventOccurrenceModel)
        .filter(
            EventOccurrenceModel.account_id == user_id,
            EventOccurrenceModel.start_date >= today - timedelta(days=7),
            EventOccurrenceModel.start_date <= until,
            EventOccurrenceModel.is_cancelled == False,
        )
        .order_by(
            EventOccurrenceModel.start_date,
            EventOccurrenceModel.start_time.nullslast(),
        )
        .all()
    )

    if not occurrences:
        return []

    event_ids = {o.event_id for o in occurrences}
    events_map: dict[int, CalendarEventModel] = {}
    if event_ids:
        rows = db.query(CalendarEventModel).filter(
            CalendarEventModel.event_id.in_(event_ids)
        ).all()
        events_map = {e.event_id: e for e in rows}

    cat_ids = {e.category_id for e in events_map.values()}
    cats: dict[int, WorkCategory] = {}
    if cat_ids:
        rows = db.query(WorkCategory).filter(WorkCategory.category_id.in_(cat_ids)).all()
        cats = {c.category_id: c for c in rows}

    result = []
    for occ in occurrences:
        evt = events_map.get(occ.event_id)
        if not evt:
            continue
        cat = cats.get(evt.category_id)
        time_str = occ.start_time.strftime("%H:%M") if occ.start_time else None
        end_str = str(occ.end_date) if occ.end_date else None

        result.append(EventItem(
            occurrence_id=occ.id,
            event_id=occ.event_id,
            title=evt.title,
            description=evt.description,
            start_date=str(occ.start_date),
            start_time=time_str,
            end_date=end_str,
            is_all_day=occ.start_time is None,
            category_emoji=cat.emoji if cat else None,
            category_title=cat.title if cat else None,
            is_today=occ.start_date == today,
            is_past=occ.start_date < today,
        ))

    return result


class CreateEventRequest(BaseModel):
    title: str
    start_date: str            # YYYY-MM-DD
    start_time: str | None = None  # HH:MM
    end_date: str | None = None
    end_time: str | None = None
    description: str | None = None
    category_id: int | None = None


@router.post("/events", status_code=201)
def create_event(body: CreateEventRequest, request: Request, db: Session = Depends(get_db)):
    from app.application.events import CreateEventUseCase, EventValidationError
    user_id = get_user_id(request)
    if not body.title.strip():
        raise HTTPException(status_code=400, detail="Название не может быть пустым")

    # category_id is required by the domain — use first available if not provided
    cat_id = body.category_id
    if not cat_id:
        cat = db.query(WorkCategory).filter(
            WorkCategory.account_id == user_id,
            WorkCategory.is_archived == False,
        ).first()
        cat_id = cat.category_id if cat else 1  # fallback

    try:
        event_id = CreateEventUseCase(db).execute(
            account_id=user_id,
            title=body.title,
            category_id=cat_id,
            description=body.description,
            occ_start_date=body.start_date,
            occ_start_time=body.start_time,
            occ_end_date=body.end_date,
            occ_end_time=body.end_time,
            actor_user_id=user_id,
        )
    except EventValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"id": event_id}
