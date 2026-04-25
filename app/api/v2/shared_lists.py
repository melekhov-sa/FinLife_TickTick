"""Shared Lists API — wishlist, giftlist, roadmap, trip with public sharing."""
from datetime import date
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.infrastructure.db.session import get_db
from app.api.v2.deps import get_user_id
from app.application.shared_lists import SharedListService
from app.infrastructure.db.models import User

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────────

class CreateListRequest(BaseModel):
    title: str
    list_type: str  # wishlist | giftlist | roadmap | trip
    description: str | None = None
    budget_amount: str | None = None   # decimal string, optional
    period_from: str | None = None     # ISO date string
    period_to: str | None = None       # ISO date string


class UpdateListRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    is_public: bool | None = None
    custom_statuses: list[dict] | None = None
    budget_amount: str | None = None
    period_from: str | None = None
    period_to: str | None = None


class CreatePlanItemRequest(BaseModel):
    title: str
    amount: str  # decimal string
    sort_order: int | None = None


class UpdatePlanItemRequest(BaseModel):
    title: str | None = None
    amount: str | None = None
    sort_order: int | None = None


class CreateGroupRequest(BaseModel):
    title: str
    color: str | None = None


class UpdateGroupRequest(BaseModel):
    title: str | None = None
    sort_order: int | None = None
    color: str | None = None


class CreateItemRequest(BaseModel):
    title: str
    group_id: int | None = None
    note: str | None = None
    url: str | None = None
    image_url: str | None = None
    price: float | None = None
    currency: str = "RUB"


class UpdateItemRequest(BaseModel):
    title: str | None = None
    group_id: int | None = None
    note: str | None = None
    url: str | None = None
    image_url: str | None = None
    price: float | None = None
    currency: str | None = None
    status: str | None = None
    sort_order: int | None = None


class ReorderRequest(BaseModel):
    ids: list[int]


class ReserveRequest(BaseModel):
    reserved_by: str


# ── Authenticated endpoints ──────────────────────────────────────────────────

