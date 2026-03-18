"""
GET    /api/v2/habits                            — habit list (with today status + 14-day history)
POST   /api/v2/habits                            — create habit
POST   /api/v2/habits/{habit_id}/complete-today  — mark today as done
POST   /api/v2/habits/{habit_id}/skip-today      — skip today (SKIPPED status)
PATCH  /api/v2/habits/{habit_id}                 — update habit fields
DELETE /api/v2/habits/{habit_id}                 — archive habit
POST   /api/v2/habits/occurrences/{id}/complete  — complete specific occurrence
"""
from datetime import date, timedelta
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.v2.deps import get_user_id
from app.infrastructure.db.models import HabitModel, WorkCategory, HabitOccurrence
from app.infrastructure.db.session import get_db

router = APIRouter()

LEVEL_LABELS = {1: "Просто", 2: "Средне", 3: "Сложно"}
HISTORY_DAYS = 14


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
    done_today: bool
    recent_days: list[bool]   # last 14 days, oldest first


@router.get("/habits", response_model=list[HabitItem])
def get_habits(
    user_id: int = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    today = date.today()
    history_start = today - timedelta(days=HISTORY_DAYS - 1)

    habits = (
        db.query(HabitModel)
        .filter(
            HabitModel.account_id == user_id,
            HabitModel.is_archived == False,  # noqa: E712
        )
        .order_by(HabitModel.current_streak.desc(), HabitModel.habit_id)
        .all()
    )

    # Load categories
    cat_ids = {h.category_id for h in habits if h.category_id}
    cats: dict[int, WorkCategory] = {}
    if cat_ids:
        rows = db.query(WorkCategory).filter(WorkCategory.category_id.in_(cat_ids)).all()
        cats = {c.category_id: c for c in rows}

    # Load occurrences for last 14 days (all habits at once)
    habit_ids = [h.habit_id for h in habits]
    occ_by_habit: dict[int, dict[date, str]] = defaultdict(dict)
    if habit_ids:
        occs = (
            db.query(HabitOccurrence)
            .filter(
                HabitOccurrence.account_id == user_id,
                HabitOccurrence.habit_id.in_(habit_ids),
                HabitOccurrence.scheduled_date >= history_start,
                HabitOccurrence.scheduled_date <= today,
            )
            .all()
        )
        for occ in occs:
            occ_by_habit[occ.habit_id][occ.scheduled_date] = occ.status

    result = []
    for h in habits:
        cat = cats.get(h.category_id) if h.category_id else None
        reminder_str = h.reminder_time.strftime("%H:%M") if h.reminder_time else None

        # done_today: today's occurrence is DONE
        today_status = occ_by_habit[h.habit_id].get(today)
        done_today = today_status == "DONE"

        # recent_days: last 14 days, oldest first
        recent_days = []
        for i in range(HISTORY_DAYS - 1, -1, -1):
            d = today - timedelta(days=i)
            recent_days.append(occ_by_habit[h.habit_id].get(d) == "DONE")

        result.append(HabitItem(
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
            done_today=done_today,
            recent_days=recent_days,
        ))
    return result


def _get_or_create_today_occurrence(
    habit_id: int, user_id: int, db: Session
) -> HabitOccurrence:
    today = date.today()
    occ = db.query(HabitOccurrence).filter(
        HabitOccurrence.habit_id == habit_id,
        HabitOccurrence.account_id == user_id,
        HabitOccurrence.scheduled_date == today,
    ).first()
    if not occ:
        occ = HabitOccurrence(
            account_id=user_id,
            habit_id=habit_id,
            scheduled_date=today,
            status="ACTIVE",
        )
        db.add(occ)
        db.flush()
    return occ


@router.post("/habits/{habit_id}/complete-today")
def complete_habit_today(habit_id: int, request: Request, db: Session = Depends(get_db)):
    from app.application.habits import CompleteHabitOccurrenceUseCase, HabitValidationError
    user_id = get_user_id(request)
    # Verify habit belongs to user
    habit = db.query(HabitModel).filter(
        HabitModel.habit_id == habit_id, HabitModel.account_id == user_id,
    ).first()
    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")
    occ = _get_or_create_today_occurrence(habit_id, user_id, db)
    if occ.status == "DONE":
        return {"ok": True, "already_done": True}
    try:
        CompleteHabitOccurrenceUseCase(db).execute(occ.id, user_id, actor_user_id=user_id)
    except (HabitValidationError, Exception) as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True}


@router.post("/habits/{habit_id}/skip-today")
def skip_habit_today(habit_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request)
    habit = db.query(HabitModel).filter(
        HabitModel.habit_id == habit_id, HabitModel.account_id == user_id,
    ).first()
    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")
    occ = _get_or_create_today_occurrence(habit_id, user_id, db)
    if occ.status != "DONE":
        occ.status = "SKIPPED"
        db.commit()
    return {"ok": True}


class UpdateHabitRequest(BaseModel):
    title: str | None = None
    note: str | None = None
    level: int | None = None
    category_id: int | None = None
    reminder_time: str | None = None  # "HH:MM" or "" to clear


@router.patch("/habits/{habit_id}")
def update_habit(habit_id: int, body: UpdateHabitRequest, request: Request, db: Session = Depends(get_db)):
    from datetime import time as t_time
    user_id = get_user_id(request)
    habit = db.query(HabitModel).filter(
        HabitModel.habit_id == habit_id, HabitModel.account_id == user_id,
    ).first()
    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")

    fields = body.model_fields_set
    if "title" in fields and body.title:
        habit.title = body.title.strip()
    if "note" in fields:
        habit.note = body.note or None
    if "level" in fields and body.level:
        habit.level = body.level
    if "category_id" in fields:
        habit.category_id = body.category_id
    if "reminder_time" in fields:
        habit.reminder_time = t_time.fromisoformat(body.reminder_time) if body.reminder_time else None

    db.commit()
    return {"ok": True}


@router.delete("/habits/{habit_id}", status_code=204)
def archive_habit(habit_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request)
    habit = db.query(HabitModel).filter(
        HabitModel.habit_id == habit_id, HabitModel.account_id == user_id,
    ).first()
    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")
    habit.is_archived = True
    db.commit()


class CreateHabitRequest(BaseModel):
    title: str
    freq: str = "DAILY"
    interval: int = 1
    start_date: str | None = None
    active_until: str | None = None
    by_weekday: str | None = None
    by_monthday: int | None = None
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
            active_until=body.active_until,
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


@router.post("/habits/occurrences/{occurrence_id}/complete")
def complete_habit_occurrence(occurrence_id: int, request: Request, db: Session = Depends(get_db)):
    from app.application.habits import CompleteHabitOccurrenceUseCase, HabitValidationError
    user_id = get_user_id(request)
    try:
        CompleteHabitOccurrenceUseCase(db).execute(occurrence_id, user_id, actor_user_id=user_id)
    except (HabitValidationError, Exception) as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True}


@router.post("/task-occurrences/{occurrence_id}/complete")
def complete_task_occurrence(occurrence_id: int, request: Request, db: Session = Depends(get_db)):
    from app.application.task_templates import CompleteTaskOccurrenceUseCase, TaskTemplateValidationError
    user_id = get_user_id(request)
    try:
        CompleteTaskOccurrenceUseCase(db).execute(
            occurrence_id=occurrence_id, account_id=user_id, actor_user_id=user_id
        )
    except (TaskTemplateValidationError, Exception) as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True}
