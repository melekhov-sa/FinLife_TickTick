"""GET/POST/PATCH/DELETE /api/v2/collection — collectibles tracker."""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from sqlalchemy import func, text
from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.infrastructure.db.session import get_db
from app.infrastructure.db.models import (
    CollectionCategory, CollectionItem, CollectionPriceHistory,
    PokemonCard, WalletBalance,
)
from app.api.v2.deps import get_user_id

router = APIRouter(prefix="/collection", tags=["collection"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class CategoryOut(BaseModel):
    id: int
    name: str
    emoji: Optional[str]
    tracking_type: str
    sort_order: int
    item_count: int
    total_value: int

    class Config:
        from_attributes = True


class CategoryCreate(BaseModel):
    name: str
    emoji: Optional[str] = None
    tracking_type: str = "name"   # serial | name | pokemon
    sort_order: int = 0


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    emoji: Optional[str] = None
    sort_order: Optional[int] = None


class ItemOut(BaseModel):
    id: int
    category_id: int
    name: Optional[str]
    serial_number: Optional[str]
    denomination: Optional[str]
    country: Optional[str]
    issue_year: Optional[int]
    series: Optional[str]
    pokemon_card_id: Optional[str]
    pokemon_set_name: Optional[str]
    pokemon_card_number: Optional[str]
    pokemon_rarity: Optional[str]
    pokemon_image_url: Optional[str]
    acquisition_date: Optional[date]
    acquisition_price: int
    current_value: int
    roi_pct: Optional[float]
    comment: Optional[str]
    sort_order: int

    class Config:
        from_attributes = True


class ItemCreate(BaseModel):
    category_id: int
    name: Optional[str] = None
    serial_number: Optional[str] = None
    denomination: Optional[str] = None
    country: Optional[str] = None
    issue_year: Optional[int] = None
    series: Optional[str] = None
    pokemon_card_id: Optional[str] = None
    pokemon_set_name: Optional[str] = None
    pokemon_card_number: Optional[str] = None
    pokemon_rarity: Optional[str] = None
    pokemon_image_url: Optional[str] = None
    acquisition_date: Optional[date] = None
    acquisition_price: int = 0
    current_value: int = 0
    comment: Optional[str] = None
    sort_order: int = 0


class ItemUpdate(BaseModel):
    name: Optional[str] = None
    serial_number: Optional[str] = None
    denomination: Optional[str] = None
    country: Optional[str] = None
    issue_year: Optional[int] = None
    series: Optional[str] = None
    acquisition_date: Optional[date] = None
    acquisition_price: Optional[int] = None
    current_value: Optional[int] = None
    comment: Optional[str] = None
    sort_order: Optional[int] = None


class PriceHistoryOut(BaseModel):
    id: int
    valued_at: date
    value: int
    note: Optional[str]


class ActualizeItem(BaseModel):
    item_id: int
    new_value: int
    note: Optional[str] = None


class ActualizeRequest(BaseModel):
    items: list[ActualizeItem]
    valued_at: Optional[date] = None


class PokemonCardOut(BaseModel):
    id: str
    name: str
    set_id: str
    set_name: str
    number: str
    rarity: Optional[str]
    supertype: Optional[str]
    image_url_small: Optional[str]
    image_url_large: Optional[str]

    class Config:
        from_attributes = True


class CollectionSummary(BaseModel):
    total_acquisition: int
    total_current_value: int
    total_roi_pct: Optional[float]
    item_count: int
    wallet_id: Optional[int]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _roi(acquisition: int, current: int) -> Optional[float]:
    if acquisition == 0:
        return None
    return round((current - acquisition) / acquisition * 100, 1)


def _item_out(item: CollectionItem) -> ItemOut:
    acq = int(item.acquisition_price)
    cur = int(item.current_value)
    return ItemOut(
        id=item.id,
        category_id=item.category_id,
        name=item.name,
        serial_number=item.serial_number,
        denomination=item.denomination,
        country=item.country,
        issue_year=item.issue_year,
        series=item.series,
        pokemon_card_id=item.pokemon_card_id,
        pokemon_set_name=item.pokemon_set_name,
        pokemon_card_number=item.pokemon_card_number,
        pokemon_rarity=item.pokemon_rarity,
        pokemon_image_url=item.pokemon_image_url,
        acquisition_date=item.acquisition_date,
        acquisition_price=acq,
        current_value=cur,
        roi_pct=_roi(acq, cur),
        comment=item.comment,
        sort_order=item.sort_order,
    )


def _sync_wallet_balance(db: Session, account_id: int) -> None:
    """Пересчитать баланс кошелька COLLECTION по сумме current_value предметов."""
    total = db.query(func.coalesce(func.sum(CollectionItem.current_value), 0)).filter(
        CollectionItem.account_id == account_id
    ).scalar() or Decimal("0")

    wallet = db.query(WalletBalance).filter(
        WalletBalance.account_id == account_id,
        WalletBalance.wallet_type == "COLLECTION",
        WalletBalance.is_archived == False,
    ).first()

    if wallet:
        wallet.balance = total
        wallet.updated_at = datetime.utcnow()
        db.flush()


# ── Categories ────────────────────────────────────────────────────────────────

@router.get("/categories", response_model=list[CategoryOut])
def list_categories(user_id: int = Depends(get_user_id), db: Session = Depends(get_db)):
    cats = db.query(CollectionCategory).filter(
        CollectionCategory.account_id == user_id
    ).order_by(CollectionCategory.sort_order, CollectionCategory.id).all()

    result = []
    for cat in cats:
        count = db.query(func.count(CollectionItem.id)).filter(
            CollectionItem.category_id == cat.id
        ).scalar() or 0
        total = db.query(func.coalesce(func.sum(CollectionItem.current_value), 0)).filter(
            CollectionItem.category_id == cat.id
        ).scalar() or 0
        result.append(CategoryOut(
            id=cat.id, name=cat.name, emoji=cat.emoji,
            tracking_type=cat.tracking_type, sort_order=cat.sort_order,
            item_count=count, total_value=int(total),
        ))
    return result


@router.post("/categories", response_model=CategoryOut, status_code=201)
def create_category(body: CategoryCreate, user_id: int = Depends(get_user_id), db: Session = Depends(get_db)):
    cat = CollectionCategory(
        account_id=user_id, name=body.name, emoji=body.emoji,
        tracking_type=body.tracking_type, sort_order=body.sort_order,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return CategoryOut(id=cat.id, name=cat.name, emoji=cat.emoji,
                       tracking_type=cat.tracking_type, sort_order=cat.sort_order,
                       item_count=0, total_value=0)


@router.patch("/categories/{category_id}", response_model=CategoryOut)
def update_category(category_id: int, body: CategoryUpdate,
                    user_id: int = Depends(get_user_id), db: Session = Depends(get_db)):
    cat = db.query(CollectionCategory).filter(
        CollectionCategory.id == category_id,
        CollectionCategory.account_id == user_id,
    ).first()
    if not cat:
        raise HTTPException(404)
    if body.name is not None:
        cat.name = body.name
    if body.emoji is not None:
        cat.emoji = body.emoji
    if body.sort_order is not None:
        cat.sort_order = body.sort_order
    db.commit()
    count = db.query(func.count(CollectionItem.id)).filter(CollectionItem.category_id == cat.id).scalar() or 0
    total = db.query(func.coalesce(func.sum(CollectionItem.current_value), 0)).filter(CollectionItem.category_id == cat.id).scalar() or 0
    return CategoryOut(id=cat.id, name=cat.name, emoji=cat.emoji,
                       tracking_type=cat.tracking_type, sort_order=cat.sort_order,
                       item_count=count, total_value=int(total))


@router.delete("/categories/{category_id}", status_code=204)
def delete_category(category_id: int, user_id: int = Depends(get_user_id), db: Session = Depends(get_db)):
    cat = db.query(CollectionCategory).filter(
        CollectionCategory.id == category_id,
        CollectionCategory.account_id == user_id,
    ).first()
    if not cat:
        raise HTTPException(404)
    db.delete(cat)
    db.commit()
    _sync_wallet_balance(db, user_id)
    db.commit()


# ── Items ─────────────────────────────────────────────────────────────────────

@router.get("/items", response_model=list[ItemOut])
def list_items(category_id: Optional[int] = None, q: Optional[str] = None,
               user_id: int = Depends(get_user_id), db: Session = Depends(get_db)):
    query = db.query(CollectionItem).filter(CollectionItem.account_id == user_id)
    if category_id:
        query = query.filter(CollectionItem.category_id == category_id)
    if q:
        like = f"%{q.lower()}%"
        query = query.filter(
            func.lower(CollectionItem.name).like(like) |
            func.lower(CollectionItem.serial_number).like(like) |
            func.lower(CollectionItem.pokemon_card_number).like(like) |
            func.lower(CollectionItem.denomination).like(like) |
            func.lower(CollectionItem.comment).like(like)
        )
    items = query.order_by(CollectionItem.sort_order, CollectionItem.id).all()
    return [_item_out(i) for i in items]


@router.post("/items", response_model=ItemOut, status_code=201)
def create_item(body: ItemCreate, user_id: int = Depends(get_user_id), db: Session = Depends(get_db)):
    cat = db.query(CollectionCategory).filter(
        CollectionCategory.id == body.category_id,
        CollectionCategory.account_id == user_id,
    ).first()
    if not cat:
        raise HTTPException(404, "Category not found")

    item = CollectionItem(
        account_id=user_id,
        category_id=body.category_id,
        name=body.name,
        serial_number=body.serial_number,
        denomination=body.denomination,
        country=body.country,
        issue_year=body.issue_year,
        series=body.series,
        pokemon_card_id=body.pokemon_card_id,
        pokemon_set_name=body.pokemon_set_name,
        pokemon_card_number=body.pokemon_card_number,
        pokemon_rarity=body.pokemon_rarity,
        pokemon_image_url=body.pokemon_image_url,
        acquisition_date=body.acquisition_date,
        acquisition_price=Decimal(body.acquisition_price),
        current_value=Decimal(body.current_value),
        comment=body.comment,
        sort_order=body.sort_order,
    )
    db.add(item)
    db.flush()

    # Save initial price to history if non-zero
    if body.current_value > 0:
        db.add(CollectionPriceHistory(
            item_id=item.id, account_id=user_id,
            valued_at=date.today(), value=Decimal(body.current_value),
        ))

    db.commit()
    db.refresh(item)
    _sync_wallet_balance(db, user_id)
    db.commit()
    return _item_out(item)


@router.patch("/items/{item_id}", response_model=ItemOut)
def update_item(item_id: int, body: ItemUpdate,
                user_id: int = Depends(get_user_id), db: Session = Depends(get_db)):
    item = db.query(CollectionItem).filter(
        CollectionItem.id == item_id,
        CollectionItem.account_id == user_id,
    ).first()
    if not item:
        raise HTTPException(404)

    for field in ("name", "serial_number", "denomination", "country", "issue_year",
                  "series", "acquisition_date", "comment", "sort_order"):
        val = getattr(body, field)
        if val is not None:
            setattr(item, field, val)
    if body.acquisition_price is not None:
        item.acquisition_price = Decimal(body.acquisition_price)
    if body.current_value is not None:
        item.current_value = Decimal(body.current_value)

    db.commit()
    db.refresh(item)
    _sync_wallet_balance(db, user_id)
    db.commit()
    return _item_out(item)


@router.delete("/items/{item_id}", status_code=204)
def delete_item(item_id: int, user_id: int = Depends(get_user_id), db: Session = Depends(get_db)):
    item = db.query(CollectionItem).filter(
        CollectionItem.id == item_id,
        CollectionItem.account_id == user_id,
    ).first()
    if not item:
        raise HTTPException(404)
    db.delete(item)
    db.commit()
    _sync_wallet_balance(db, user_id)
    db.commit()


# ── Price history ─────────────────────────────────────────────────────────────

@router.get("/items/{item_id}/price-history", response_model=list[PriceHistoryOut])
def get_price_history(item_id: int, user_id: int = Depends(get_user_id), db: Session = Depends(get_db)):
    item = db.query(CollectionItem).filter(
        CollectionItem.id == item_id,
        CollectionItem.account_id == user_id,
    ).first()
    if not item:
        raise HTTPException(404)
    rows = db.query(CollectionPriceHistory).filter(
        CollectionPriceHistory.item_id == item_id
    ).order_by(CollectionPriceHistory.valued_at.desc()).all()
    return [PriceHistoryOut(id=r.id, valued_at=r.valued_at, value=int(r.value), note=r.note) for r in rows]


# ── Bulk price actualization ──────────────────────────────────────────────────

@router.post("/actualize-prices", status_code=200)
def actualize_prices(body: ActualizeRequest,
                     user_id: int = Depends(get_user_id), db: Session = Depends(get_db)):
    valued_at = body.valued_at or date.today()
    updated = 0

    for entry in body.items:
        item = db.query(CollectionItem).filter(
            CollectionItem.id == entry.item_id,
            CollectionItem.account_id == user_id,
        ).first()
        if not item:
            continue

        old_val = int(item.current_value)
        new_val = entry.new_value

        if old_val == new_val:
            continue

        item.current_value = Decimal(new_val)
        db.add(CollectionPriceHistory(
            item_id=item.id, account_id=user_id,
            valued_at=valued_at, value=Decimal(new_val), note=entry.note,
        ))
        updated += 1

    db.flush()
    _sync_wallet_balance(db, user_id)
    db.commit()
    return {"updated": updated}


# ── Summary ───────────────────────────────────────────────────────────────────

@router.get("/summary", response_model=CollectionSummary)
def get_summary(user_id: int = Depends(get_user_id), db: Session = Depends(get_db)):
    row = db.query(
        func.coalesce(func.sum(CollectionItem.acquisition_price), 0).label("acq"),
        func.coalesce(func.sum(CollectionItem.current_value), 0).label("cur"),
        func.count(CollectionItem.id).label("cnt"),
    ).filter(CollectionItem.account_id == user_id).first()

    acq = int(row.acq)
    cur = int(row.cur)

    wallet = db.query(WalletBalance).filter(
        WalletBalance.account_id == user_id,
        WalletBalance.wallet_type == "COLLECTION",
        WalletBalance.is_archived == False,
    ).first()

    return CollectionSummary(
        total_acquisition=acq,
        total_current_value=cur,
        total_roi_pct=_roi(acq, cur),
        item_count=row.cnt,
        wallet_id=wallet.wallet_id if wallet else None,
    )


# ── Pokemon card search ───────────────────────────────────────────────────────

@router.get("/pokemon-cards/search", response_model=list[PokemonCardOut])
def search_pokemon_cards(q: str, limit: int = 20,
                         user_id: int = Depends(get_user_id), db: Session = Depends(get_db)):
    if len(q) < 2:
        return []
    like = f"%{q.lower()}%"
    cards = db.query(PokemonCard).filter(
        func.lower(PokemonCard.name).like(like)
    ).order_by(PokemonCard.name).limit(limit).all()
    return cards
