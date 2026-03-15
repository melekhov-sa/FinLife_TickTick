"""
GET  /api/v2/habits  — habit list with streaks and categories
POST /api/v2/habits  — create a habit (with recurrence rule)
"""
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.v2.deps import get_user_id
from app.infrastructure.db.models import HabitModel, WorkCategory
from app.infrastructure.db.session import get_db

router = APIRouter()

LEVEL_LABELS = {1: "Просто", 2: "Средне", 3: "Сложно"}


class HabitItem(BaseModel):
    habit_id: int
    title: str
    note: str | None
    level: int
    level_label: str
    category_id: int | None
    category_emoji: str | None
    category_title: str | None
    current_streak: int
    best_streak: int
    done_count_30d: int
    reminder_time: str | None


@router.get("/habits", response_model=list[HabitItem])
def get_habits(
    user_id: int = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    habits = (
        db.query(HabitModel)
        .filter(
            HabitModel.account_id == user_id,
            HabitModel.is_archived == False,
        )
        .order_by(HabitModel.current_streak.desc(), HabitModel.habit_id)
        .all()
    )

    # Load categories in one query
    cat_ids = {h.category_id for h in habits if h.category_id}
    cats: dict[int, WorkCategory] = {}
    if cat_ids:
        rows = db.query(WorkCategory).filter(WorkCategory.category_id.in_(cat_ids)).all()
        cats = {c.category_id: c for c in rows}

    result = []
    for h in habits:
        cat = cats.get(h.category_id) if h.category_id else None
        reminder_str = h.reminder_time.strftime("%H:%M") if h.reminder_time else None
        result.append(
            HabitItem(
                habit_id=h.habit_id,
                title=h.title,
                note=h.note,
                level=h.level,
                level_label=LEVEL_LABELS.get(h.level, ""),
                category_id=h.category_id,
                category_emoji=cat.emoji if cat else None,
                category_title=cat.title if cat else None,
                current_streak=h.current_streak,
                best_streak=h.best_streak,
                done_count_30d=h.done_count_30d,
                reminder_time=reminder_str,
            )
        )
    return result


class CreateHabitRequest(BaseModel):
    title: str
    freq: str = "DAILY"          # DAILY | WEEKLY | MONTHLY
    interval: int = 1
    start_date: str | None = None
    by_weekday: str | None = None  # comma-separated "0,1,4" for WEEKLY
    by_monthday: int | None = None  # 1..31 for MONTHLY
    level: int = 1
    category_id: int | None = None
    note: str | None = None
    reminder_time: str | None = None  # HH:MM


@router.post("/habits", status_code=201)
def create_habit(body: CreateHabitRequest, request: Request, db: Session = Depends(get_db)):
    from app.application.habits import CreateHabitUseCase, HabitValidationError
    user_id = get_user_id(request)
    start = body.start_date or date.today().isoformat()
    try:
        habit_id = CreateHabitUseCase(db).execute(
            account_id=user_id,
            title=body.title,
            freq=body.freq,
            interval=body.interval,
            start_date=start,
            by_weekday=body.by_weekday,
            by_monthday=body.by_monthday,
            level=body.level,
            category_id=body.category_id,
            note=body.note,
            reminder_time=body.reminder_time,
            actor_user_id=user_id,
        )
    except HabitValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"id": habit_id}
