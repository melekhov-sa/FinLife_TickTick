"""
GET    /api/v2/events                          — upcoming event occurrences
POST   /api/v2/events                          — create a one-time event
PATCH  /api/v2/events/occurrences/{id}         — update occurrence + parent event
DELETE /api/v2/events/occurrences/{id}         — cancel occurrence
POST   /api/v2/events/occurrences/{id}/duplicate — duplicate occurrence
"""
from datetime import date, time as t_time, timedelta

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
    category_id: int | None
    category_emoji: str | None
    category_title: str | None
    is_today: bool
    is_past: bool


def _build_item(occ: EventOccurrenceModel, evt: CalendarEventModel, cat: WorkCategory | None, today: date) -> EventItem:
    time_str = occ.start_time.strftime("%H:%M") if occ.start_time else None
    end_str = str(occ.end_date) if occ.end_date else None
    return EventItem(
        occurrence_id=occ.id,
        event_id=occ.event_id,
        title=evt.title,
        description=evt.description,
        start_date=str(occ.start_date),
        start_time=time_str,
        end_date=end_str,
        is_all_day=occ.start_time is None,
        category_id=evt.category_id,
        category_emoji=cat.emoji if cat else None,
        category_title=cat.title if cat else None,
        is_today=occ.start_date == today,
        is_past=occ.start_date < today,
    )


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
            EventOccurrenceModel.is_cancelled == False,  # noqa: E712
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

    cat_ids = {e.category_id for e in events_map.values() if e.category_id}
    cats: dict[int, WorkCategory] = {}
    if cat_ids:
        rows = db.query(WorkCategory).filter(WorkCategory.category_id.in_(cat_ids)).all()
        cats = {c.category_id: c for c in rows}

    result = []
    for occ in occurrences:
        evt = events_map.get(occ.event_id)
        if not evt:
            continue
        cat = cats.get(evt.category_id) if evt.category_id else None
        result.append(_build_item(occ, evt, cat, today))

    return result


class CreateEventRequest(BaseModel):
    title: str
    start_date: str
    start_time: str | None = None
    end_date: str | None = None
    end_time: str | None = None
    description: str | None = None
    category_id: int | None = None
    # Recurring event support
    freq: str | None = None          # daily, weekly, monthly, yearly
    start_date_rule: str | None = None  # recurrence rule start
    # Reminder offset in minutes (e.g. 10, 60, 1440)
    reminder_offset: int | None = None


@router.post("/events", status_code=201)
def create_event(body: CreateEventRequest, request: Request, db: Session = Depends(get_db)):
    from app.application.events import (
        CreateEventUseCase, CreateDefaultReminderUseCase, EventValidationError,
    )
    user_id = get_user_id(request)
    if not body.title.strip():
        raise HTTPException(status_code=400, detail="Название не может быть пустым")

    # Validate category
    cat_id = body.category_id
    if not cat_id:
        cat = db.query(WorkCategory).filter(
            WorkCategory.account_id == user_id,
            WorkCategory.is_archived == False,  # noqa: E712
        ).first()
        cat_id = cat.category_id if cat else 1

    # Validate end_date >= start_date
    if body.end_date and body.start_date:
        if body.end_date < body.start_date:
            raise HTTPException(
                status_code=400,
                detail="Дата окончания не может быть раньше даты начала",
            )

    try:
        freq = body.freq
        event_id = CreateEventUseCase(db).execute(
            account_id=user_id,
            title=body.title,
            category_id=cat_id,
            description=body.description,
            freq=freq if freq else None,
            start_date=body.start_date_rule if freq else None,
            occ_start_date=body.start_date if not freq else None,
            occ_start_time=body.start_time,
            occ_end_date=body.end_date,
            occ_end_time=body.end_time,
            actor_user_id=user_id,
        )
    except EventValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Create default reminder if requested
    if body.reminder_offset and body.reminder_offset > 0:
        try:
            CreateDefaultReminderUseCase(db).execute(
                event_id=event_id,
                account_id=user_id,
                channel="ui",
                mode="offset",
                offset_minutes=body.reminder_offset,
                actor_user_id=user_id,
            )
        except EventValidationError:
            pass  # non-critical, event already created

    return {"id": event_id}


class UpdateOccurrenceRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    start_date: str | None = None
    start_time: str | None = None
    end_date: str | None = None
    category_id: int | None = None


@router.patch("/events/occurrences/{occurrence_id}")
def update_occurrence(
    occurrence_id: int,
    body: UpdateOccurrenceRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = get_user_id(request)
    occ = db.query(EventOccurrenceModel).filter(
        EventOccurrenceModel.id == occurrence_id,
        EventOccurrenceModel.account_id == user_id,
    ).first()
    if not occ:
        raise HTTPException(status_code=404, detail="Occurrence not found")
    evt = db.query(CalendarEventModel).filter(
        CalendarEventModel.event_id == occ.event_id,
    ).first()
    if not evt:
        raise HTTPException(status_code=404, detail="Event not found")

    fields = body.model_fields_set
    if "title" in fields and body.title is not None:
        evt.title = body.title.strip()
    if "description" in fields:
        evt.description = body.description or None
    if "category_id" in fields:
        evt.category_id = body.category_id
    if "start_date" in fields and body.start_date:
        occ.start_date = date.fromisoformat(body.start_date)
    if "start_time" in fields:
        occ.start_time = t_time.fromisoformat(body.start_time) if body.start_time else None
    if "end_date" in fields:
        occ.end_date = date.fromisoformat(body.end_date) if body.end_date else None

    db.commit()
    return {"ok": True}


@router.delete("/events/occurrences/{occurrence_id}", status_code=204)
def delete_occurrence(
    occurrence_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = get_user_id(request)
    occ = db.query(EventOccurrenceModel).filter(
        EventOccurrenceModel.id == occurrence_id,
        EventOccurrenceModel.account_id == user_id,
    ).first()
    if not occ:
        raise HTTPException(status_code=404, detail="Occurrence not found")
    occ.is_cancelled = True
    db.commit()


@router.post("/events/occurrences/{occurrence_id}/duplicate", status_code=201)
def duplicate_occurrence(
    occurrence_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = get_user_id(request)
    occ = db.query(EventOccurrenceModel).filter(
        EventOccurrenceModel.id == occurrence_id,
        EventOccurrenceModel.account_id == user_id,
    ).first()
    if not occ:
        raise HTTPException(status_code=404, detail="Occurrence not found")

    new_occ = EventOccurrenceModel(
        event_id=occ.event_id,
        account_id=user_id,
        start_date=occ.start_date + timedelta(days=1),
        start_time=occ.start_time,
        end_date=(occ.end_date + timedelta(days=1)) if occ.end_date else None,
        end_time=None,
        is_cancelled=False,
    )
    db.add(new_occ)
    db.commit()
    db.refresh(new_occ)
    return {"id": new_occ.id}


@router.post("/events/rebuild-projector")
def rebuild_projector(request: Request, db: Session = Depends(get_db)):
    """Re-run the events projector to fix missing occurrences."""
    user_id = get_user_id(request)
    from app.readmodels.projectors.events import EventsProjector
    from app.infrastructure.db.models import ProjectorCheckpoint
    # Reset checkpoint to 0 so projector reprocesses all events
    cp = db.query(ProjectorCheckpoint).filter(
        ProjectorCheckpoint.projector_name == "events",
        ProjectorCheckpoint.account_id == user_id,
    ).first()
    if cp:
        cp.last_event_id = 0
        db.commit()
    count = EventsProjector(db).run(user_id)
    return {"reprocessed": count}