@router.get("/lists")
def get_lists(request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    svc = SharedListService(db)
    return svc.get_lists(user_id)


@router.post("/lists")
def create_list(body: CreateListRequest, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    allowed_types = ("wishlist", "personal", "roadmap", "trip")
    if body.list_type not in allowed_types:
        raise HTTPException(400, "Invalid list_type")
    if body.list_type == "roadmap":
        user = db.query(User).filter(User.id == user_id).first()
        if not user or not user.is_admin:
            raise HTTPException(403, "Roadmap lists are admin-only")
    budget_amount = None
    if body.budget_amount is not None:
        try:
            budget_amount = Decimal(body.budget_amount)
        except InvalidOperation:
            raise HTTPException(400, "Invalid budget_amount")
    period_from = date.fromisoformat(body.period_from) if body.period_from else None
    period_to = date.fromisoformat(body.period_to) if body.period_to else None
    svc = SharedListService(db)
    return svc.create_list(
        user_id, body.title, body.list_type, body.description,
        budget_amount=budget_amount, period_from=period_from, period_to=period_to,
    )


@router.get("/lists/{list_id}")
def get_list(list_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    svc = SharedListService(db)
    result = svc.get_list(user_id, list_id)
    if not result:
        raise HTTPException(404, "List not found")
    return result


@router.patch("/lists/{list_id}")
def update_list(list_id: int, body: UpdateListRequest, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    svc = SharedListService(db)
    updates = body.model_dump(exclude_unset=True)
    # Convert string fields to proper types for trip fields
    if "budget_amount" in updates:
        raw = updates["budget_amount"]
        if raw is not None:
            try:
                updates["budget_amount"] = Decimal(raw)
            except InvalidOperation:
                raise HTTPException(400, "Invalid budget_amount")
    if "period_from" in updates:
        updates["period_from"] = date.fromisoformat(updates["period_from"]) if updates["period_from"] else None
    if "period_to" in updates:
        updates["period_to"] = date.fromisoformat(updates["period_to"]) if updates["period_to"] else None
    result = svc.update_list(user_id, list_id, **updates)
    if not result:
        raise HTTPException(404, "List not found")
    return result


@router.delete("/lists/{list_id}")
def delete_list(list_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    svc = SharedListService(db)
    if not svc.delete_list(user_id, list_id):
        raise HTTPException(404, "List not found")
    return {"ok": True}


# ── Groups ───────────────────────────────────────────────────────────────────

@router.post("/lists/{list_id}/groups")
def create_group(list_id: int, body: CreateGroupRequest, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    svc = SharedListService(db)
    result = svc.create_group(user_id, list_id, body.title, body.color)
    if not result:
        raise HTTPException(404, "List not found")
    return result


@router.patch("/lists/groups/{group_id}")
def update_group(group_id: int, body: UpdateGroupRequest, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    svc = SharedListService(db)
    updates = body.model_dump(exclude_unset=True)
    result = svc.update_group(user_id, group_id, **updates)
    if not result:
        raise HTTPException(404, "Group not found")
    return result


@router.delete("/lists/groups/{group_id}")
def delete_group(group_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    svc = SharedListService(db)
    if not svc.delete_group(user_id, group_id):
        raise HTTPException(404, "Group not found")
    return {"ok": True}


@router.post("/lists/{list_id}/groups/reorder")
def reorder_groups(list_id: int, body: ReorderRequest, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    svc = SharedListService(db)
    if not svc.reorder_groups(user_id, list_id, body.ids):
        raise HTTPException(404, "List not found")
    return {"ok": True}


# ── Items ────────────────────────────────────────────────────────────────────

@router.post("/lists/{list_id}/items")
def create_item(list_id: int, body: CreateItemRequest, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    svc = SharedListService(db)
    result = svc.create_item(user_id, list_id, body.title, **body.model_dump(exclude={"title"}))
    if not result:
        raise HTTPException(404, "List not found")
    return result


@router.patch("/lists/items/{item_id}")
def update_item(item_id: int, body: UpdateItemRequest, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    svc = SharedListService(db)
    updates = body.model_dump(exclude_unset=True)
    result = svc.update_item(user_id, item_id, **updates)
    if not result:
        raise HTTPException(404, "Item not found")
    return result


@router.delete("/lists/items/{item_id}")
def delete_item(item_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    svc = SharedListService(db)
    if not svc.delete_item(user_id, item_id):
        raise HTTPException(404, "Item not found")
    return {"ok": True}


@router.post("/lists/{list_id}/items/reorder")
def reorder_items(list_id: int, body: ReorderRequest, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    svc = SharedListService(db)
    if not svc.reorder_items(user_id, list_id, body.ids):
        raise HTTPException(404, "List not found")
    return {"ok": True}


# ── Plan items ───────────────────────────────────────────────────────────────

@router.get("/lists/{list_id}/plan-items")
def get_plan_items(list_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    svc = SharedListService(db)
    result = svc.get_plan_items(user_id, list_id)
    if result is None:
        raise HTTPException(404, "List not found")
    return result


@router.post("/lists/{list_id}/plan-items", status_code=201)
def create_plan_item(list_id: int, body: CreatePlanItemRequest, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    try:
        amount = Decimal(body.amount)
    except InvalidOperation:
        raise HTTPException(400, "Invalid amount")
    svc = SharedListService(db)
    result = svc.create_plan_item(user_id, list_id, body.title, amount, body.sort_order)
    if result is None:
        raise HTTPException(404, "List not found")
    return result


@router.patch("/lists/{list_id}/plan-items/{item_id}")
def update_plan_item(list_id: int, item_id: int, body: UpdatePlanItemRequest, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    updates = body.model_dump(exclude_unset=True)
    if "amount" in updates:
        try:
            updates["amount"] = Decimal(updates["amount"])
        except InvalidOperation:
            raise HTTPException(400, "Invalid amount")
    svc = SharedListService(db)
    result = svc.update_plan_item(user_id, list_id, item_id, **updates)
    if result is None:
        raise HTTPException(404, "Item not found")
    return result


@router.delete("/lists/{list_id}/plan-items/{item_id}")
def delete_plan_item(list_id: int, item_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    svc = SharedListService(db)
    if not svc.delete_plan_item(user_id, list_id, item_id):
        raise HTTPException(404, "Item not found")
    return {"ok": True}


# ── Summary ───────────────────────────────────────────────────────────────────

@router.get("/lists/{list_id}/summary")
def get_list_summary(list_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    svc = SharedListService(db)
    result = svc.get_summary(user_id, list_id)
    if result is None:
        raise HTTPException(404, "List not found")
    return result


# ── Public share endpoints (no auth) ─────────────────────────────────────────

@router.get("/share/{slug}")
def get_shared_list(slug: str, db: Session = Depends(get_db)):
    svc = SharedListService(db)
    result = svc.get_list_by_slug(slug)
    if not result:
        raise HTTPException(404, "List not found or not public")
    # Strip account_id from public response
    result.pop("account_id", None)
    return result


@router.post("/share/{slug}/items/{item_id}/reserve")
def reserve_item(slug: str, item_id: int, body: ReserveRequest, db: Session = Depends(get_db)):
    if not body.reserved_by.strip():
        raise HTTPException(400, "Name is required")
    svc = SharedListService(db)
    result = svc.reserve_item(slug, item_id, body.reserved_by)
    if not result:
        raise HTTPException(404, "Item not found or cannot be reserved")
    return result
