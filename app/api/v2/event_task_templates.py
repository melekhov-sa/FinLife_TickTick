"""
API v2 — Event task templates
CRUD for per-event task templates that auto-generate tasks before/after occurrences.
"""
from __future__ import annotations

from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.api.v2.deps import get_user_id
from app.infrastructure.db.models import (
    CalendarEventModel,
    EventOccurrenceTask,
    EventTaskTemplate,
    TaskModel,
)
from app.infrastructure.db.session import get_db

router = APIRouter()

AUTO_COMPLETE_VALUES = {None, "end_of_day", "at_event_end"}


# ── Schemas ───────────────────────────────────────────────────────────────────

class EventTaskTemplateOut(BaseModel):
    id: int
    event_id: int
    title: str
    days_before: int
    reminder_offset_minutes: Optional[int]
    is_archived: bool
    is_after_event: bool
    minutes_after_end: Optional[int]
    auto_complete_mode: Optional[str]

    class Config:
        from_attributes = True


class CreateTemplateRequest(BaseModel):
    title: str
    days_before: int
    reminder_offset_minutes: Optional[int] = None
    is_after_event: bool = False
    minutes_after_end: Optional[int] = None
    auto_complete_mode: Optional[str] = None

    @field_validator("days_before")
    @classmethod
    def validate_days_before(cls, v: int) -> int:
        if v < 0:
            raise ValueError("days_before must be >= 0")
        return v

    @field_validator("auto_complete_mode")
    @classmethod
    def validate_auto_complete_mode(cls, v: Optional[str]) -> Optional[str]:
        if v not in AUTO_COMPLETE_VALUES:
            raise ValueError(f"auto_complete_mode must be one of: {AUTO_COMPLETE_VALUES}")
        return v

    @field_validator("minutes_after_end")
    @classmethod
    def validate_minutes_after_end(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v < 0:
            raise ValueError("minutes_after_end must be >= 0")
        return v


class UpdateTemplateRequest(BaseModel):
    title: Optional[str] = None
    days_before: Optional[int] = None
    reminder_offset_minutes: Optional[int] = None
    is_after_event: Optional[bool] = None
    minutes_after_end: Optional[int] = None
    auto_complete_mode: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_event_or_404(db: Session, event_id: int, account_id: int) -> CalendarEventModel:
    event = db.query(CalendarEventModel).filter(
        CalendarEventModel.event_id == event_id,
        CalendarEventModel.account_id == account_id,
    ).first()
    if not event:
        raise HTTPException(404, "Event not found")
    return event


def _get_template_or_404(
    db: Session, event_id: int, template_id: int, account_id: int
) -> EventTaskTemplate:
    tpl = db.query(EventTaskTemplate).filter(
        EventTaskTemplate.id == template_id,
        EventTaskTemplate.event_id == event_id,
        EventTaskTemplate.account_id == account_id,
    ).first()
    if not tpl:
        raise HTTPException(404, "Template not found")
    return tpl


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/events/{event_id}/task-templates", response_model=list[EventTaskTemplateOut])
def list_templates(
    event_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_user_id),
):
    _get_event_or_404(db, event_id, user_id)
    return (
        db.query(EventTaskTemplate)
        .filter(
            EventTaskTemplate.event_id == event_id,
            EventTaskTemplate.account_id == user_id,
            EventTaskTemplate.is_archived == False,
        )
        .order_by(EventTaskTemplate.is_after_event.asc(), EventTaskTemplate.days_before.desc())
        .all()
    )


@router.post("/events/{event_id}/task-templates", response_model=EventTaskTemplateOut, status_code=201)
def create_template(
    event_id: int,
    body: CreateTemplateRequest,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_user_id),
):
    _get_event_or_404(db, event_id, user_id)
    title = body.title.strip()
    if not title:
        raise HTTPException(400, "title is required")

    # auto_complete_mode only meaningful for before-event templates
    auto_complete_mode = body.auto_complete_mode if not body.is_after_event else None
    # minutes_after_end only meaningful for after-event templates
    minutes_after_end = body.minutes_after_end if body.is_after_event else None

    tpl = EventTaskTemplate(
        event_id=event_id,
        account_id=user_id,
        title=title,
        days_before=body.days_before,
        reminder_offset_minutes=body.reminder_offset_minutes,
        is_after_event=body.is_after_event,
        minutes_after_end=minutes_after_end,
        auto_complete_mode=auto_complete_mode,
    )
    db.add(tpl)
    db.commit()
    db.refresh(tpl)
    return tpl


@router.patch("/events/{event_id}/task-templates/{template_id}", response_model=EventTaskTemplateOut)
def update_template(
    event_id: int,
    template_id: int,
    body: UpdateTemplateRequest,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_user_id),
):
    tpl = _get_template_or_404(db, event_id, template_id, user_id)
    if body.title is not None:
        tpl.title = body.title.strip() or tpl.title
    if body.days_before is not None:
        tpl.days_before = body.days_before
    if "reminder_offset_minutes" in body.model_fields_set:
        tpl.reminder_offset_minutes = body.reminder_offset_minutes
    if body.is_after_event is not None:
        tpl.is_after_event = body.is_after_event
    if "minutes_after_end" in body.model_fields_set:
        tpl.minutes_after_end = body.minutes_after_end
    if "auto_complete_mode" in body.model_fields_set:
        if body.auto_complete_mode not in AUTO_COMPLETE_VALUES:
            raise HTTPException(400, "Invalid auto_complete_mode")
        tpl.auto_complete_mode = body.auto_complete_mode
    db.commit()
    db.refresh(tpl)
    return tpl


@router.delete("/events/{event_id}/task-templates/{template_id}", status_code=204)
def delete_template(
    event_id: int,
    template_id: int,
    archive_tasks: bool = Query(False),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_user_id),
):
    tpl = _get_template_or_404(db, event_id, template_id, user_id)

    if archive_tasks:
        links = db.query(EventOccurrenceTask).filter(
            EventOccurrenceTask.template_id == tpl.id
        ).all()
        task_ids = [lnk.task_id for lnk in links]
        if task_ids:
            db.query(TaskModel).filter(
                TaskModel.task_id.in_(task_ids),
                TaskModel.account_id == user_id,
            ).update({"status": "ARCHIVED"}, synchronize_session=False)

    tpl.is_archived = True
    db.commit()
