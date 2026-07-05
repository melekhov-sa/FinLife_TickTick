"""GET /api/v2/me — current authenticated user."""
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session

from app.infrastructure.db.session import get_db
from app.api.v2.deps import get_current_user
from app.infrastructure.db.models import (
    User, EventOccurrenceModel, CalendarEventModel, WorkCategory,
)
from app.config import get_settings
from app.application.app_config import get_openai_key

router = APIRouter()


class UserMeResponse(BaseModel):
    id: int
    email: str
    theme: str | None
    is_admin: bool
    onboarding_done: bool
    enable_task_expense_link: bool
    enable_task_templates: bool
    enable_task_reschedule_reasons: bool
    ai_digest_enabled: bool
    ai_digest_available: bool
    vacation: bool = False
    vacation_end: str | None = None


def _vacation_today(db: Session, account_id: int) -> tuple[bool, str | None]:
    """Today is a vacation day if an event in category «Отпуск» covers it."""
    today = datetime.now(ZoneInfo(get_settings().TIMEZONE)).date()
    rows = (
        db.query(EventOccurrenceModel, WorkCategory)
        .join(CalendarEventModel, CalendarEventModel.event_id == EventOccurrenceModel.event_id)
        .outerjoin(WorkCategory, WorkCategory.category_id == CalendarEventModel.category_id)
        .filter(
            EventOccurrenceModel.account_id == account_id,
            EventOccurrenceModel.is_cancelled == False,  # noqa: E712
            CalendarEventModel.is_active == True,  # noqa: E712
            or_(
                EventOccurrenceModel.start_date == today,
                and_(
                    EventOccurrenceModel.start_date <= today,
                    EventOccurrenceModel.end_date != None,  # noqa: E711
                    EventOccurrenceModel.end_date >= today,
                ),
            ),
        )
        .all()
    )
    for occ, cat in rows:
        if cat and (cat.title or "").strip().lower() == "отпуск":
            end = occ.end_date or occ.start_date
            return True, end.isoformat()
    return False, None


@router.get("/me", response_model=UserMeResponse)
def get_me(request: Request, db: Session = Depends(get_db)):
    user: User = get_current_user(request, db)
    vacation, vacation_end = _vacation_today(db, user.id)
    return UserMeResponse(
        id=user.id,
        email=user.email,
        theme=user.theme,
        is_admin=user.is_admin,
        onboarding_done=user.onboarding_done,
        enable_task_expense_link=user.enable_task_expense_link,
        enable_task_templates=user.enable_task_templates,
        enable_task_reschedule_reasons=user.enable_task_reschedule_reasons,
        ai_digest_enabled=user.ai_digest_enabled,
        ai_digest_available=bool(get_openai_key(db)),
        vacation=vacation,
        vacation_end=vacation_end,
    )


@router.post("/me/onboarding-done")
def mark_onboarding_done(request: Request, db: Session = Depends(get_db)):
    user: User = get_current_user(request, db)
    user.onboarding_done = True
    db.commit()
    return {"ok": True}


class UpdateAiDigestRequest(BaseModel):
    enabled: bool


@router.patch("/me/ai-digest")
def update_ai_digest(body: UpdateAiDigestRequest, request: Request, db: Session = Depends(get_db)):
    user: User = get_current_user(request, db)
    user.ai_digest_enabled = body.enabled
    db.commit()
    return {"ok": True, "ai_digest_enabled": user.ai_digest_enabled}
