"""GET/POST/DELETE /api/v2/meal-plan — weekly meal planner."""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.infrastructure.db.session import get_db
from app.api.v2.deps import get_user_id

router = APIRouter()


class MealEntryOut(BaseModel):
    id: int
    week_start: date
    day_of_week: int
    meal_slot: str
    dish_name: str

    class Config:
        from_attributes = True


class MealEntryCreate(BaseModel):
    week_start: date
    day_of_week: int
    meal_slot: str
    dish_name: str


@router.get("/meal-plan", response_model=list[MealEntryOut])
def get_week(request: Request, week: date, db: Session = Depends(get_db)):
    from app.infrastructure.db.models import MealPlanEntryModel
    user_id = get_user_id(request, db)
    return (
        db.query(MealPlanEntryModel)
        .filter(MealPlanEntryModel.account_id == user_id, MealPlanEntryModel.week_start == week)
        .order_by(MealPlanEntryModel.day_of_week, MealPlanEntryModel.meal_slot)
        .all()
    )


@router.post("/meal-plan/entries", response_model=MealEntryOut, status_code=201)
def upsert_entry(body: MealEntryCreate, request: Request, db: Session = Depends(get_db)):
    from app.infrastructure.db.models import MealPlanEntryModel
    user_id = get_user_id(request, db)

    existing = (
        db.query(MealPlanEntryModel)
        .filter(
            MealPlanEntryModel.account_id == user_id,
            MealPlanEntryModel.week_start == body.week_start,
            MealPlanEntryModel.day_of_week == body.day_of_week,
            MealPlanEntryModel.meal_slot == body.meal_slot,
        )
        .first()
    )

    if existing:
        existing.dish_name = body.dish_name
        db.commit()
        db.refresh(existing)
        return existing

    entry = MealPlanEntryModel(
        account_id=user_id,
        week_start=body.week_start,
        day_of_week=body.day_of_week,
        meal_slot=body.meal_slot,
        dish_name=body.dish_name,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/meal-plan/entries/{entry_id}", status_code=204)
def delete_entry(entry_id: int, request: Request, db: Session = Depends(get_db)):
    from app.infrastructure.db.models import MealPlanEntryModel
    user_id = get_user_id(request, db)

    entry = db.query(MealPlanEntryModel).filter(
        MealPlanEntryModel.id == entry_id, MealPlanEntryModel.account_id == user_id
    ).first()
    if not entry:
        raise HTTPException(status_code=404)

    db.delete(entry)
    db.commit()
