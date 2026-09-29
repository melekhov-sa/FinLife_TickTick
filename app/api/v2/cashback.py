"""API v2 — кэшбеки по картам (справочник категорий + ставки по месяцам)."""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.v2.deps import get_user_id
from app.application.cashback import compute_highlights
from app.infrastructure.db.session import get_db
from app.infrastructure.db.models import CashbackCategory, CashbackEntry, WalletBalance

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class CashbackCategoryOut(BaseModel):
    id: int
    title: str

    class Config:
        from_attributes = True


class CategoryIn(BaseModel):
    title: str


class CashbackEntryOut(BaseModel):
    id: int
    category_id: int
    category_title: str
    percent: Decimal
    is_best: bool
    is_outranked: bool


class CashbackCardOut(BaseModel):
    wallet_id: int
    title: str
    entries: list[CashbackEntryOut]


class CashbackMonthOut(BaseModel):
    month: str
    cards: list[CashbackCardOut]


class EntryIn(BaseModel):
    wallet_id: int
    percent: Decimal
    month: str | None = None
    category_id: int | None = None
    category_title: str | None = None


class EntryPatch(BaseModel):
    percent: Decimal | None = None
    category_id: int | None = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_month(month: str | None) -> date:
    """«YYYY-MM» → 1-е число месяца. None → текущий месяц."""
    if not month:
        today = date.today()
        return date(today.year, today.month, 1)
    parts = month.split("-")
    if len(parts) != 2:
        raise HTTPException(400, "month должен быть в формате YYYY-MM")
    try:
        year, mon = int(parts[0]), int(parts[1])
        return date(year, mon, 1)
    except ValueError:
        raise HTTPException(400, "month должен быть в формате YYYY-MM")


def _check_percent(percent: Decimal) -> None:
    if percent <= 0 or percent > 100:
        raise HTTPException(400, "Процент должен быть больше 0 и не больше 100")


def _regular_wallets(db: Session, user_id: int) -> list[WalletBalance]:
    """Кэшбек ведётся только по обычным (не кредитным, не накопительным) картам."""
    return (
        db.query(WalletBalance)
        .filter(
            WalletBalance.account_id == user_id,
            WalletBalance.wallet_type == "REGULAR",
            WalletBalance.is_archived == False,  # noqa: E712
        )
        .order_by(WalletBalance.title)
        .all()
    )


def _resolve_category(
    db: Session, user_id: int, category_id: int | None, category_title: str | None
) -> CashbackCategory:
    """Берём существующую категорию по id, иначе по названию, иначе создаём."""
    if category_id is not None:
        cat = (
            db.query(CashbackCategory)
            .filter(CashbackCategory.id == category_id, CashbackCategory.account_id == user_id)
            .first()
        )
        if not cat:
            raise HTTPException(404, "Категория не найдена")
        return cat

    title = (category_title or "").strip()
    if not title:
        raise HTTPException(400, "Укажите категорию")

    existing = (
        db.query(CashbackCategory)
        .filter(CashbackCategory.account_id == user_id, CashbackCategory.title.ilike(title))
        .first()
    )
    if existing:
        return existing

    cat = CashbackCategory(account_id=user_id, title=title)
    db.add(cat)
    db.flush()
    return cat


def _entry_out(entry: CashbackEntry, title: str, flags: dict[str, bool]) -> CashbackEntryOut:
    return CashbackEntryOut(
        id=entry.id,
        category_id=entry.category_id,
        category_title=title,
        percent=entry.percent,
        is_best=flags["is_best"],
        is_outranked=flags["is_outranked"],
    )


def _load_entry(db: Session, entry_id: int, user_id: int) -> CashbackEntry:
    entry = (
        db.query(CashbackEntry)
        .filter(CashbackEntry.id == entry_id, CashbackEntry.account_id == user_id)
        .first()
    )
    if not entry:
        raise HTTPException(404, "Ставка не найдена")
    return entry


# ── Категории ─────────────────────────────────────────────────────────────────

@router.get("/cashback/categories", response_model=list[CashbackCategoryOut])
def list_categories(db: Session = Depends(get_db), user_id: int = Depends(get_user_id)):
    return (
        db.query(CashbackCategory)
        .filter(CashbackCategory.account_id == user_id)
        .order_by(CashbackCategory.title)
        .all()
    )


@router.post("/cashback/categories", response_model=CashbackCategoryOut, status_code=201)
def create_category(
    body: CategoryIn, db: Session = Depends(get_db), user_id: int = Depends(get_user_id)
):
    cat = _resolve_category(db, user_id, None, body.title)
    db.commit()
    return cat


@router.patch("/cashback/categories/{category_id}", response_model=CashbackCategoryOut)
def rename_category(
    category_id: int,
    body: CategoryIn,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_user_id),
):
    title = body.title.strip()
    if not title:
        raise HTTPException(400, "Название не может быть пустым")
    cat = _resolve_category(db, user_id, category_id, None)
    clash = (
        db.query(CashbackCategory)
        .filter(
            CashbackCategory.account_id == user_id,
            CashbackCategory.title.ilike(title),
            CashbackCategory.id != category_id,
        )
        .first()
    )
    if clash:
        raise HTTPException(400, "Такая категория уже есть")
    cat.title = title
    db.commit()
    return cat


