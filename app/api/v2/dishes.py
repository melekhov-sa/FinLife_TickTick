"""Dish catalog API — CRUD + ingredient management + instruction image upload."""
import os
import pathlib
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.infrastructure.db.session import get_db
from app.api.v2.deps import get_user_id
from app.infrastructure.db.models import DishModel, DishIngredientModel
from app.infrastructure.file_utils import detect_mime, user_upload_total_bytes
from app.config import get_settings

_PROJECT_ROOT = pathlib.Path(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
ALLOWED_IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_SIZE = 5 * 1024 * 1024

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────

class IngredientIn(BaseModel):
    ingredient_name: str
    quantity: str | None = None
    unit: str | None = None
    sort_order: int = 0


class IngredientOut(BaseModel):
    id: int
    ingredient_name: str
    quantity: str | None
    unit: str | None
    sort_order: int

    class Config:
        from_attributes = True


class DishCreate(BaseModel):
    name: str
    meal_types: str | None = None  # comma-separated: breakfast,lunch,dinner,snack
    instructions: str | None = None
    ingredients: list[IngredientIn] = []


class DishUpdate(BaseModel):
    name: str | None = None
    meal_types: str | None = None
    instructions: str | None = None


class DishOut(BaseModel):
    id: int
    name: str
    meal_types: str | None
    instructions: str | None
    ingredients: list[IngredientOut]

    class Config:
        from_attributes = True


# ── Helpers ────────────────────────────────────────────────────────────────────

def _uploads_dir() -> pathlib.Path:
    p = pathlib.Path(get_settings().UPLOADS_DIR)
    if not p.is_absolute():
        p = _PROJECT_ROOT / p
    return p


def _dish_or_404(dish_id: int, user_id: int, db: Session) -> DishModel:
    dish = db.query(DishModel).filter(DishModel.id == dish_id, DishModel.account_id == user_id).first()
    if not dish:
        raise HTTPException(404, "Dish not found")
    return dish


def _serialize_dish(dish: DishModel, db: Session) -> dict:
    ingredients = (
        db.query(DishIngredientModel)
        .filter(DishIngredientModel.dish_id == dish.id)
        .order_by(DishIngredientModel.sort_order, DishIngredientModel.id)
        .all()
    )
    return {
        "id": dish.id,
        "name": dish.name,
        "meal_types": dish.meal_types,
        "instructions": dish.instructions,
        "ingredients": [
            {
                "id": ing.id,
                "ingredient_name": ing.ingredient_name,
                "quantity": ing.quantity,
                "unit": ing.unit,
                "sort_order": ing.sort_order,
            }
            for ing in ingredients
        ],
    }


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/dishes")
def list_dishes(request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    dishes = (
        db.query(DishModel)
        .filter(DishModel.account_id == user_id)
        .order_by(DishModel.name)
        .all()
    )
    return [_serialize_dish(d, db) for d in dishes]


@router.post("/dishes", status_code=201)
def create_dish(body: DishCreate, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    dish = DishModel(
        account_id=user_id,
        name=body.name.strip(),
        meal_types=body.meal_types,
        instructions=body.instructions,
    )
    db.add(dish)
    db.flush()

    for i, ing in enumerate(body.ingredients):
        db.add(DishIngredientModel(
            dish_id=dish.id,
            ingredient_name=ing.ingredient_name.strip(),
            quantity=ing.quantity,
            unit=ing.unit,
            sort_order=ing.sort_order if ing.sort_order else i,
        ))

    db.commit()
    db.refresh(dish)
    return _serialize_dish(dish, db)


@router.get("/dishes/{dish_id}")
def get_dish(dish_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    dish = _dish_or_404(dish_id, user_id, db)
    return _serialize_dish(dish, db)


@router.patch("/dishes/{dish_id}")
def update_dish(dish_id: int, body: DishUpdate, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    dish = _dish_or_404(dish_id, user_id, db)
    updates = body.model_dump(exclude_unset=True)
    for k, v in updates.items():
        setattr(dish, k, v)
    dish.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(dish)
    return _serialize_dish(dish, db)


@router.delete("/dishes/{dish_id}", status_code=204)
def delete_dish(dish_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    dish = _dish_or_404(dish_id, user_id, db)
    db.delete(dish)
    db.commit()


@router.put("/dishes/{dish_id}/ingredients")
def replace_ingredients(dish_id: int, body: list[IngredientIn], request: Request, db: Session = Depends(get_db)):
    """Replace all ingredients for a dish."""
    user_id = get_user_id(request, db)
    _dish_or_404(dish_id, user_id, db)

    db.query(DishIngredientModel).filter(DishIngredientModel.dish_id == dish_id).delete()
    for i, ing in enumerate(body):
        db.add(DishIngredientModel(
            dish_id=dish_id,
            ingredient_name=ing.ingredient_name.strip(),
            quantity=ing.quantity,
            unit=ing.unit,
            sort_order=ing.sort_order if ing.sort_order else i,
        ))
    db.commit()

    dish = db.query(DishModel).filter(DishModel.id == dish_id).first()
    return _serialize_dish(dish, db)


@router.post("/dishes/{dish_id}/images")
def upload_dish_image(dish_id: int, request: Request, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload an image for use in dish instructions. Returns the URL to embed."""
    user_id = get_user_id(request, db)
    _dish_or_404(dish_id, user_id, db)

    ext = pathlib.Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported file type: {ext}")

    content = file.file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(400, "File too large (max 5 MB)")

    actual_mime = detect_mime(content)
    if actual_mime is not None and actual_mime not in ALLOWED_IMAGE_MIMES:
        raise HTTPException(400, f"File contents do not match an allowed image type ({actual_mime})")

    quota_bytes = get_settings().USER_UPLOAD_QUOTA_MB * 1024 * 1024
    current = user_upload_total_bytes(user_id, _uploads_dir())
    if current + len(content) > quota_bytes:
        raise HTTPException(400, f"Upload quota exceeded ({get_settings().USER_UPLOAD_QUOTA_MB} MB)")

    filename = f"{uuid.uuid4().hex[:16]}{ext}"
    save_dir = _uploads_dir() / str(user_id) / "dishes" / str(dish_id)
    save_dir.mkdir(parents=True, exist_ok=True)
    (save_dir / filename).write_bytes(content)

    url = f"/api/v2/dishes/{dish_id}/images/{filename}"
    return {"url": url}


@router.get("/dishes/{dish_id}/images/{filename}")
def serve_dish_image(dish_id: int, filename: str, db: Session = Depends(get_db)):
    """Serve dish instruction image. No auth required — UUID filenames are effectively private."""
    dish = db.query(DishModel).filter(DishModel.id == dish_id).first()
    if not dish:
        raise HTTPException(404, "Image not found")

    safe_name = pathlib.Path(filename).name
    filepath = _uploads_dir() / str(dish.account_id) / "dishes" / str(dish_id) / safe_name
    if not filepath.exists():
        raise HTTPException(404, "Image not found")

    ext = filepath.suffix.lower()
    media_type = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
    }.get(ext, "application/octet-stream")
    return FileResponse(str(filepath), media_type=media_type)
