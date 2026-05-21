"""
API v2 — Event task templates
CRUD for per-event task templates that auto-generate tasks before occurrences.
"""
from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.v2.auth import get_current_user
from app.infrastructure.db.models import (
    CalendarEventModel,
    EventOccurrenceTask,
    EventTaskTemplate,
    TaskModel,
    User,
)
from app.infrastructure.db.session import get_db

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class EventTaskTemplateOut(BaseModel):
    id: int
    event_id: int
    title: str
    days_before: int
    reminder_offset_minutes: Optional[int]
    is_archived: bool

    class Config:
        from_attributes = True


class CreateTemplateRequest(BaseModel):
    title: str
    days_before: int
    reminder_offset_minutes: Optional[int] = None


class UpdateTemplateRequest(BaseModel):
    title: Optional[str] = None
    days_before: Optional[int] = None
    reminder_offset_minutes: Optional[int] = None


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
    user: User = Depends(get_current_user),
):
    _get_event_or_404(db, event_id, user.id)
    return (
        db.query(EventTaskTemplate)
        .filter(
            EventTaskTemplate.event_id == event_id,
            EventTaskTemplate.account_id == user.id,
            EventTaskTemplate.is_archived == False,
        )
        .order_by(EventTaskTemplate.days_before.desc())
        .all()
    )


@router.post("/events/{event_id}/task-templates", response_model=EventTaskTemplateOut, status_code=201)
def create_template(
    event_id: int,
    body: CreateTemplateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_event_or_404(db, event_id, user.id)
    title = body.title.strip()
    if not title:
        raise HTTPException(400, "title is required")
    if body.days_before < 0:
        raise HTTPException(400, "days_before must be >= 0")

    tpl = EventTaskTemplate(
        event_id=event_id,
        account_id=user.id,
        title=title,
        days_before=body.days_before,
        reminder_offset_minutes=body.reminder_offset_minutes,
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
    user: User = Depends(get_current_user),
):
    tpl = _get_template_or_404(db, event_id, template_id, user.id)
    if body.title is not None:
        tpl.title = body.title.strip() or tpl.title
    if body.days_before is not None:
        tpl.days_before = body.days_before
    if "reminder_offset_minutes" in body.model_fields_set:
        tpl.reminder_offset_minutes = body.reminder_offset_minutes
    db.commit()
    db.refresh(tpl)
    return tpl


@router.delete("/events/{event_id}/task-templates/{template_id}", status_code=204)
def delete_template(
    event_id: int,
    template_id: int,
    archive_tasks: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    tpl = _get_template_or_404(db, event_id, template_id, user.id)

    if archive_tasks:
        links = db.query(EventOccurrenceTask).filter(
            EventOccurrenceTask.template_id == tpl.id
        ).all()
        task_ids = [l.task_id for l in links]
        if task_ids:
            db.query(TaskModel).filter(
                TaskModel.task_id.in_(task_ids),
                TaskModel.account_id == user.id,
            ).update({"status": "ARCHIVED"}, synchronize_session=False)

    tpl.is_archived = True
    db.commit()