@router.delete("/cashback/categories/{category_id}", status_code=204)
def delete_category(
    category_id: int, db: Session = Depends(get_db), user_id: int = Depends(get_user_id)
):
    cat = _resolve_category(db, user_id, category_id, None)
    # Ставки уходят каскадом (ondelete="CASCADE"), но подчистим и явно.
    db.query(CashbackEntry).filter(
        CashbackEntry.account_id == user_id, CashbackEntry.category_id == category_id
    ).delete(synchronize_session=False)
    db.delete(cat)
    db.commit()
    return None


# ── Месяц ─────────────────────────────────────────────────────────────────────

@router.get("/cashback", response_model=CashbackMonthOut)
def get_month(
    month: str | None = None,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_user_id),
):
    period = _parse_month(month)
    wallets = _regular_wallets(db, user_id)

    rows = (
        db.query(CashbackEntry, CashbackCategory.title)
        .join(CashbackCategory, CashbackCategory.id == CashbackEntry.category_id)
        .filter(
            CashbackEntry.account_id == user_id,
            CashbackEntry.period_month == period,
        )
        .all()
    )

    flags = compute_highlights([(e.id, e.category_id, e.percent) for e, _ in rows])

    by_wallet: dict[int, list[CashbackEntryOut]] = {}
    for entry, title in rows:
        by_wallet.setdefault(entry.wallet_id, []).append(
            _entry_out(entry, title, flags[entry.id])
        )
    for items in by_wallet.values():
        items.sort(key=lambda e: (-e.percent, e.category_title))

    return CashbackMonthOut(
        month=period.strftime("%Y-%m"),
        cards=[
            CashbackCardOut(
                wallet_id=w.wallet_id,
                title=w.title,
                entries=by_wallet.get(w.wallet_id, []),
            )
            for w in wallets
        ],
    )


# ── Ставки ────────────────────────────────────────────────────────────────────

@router.post("/cashback/entries", response_model=CashbackEntryOut, status_code=201)
def create_entry(
    body: EntryIn, db: Session = Depends(get_db), user_id: int = Depends(get_user_id)
):
    _check_percent(body.percent)
    period = _parse_month(body.month)

    wallet_ids = {w.wallet_id for w in _regular_wallets(db, user_id)}
    if body.wallet_id not in wallet_ids:
        raise HTTPException(400, "Кэшбек можно вести только по обычным картам")

    cat = _resolve_category(db, user_id, body.category_id, body.category_title)

    dup = (
        db.query(CashbackEntry)
        .filter(
            CashbackEntry.account_id == user_id,
            CashbackEntry.wallet_id == body.wallet_id,
            CashbackEntry.category_id == cat.id,
            CashbackEntry.period_month == period,
        )
        .first()
    )
    if dup:
        raise HTTPException(400, "Для этой карты и категории ставка на месяц уже есть")

    entry = CashbackEntry(
        account_id=user_id,
        wallet_id=body.wallet_id,
        category_id=cat.id,
        percent=body.percent,
        period_month=period,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    # Флаги на одиночной записи не считаем — их пересчитает GET /cashback.
    return _entry_out(entry, cat.title, {"is_best": False, "is_outranked": False})


@router.patch("/cashback/entries/{entry_id}", response_model=CashbackEntryOut)
def update_entry(
    entry_id: int,
    body: EntryPatch,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_user_id),
):
    entry = _load_entry(db, entry_id, user_id)

    if body.percent is not None:
        _check_percent(body.percent)
        entry.percent = body.percent

    if body.category_id is not None and body.category_id != entry.category_id:
        cat = _resolve_category(db, user_id, body.category_id, None)
        dup = (
            db.query(CashbackEntry)
            .filter(
                CashbackEntry.account_id == user_id,
                CashbackEntry.wallet_id == entry.wallet_id,
                CashbackEntry.category_id == cat.id,
                CashbackEntry.period_month == entry.period_month,
                CashbackEntry.id != entry.id,
            )
            .first()
        )
        if dup:
            raise HTTPException(400, "Для этой карты и категории ставка на месяц уже есть")
        entry.category_id = cat.id

    db.commit()
    db.refresh(entry)
    title = (
        db.query(CashbackCategory.title)
        .filter(CashbackCategory.id == entry.category_id)
        .scalar()
    )
    return _entry_out(entry, title or "", {"is_best": False, "is_outranked": False})


@router.delete("/cashback/entries/{entry_id}", status_code=204)
def delete_entry(
    entry_id: int, db: Session = Depends(get_db), user_id: int = Depends(get_user_id)
):
    entry = _load_entry(db, entry_id, user_id)
    db.delete(entry)
    db.commit()
    return None
