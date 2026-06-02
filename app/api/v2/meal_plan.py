"""GET/POST/DELETE /api/v2/meal-plan — weekly meal planner."""
from datetime import date
from decimal import Decimal

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
    dish_id: int | None = None

    class Config:
        from_attributes = True


class MealEntryCreate(BaseModel):
    week_start: date
    day_of_week: int
    meal_slot: str
    dish_name: str
    dish_id: int | None = None


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
        existing.dish_id = body.dish_id
        db.commit()
        db.refresh(existing)
        return existing

    entry = MealPlanEntryModel(
        account_id=user_id,
        week_start=body.week_start,
        day_of_week=body.day_of_week,
        meal_slot=body.meal_slot,
        dish_name=body.dish_name,
        dish_id=body.dish_id,
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


class ToListRequest(BaseModel):
    week_start: date
    list_title: str | None = None


@router.post("/meal-plan/to-list", status_code=201)
def create_shopping_list_from_week(body: ToListRequest, request: Request, db: Session = Depends(get_db)):
    """Aggregate all ingredients from dishes planned for a week and create a shopping list."""
    from app.infrastructure.db.models import MealPlanEntryModel, DishIngredientModel, DishModel
    from app.application.shared_lists import SharedListService

    user_id = get_user_id(request, db)

    entries = (
        db.query(MealPlanEntryModel)
        .filter(
            MealPlanEntryModel.account_id == user_id,
            MealPlanEntryModel.week_start == body.week_start,
            MealPlanEntryModel.dish_id.isnot(None),
        )
        .all()
    )

    if not entries:
        raise HTTPException(400, "No dishes with catalog links found for this week")

    # Gather dish_ids (unique)
    dish_ids = list({e.dish_id for e in entries if e.dish_id})

    # Fetch all ingredients
    ingredients = (
        db.query(DishIngredientModel)
        .filter(DishIngredientModel.dish_id.in_(dish_ids))
        .order_by(DishIngredientModel.dish_id, DishIngredientModel.sort_order)
        .all()
    )

    if not ingredients:
        raise HTTPException(400, "Selected dishes have no ingredients")

    week_label = body.week_start.strftime("%d.%m.%Y")
    title = body.list_title or f"Покупки на неделю {week_label}"

    svc = SharedListService(db)
    lst = svc.create_list(user_id, title, "shopping", description=None)

    # Add each ingredient as a list item
    for i, ing in enumerate(ingredients):
        dish = db.query(DishModel).filter(DishModel.id == ing.dish_id).first()
        note = f"Блюдо: {dish.name}" if dish else None
        qty_label = ""
        if ing.quantity:
            qty_label = f" — {ing.quantity}"
            if ing.unit:
                qty_label += f" {ing.unit}"
        svc.create_item(
            user_id, lst["id"],
            title=f"{ing.ingredient_name}{qty_label}",
            note=note,
        )

    return lst
