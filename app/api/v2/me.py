"""GET /api/v2/me — current authenticated user."""
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.infrastructure.db.session import get_db
from app.api.v2.deps import get_current_user
from app.infrastructure.db.models import User

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


@router.get("/me", response_model=UserMeResponse)
def get_me(request: Request, db: Session = Depends(get_db)):
    user: User = get_current_user(request, db)
    return UserMeResponse(
        id=user.id,
        email=user.email,
        theme=user.theme,
        is_admin=user.is_admin,
        onboarding_done=user.onboarding_done,
        enable_task_expense_link=user.enable_task_expense_link,
        enable_task_templates=user.enable_task_templates,
        enable_task_reschedule_reasons=user.enable_task_reschedule_reasons,
    )


@router.post("/me/onboarding-done")
def mark_onboarding_done(request: Request, db: Session = Depends(get_db)):
    user: User = get_current_user(request, db)
    user.onboarding_done = True
    db.commit()
    return {"ok": True}
