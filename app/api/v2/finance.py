"""
GET  /api/v2/wallets           — list active wallets
GET  /api/v2/fin-categories    — list financial categories (INCOME / EXPENSE)
GET  /api/v2/transactions      — paginated transaction feed with filters
POST /api/v2/transactions      — create income / expense / transfer
"""
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, Request, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.infrastructure.db.session import get_db
from app.api.v2.deps import get_user_id
from app.infrastructure.db.models import WalletBalance, CategoryInfo, TransactionFeed, MandatoryCategory

router = APIRouter()


# ── Wallets ────────────────────────────────────────────────────────────────

class WalletItem(BaseModel):
    wallet_id: int
    title: str
    currency: str
    wallet_type: str
    balance: str
    delta_30d: str
    operations_count_30d: int
    last_operation_at: str | None
    is_archived: bool


@router.get("/wallets", response_model=list[WalletItem])
def list_wallets(
    request: Request,
    db: Session = Depends(get_db),
    include_archived: bool = Query(False),
):
    user_id = get_user_id(request, db)
    q = db.query(WalletBalance).filter(WalletBalance.account_id == user_id)
    if not include_archived:
        q = q.filter(WalletBalance.is_archived == False)
    wallets = q.order_by(WalletBalance.title).all()
    return [
        WalletItem(
            wallet_id=w.wallet_id,
            title=w.title,
            currency=w.currency,
            wallet_type=w.wallet_type,
            balance=str(w.balance),
            delta_30d=str(w.balance - (w.balance_30d_ago or w.balance)),
            operations_count_30d=w.operations_count_30d,
            last_operation_at=w.last_operation_at.isoformat() if w.last_operation_at else None,
            is_archived=w.is_archived,
        )
        for w in wallets
    ]


class CreateWalletRequest(BaseModel):
    title: str
    wallet_type: str = "REGULAR"  # REGULAR, SAVINGS, CREDIT
    currency: str = "RUB"
    initial_balance: str = "0"


@router.post("/wallets", status_code=201)
def create_wallet(body: CreateWalletRequest, request: Request, db: Session = Depends(get_db)):
    from app.application.wallets import CreateWalletUseCase, WalletValidationError
    user_id = get_user_id(request, db)
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Название не может быть пустым")
    try:
        wallet_id = CreateWalletUseCase(db).execute(
            account_id=user_id,
            title=title,
            wallet_type=body.wallet_type,
            currency=body.currency.upper().strip(),
            initial_balance=body.initial_balance,
            actor_user_id=user_id,
        )
    except WalletValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"wallet_id": wallet_id}


class RenameWalletRequest(BaseModel):
    title: str


@router.patch("/wallets/{wallet_id}")
def rename_wallet(wallet_id: int, body: RenameWalletRequest, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    wallet = db.query(WalletBalance).filter(
        WalletBalance.wallet_id == wallet_id, WalletBalance.account_id == user_id,
    ).first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    wallet.title = body.title.strip()
    db.commit()
    return {"ok": True}


class ActualizeBalanceRequest(BaseModel):
    target_balance: str  # decimal string


@router.post("/wallets/{wallet_id}/actualize-balance")
def actualize_balance(wallet_id: int, body: ActualizeBalanceRequest, request: Request, db: Session = Depends(get_db)):
    from app.application.transactions import CreateTransactionUseCase
    user_id = get_user_id(request, db)
    try:
        target = Decimal(body.target_balance)
        result = CreateTransactionUseCase(db).actualize_balance(
            account_id=user_id,
            wallet_id=wallet_id,
            target_balance=target,
            actor_user_id=user_id,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "action": result["action"],
        "delta": str(result["delta"]),
        "transaction_id": result["transaction_id"],
    }


@router.delete("/wallets/{wallet_id}", status_code=204)
def archive_wallet(wallet_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    wallet = db.query(WalletBalance).filter(
        WalletBalance.wallet_id == wallet_id, WalletBalance.account_id == user_id,
    ).first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    wallet.is_archived = True
    db.commit()


@router.post("/wallets/{wallet_id}/restore", status_code=200)
def restore_wallet(wallet_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    wallet = db.query(WalletBalance).filter(
        WalletBalance.wallet_id == wallet_id, WalletBalance.account_id == user_id,
    ).first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    wallet.is_archived = False
    db.commit()
    return {"ok": True}


# ── Financial categories ───────────────────────────────────────────────────

class FinCategoryItem(BaseModel):
    category_id: int
    title: str
    category_type: str   # INCOME | EXPENSE
    parent_id: int | None
    is_frequent: bool = False
    color: str | None = None


class FinCategoryItemFull(BaseModel):
    category_id: int
    title: str
    category_type: str   # INCOME | EXPENSE
    parent_id: int | None
    is_frequent: bool = False
    is_archived: bool = False
    is_system: bool = False
    is_mandatory: bool = False
    color: str | None = None


@router.get("/fin-categories", response_model=list[FinCategoryItemFull])
def list_fin_categories(
    request: Request,
    db: Session = Depends(get_db),
    include_archived: bool = Query(False),
):
    user_id = get_user_id(request, db)
    q = db.query(CategoryInfo).filter(CategoryInfo.account_id == user_id)
    if not include_archived:
        q = q.filter(CategoryInfo.is_archived == False)
    cats = q.order_by(CategoryInfo.sort_order, CategoryInfo.title).all()

    # Top-5 frequent per type (last 30 days)
    since = date.today() - timedelta(days=30)

    def _top5(op_type: str) -> set:
        rows = (
            db.query(TransactionFeed.category_id, func.count().label("cnt"))
            .filter(
                TransactionFeed.account_id == user_id,
                TransactionFeed.category_id.isnot(None),
                TransactionFeed.operation_type == op_type,
                TransactionFeed.occurred_at >= since,
            )
            .group_by(TransactionFeed.category_id)
            .order_by(func.count().desc())
            .limit(5)
            .all()
        )
        return {r.category_id for r in rows}

    freq_ids = _top5("INCOME") | _top5("EXPENSE")

    mandatory_ids = {
        r[0] for r in db.query(MandatoryCategory.category_id)
        .filter(MandatoryCategory.account_id == user_id).all()
    }

    return [
        FinCategoryItemFull(
            category_id=c.category_id,
            title=c.title,
            category_type=c.category_type,
            color=c.color,
            parent_id=c.parent_id,
            is_frequent=c.category_id in freq_ids,
            is_archived=c.is_archived,
            is_system=c.is_system,
            is_mandatory=c.category_id in mandatory_ids,
        )
        for c in cats
    ]


class SetMandatoryRequest(BaseModel):
    value: bool


@router.post("/fin-categories/{category_id}/mandatory")
def set_category_mandatory(
    category_id: int,
    body: SetMandatoryRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Mark/unmark an expense category as mandatory (обязательный расход)."""
    user_id = get_user_id(request, db)
    cat = db.query(CategoryInfo).filter(
        CategoryInfo.category_id == category_id,
        CategoryInfo.account_id == user_id,
    ).first()
    if not cat:
        raise HTTPException(404, "Категория не найдена")

    existing = db.query(MandatoryCategory).filter(
        MandatoryCategory.account_id == user_id,
        MandatoryCategory.category_id == category_id,
    ).first()

    if body.value and not existing:
        db.add(MandatoryCategory(account_id=user_id, category_id=category_id))
    elif not body.value and existing:
        db.delete(existing)
    db.commit()
    return {"ok": True, "is_mandatory": body.value}


class CreateFinCategoryRequest(BaseModel):
    title: str
    category_type: str  # INCOME or EXPENSE
    parent_id: int | None = None


@router.post("/fin-categories", status_code=201)
def create_fin_category(
    body: CreateFinCategoryRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    from app.application.categories import CreateCategoryUseCase, CategoryValidationError
    from app.domain.category import CATEGORY_TYPE_INCOME, CATEGORY_TYPE_EXPENSE
    user_id = get_user_id(request, db)
    if body.category_type not in (CATEGORY_TYPE_INCOME, CATEGORY_TYPE_EXPENSE):
        raise HTTPException(status_code=400, detail="category_type должен быть INCOME или EXPENSE")
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Название не может быть пустым")
    try:
        category_id = CreateCategoryUseCase(db).execute(
            account_id=user_id,
            title=title,
            category_type=body.category_type,
            parent_id=body.parent_id,
            is_system=False,
            actor_user_id=user_id,
        )
    except CategoryValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    cat = db.query(CategoryInfo).filter(CategoryInfo.category_id == category_id).first()
    if not cat:
        raise HTTPException(status_code=500, detail="Category creation failed")
    return FinCategoryItemFull(
        category_id=cat.category_id,
        title=cat.title,
        category_type=cat.category_type,
        parent_id=cat.parent_id,
        is_frequent=False,
        is_archived=cat.is_archived,
        is_system=cat.is_system,
        color=cat.color,
    )


class UpdateFinCategoryRequest(BaseModel):
    title: str | None = None
    color: str | None = None  # "#RRGGBB"; пустая строка = сбросить в авто


@router.patch("/fin-categories/{category_id}")
def update_fin_category(
    category_id: int,
    body: UpdateFinCategoryRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    from app.application.categories import UpdateCategoryUseCase, CategoryValidationError
    user_id = get_user_id(request, db)
    cat = db.query(CategoryInfo).filter(
        CategoryInfo.category_id == category_id,
        CategoryInfo.account_id == user_id,
    ).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Категория не найдена")
    title = body.title.strip() if body.title is not None else None
    if title is not None and not title:
        raise HTTPException(status_code=400, detail="Название не может быть пустым")

    # Цвет — прямо в read-модель (не событийное поле)
    if "color" in body.model_fields_set:
        raw = (body.color or "").strip()
        if raw and not _re.fullmatch(r"#[0-9a-fA-F]{6}", raw):
            raise HTTPException(status_code=400, detail="Цвет должен быть #RRGGBB")
        cat.color = raw or None
        db.commit()

    if title is not None:
        try:
            UpdateCategoryUseCase(db).execute(
                category_id=category_id,
                account_id=user_id,
                title=title,
                actor_user_id=user_id,
            )
        except CategoryValidationError as e:
            raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True}


@router.post("/fin-categories/{category_id}/archive")
def archive_fin_category(
    category_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    from app.application.categories import ArchiveCategoryUseCase, CategoryValidationError
    user_id = get_user_id(request, db)
    try:
        ArchiveCategoryUseCase(db).execute(
            category_id=category_id,
            account_id=user_id,
            actor_user_id=user_id,
        )
    except CategoryValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True}


@router.post("/fin-categories/{category_id}/restore")
def restore_fin_category(
    category_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    from app.application.categories import UnarchiveCategoryUseCase, CategoryValidationError
    user_id = get_user_id(request, db)
    try:
        UnarchiveCategoryUseCase(db).execute(
            category_id=category_id,
            account_id=user_id,
            actor_user_id=user_id,
        )
    except CategoryValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True}


# ── List transactions ──────────────────────────────────────────────────────

class TransactionItem(BaseModel):
    transaction_id: int
    operation_type: str
    amount: str
    currency: str
    wallet_id: int | None
    from_wallet_id: int | None
    to_wallet_id: int | None
    category_id: int | None
    category_title: str | None
    description: str
    occurred_at: str
    budget_month: str | None = None  # YYYY-MM-DD (1-е число), NULL = по дате


@router.get("/transactions", response_model=dict)
def list_transactions(
    request: Request,
    operation_type: str | None = Query(None),
    wallet_id: int | None = Query(None),
    category_id: int | None = Query(None),
    exclude_category_ids: str | None = Query(None),
    list_id: int | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    budget_dates: bool = Query(False),  # окно по coalesce(budget_month, occurred_at)
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, le=200),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(request, db)

    q = db.query(TransactionFeed).filter(TransactionFeed.account_id == user_id)

    if operation_type in ("INCOME", "EXPENSE", "TRANSFER"):
        q = q.filter(TransactionFeed.operation_type == operation_type)
    if wallet_id:
        from sqlalchemy import or_
        q = q.filter(or_(
            TransactionFeed.wallet_id == wallet_id,
            TransactionFeed.from_wallet_id == wallet_id,
            TransactionFeed.to_wallet_id == wallet_id,
        ))
    if list_id is not None:
        q = q.filter(TransactionFeed.list_id == list_id)
    if exclude_category_ids:
        # "Прочие" with explicit exclusion list — transactions NOT in these category IDs
        try:
            excl_ids = [int(x) for x in exclude_category_ids.split(",") if x.strip()]
        except ValueError:
            excl_ids = []
        from sqlalchemy import or_
        if excl_ids:
            q = q.filter(or_(
                TransactionFeed.category_id == None,
                ~TransactionFeed.category_id.in_(excl_ids),
            ))
    elif category_id:
        if category_id == -1:
            # Legacy fallback: uncategorized = not in any non-archived category
            visible_cat_ids = [c.category_id for c in db.query(CategoryInfo.category_id).filter(
                CategoryInfo.account_id == user_id,
                CategoryInfo.is_archived == False,
            ).all()]
            from sqlalchemy import or_
            q = q.filter(or_(
                TransactionFeed.category_id == None,
                ~TransactionFeed.category_id.in_(visible_cat_ids) if visible_cat_ids else True,
            ))
        else:
            # Include child categories if this is a parent (group) category
            cat = db.query(CategoryInfo).filter(CategoryInfo.category_id == category_id).first()
            if cat and cat.parent_id is None:
                child_ids = [c.category_id for c in db.query(CategoryInfo.category_id).filter(CategoryInfo.parent_id == category_id).all()]
                q = q.filter(TransactionFeed.category_id.in_([category_id] + child_ids))
            else:
                q = q.filter(TransactionFeed.category_id == category_id)
    from sqlalchemy import cast as _cast, TIMESTAMP as _TS
    _window_dt = (
        func.coalesce(_cast(TransactionFeed.budget_month, _TS(timezone=True)), TransactionFeed.occurred_at)
        if budget_dates
        else TransactionFeed.occurred_at
    )
    if date_from:
        from datetime import datetime as _dt
        try:
            df = _dt.fromisoformat(date_from)
        except ValueError:
            df = _dt.strptime(date_from, "%Y-%m-%d")
        q = q.filter(_window_dt >= df)
    if date_to:
        from datetime import datetime as _dt
        try:
            dt_end = _dt.fromisoformat(date_to)
        except ValueError:
            dt_end = _dt.strptime(date_to, "%Y-%m-%d")
        q = q.filter(_window_dt < dt_end)
    if search and search.strip():
        q = q.filter(TransactionFeed.description.ilike(f"%{search.strip()}%"))

    total = q.count()

    # Aggregate totals per type across all filtered rows (before pagination)
    type_totals = (
        q.with_entities(TransactionFeed.operation_type, func.sum(TransactionFeed.amount))
        .group_by(TransactionFeed.operation_type)
        .all()
    )
    totals_map = {row[0]: float(row[1] or 0) for row in type_totals}

    transactions = (
        q.order_by(TransactionFeed.occurred_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    # Batch load category titles
    cat_ids = {t.category_id for t in transactions if t.category_id}
    cat_map: dict[int, str] = {}
    if cat_ids:
        cats = db.query(CategoryInfo).filter(CategoryInfo.category_id.in_(cat_ids)).all()
        cat_map = {c.category_id: c.title for c in cats}

    items = [
        TransactionItem(
            transaction_id=t.transaction_id,
            operation_type=t.operation_type,
            amount=str(t.amount),
            currency=t.currency,
            wallet_id=t.wallet_id,
            from_wallet_id=t.from_wallet_id,
            to_wallet_id=t.to_wallet_id,
            category_id=t.category_id,
            category_title=cat_map.get(t.category_id) if t.category_id else None,
            description=t.description or "",
            occurred_at=t.occurred_at.isoformat(),
            budget_month=t.budget_month.isoformat() if t.budget_month else None,
        )
        for t in transactions
    ]

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
        "totals": totals_map,
        "items": [i.model_dump() for i in items],
    }


# ── Aggregate ─────────────────────────────────────────────────────────────

from calendar import monthrange as _monthrange


class AggregateRequest(BaseModel):
    operation_type: str           # INCOME | EXPENSE
    period: str                   # year | quarter | month
    category_ids: list[int] = []
    wallet_id: int | None = None


class AggregateResponse(BaseModel):
    total: str
    currency: str
    period_label: str
    prev_total: str
    prev_period_label: str
    tx_count: int


@router.post("/transactions/aggregate", response_model=AggregateResponse)
def aggregate_transactions(
    body: AggregateRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    from datetime import date as _date
    user_id = get_user_id(request, db)
    today = _date.today()
    _MONTHS_RU = ["янв", "фев", "мар", "апр", "май", "июн",
                  "июл", "авг", "сен", "окт", "ноя", "дек"]

    def period_bounds(offset: int) -> tuple:
        """(datetime_from, datetime_to, label) for current (0) or previous (1) period."""
        if body.period == "year":
            y = today.year - offset
            return (
                datetime(y, 1, 1),
                datetime(y + 1, 1, 1),
                str(y),
            )
        elif body.period == "month":
            m = today.month - offset
            y = today.year
            while m <= 0:
                m += 12
                y -= 1
            _, last_day = _monthrange(y, m)
            return (
                datetime(y, m, 1),
                datetime(y, m, last_day, 23, 59, 59, 999999) + timedelta(microseconds=1),
                f"{_MONTHS_RU[m - 1]} {y}",
            )
        elif body.period == "quarter":
            q = (today.month - 1) // 3 - offset
            y = today.year
            while q < 0:
                q += 4
                y -= 1
            sm = q * 3 + 1
            em = sm + 3
            ey = y
            if em > 12:
                em -= 12
                ey += 1
            return (
                datetime(y, sm, 1),
                datetime(ey, em, 1),
                f"Q{q + 1} {y}",
            )
        raise ValueError(f"Unknown period: {body.period}")

    def query_sum(dt_from: datetime, dt_to: datetime):
        q = (
            db.query(
                TransactionFeed.currency,
                func.sum(TransactionFeed.amount).label("total"),
                func.count().label("cnt"),
            )
            .filter(
                TransactionFeed.account_id == user_id,
                TransactionFeed.operation_type == body.operation_type,
                TransactionFeed.occurred_at >= dt_from,
                TransactionFeed.occurred_at < dt_to,
            )
        )
        if body.category_ids:
            q = q.filter(TransactionFeed.category_id.in_(body.category_ids))
        if body.wallet_id:
            q = q.filter(TransactionFeed.wallet_id == body.wallet_id)
        rows = q.group_by(TransactionFeed.currency).all()
        if not rows:
            return Decimal("0"), "RUB", 0
        best = max(rows, key=lambda r: r.total or 0)
        return best.total or Decimal("0"), best.currency, int(best.cnt)

    curr_from, curr_to, curr_label = period_bounds(0)
    prev_from, prev_to, prev_label = period_bounds(1)

    curr_total, currency, curr_count = query_sum(curr_from, curr_to)
    prev_total, _, _ = query_sum(prev_from, prev_to)

    return AggregateResponse(
        total=str(curr_total),
        currency=currency,
        period_label=curr_label,
        prev_total=str(prev_total),
        prev_period_label=prev_label,
        tx_count=curr_count,
    )


# ── Category suggestion ────────────────────────────────────────────────────
#
# Модель «похожих соседей» (weighted k-NN) + сильные ранние сигналы.
# Уровни (от сильного к слабому):
#   0. Плановая операция: сумма ≈ активной плановой на ближайшие дни → её категория.
#   1. Описание: токены из введённого текста совпали с прошлыми описаниями.
#   2. Точный повтор суммы (857 ₽ → связь).
#   3. k-NN: близость суммы × кошелёк × время суток × день месяца ×
#      будни/выходной × свежесть. Никакого перекоса на «самую частую»:
#      редкая, но точно совпадающая по сумме категория уверенно побеждает.

import math as _math
import re as _re
from collections import defaultdict as _defaultdict

_LOOKBACK_DAYS = 180          # ловим и помесячные платежи (≈6 повторов)
_AMOUNT_SIGMA = 0.12          # «ширина» похожести суммы (~±12% — сильное совпадение)
_WALLET_OTHER = 0.45         # вес операции с другого кошелька
_TIME_OTHER = 0.80           # вес операции в другое время суток
_DOW_OTHER = 0.90            # вес операции в другой тип дня (будни/выходной)
_DOM_BONUS = 1.15            # бонус за близкий день месяца (повторяющиеся платежи)
_TEXT_BONUS = 1.6            # бонус за совпадение описания внутри k-NN
_MIN_TOTAL_WEIGHT = 0.8      # минимум «похожей истории», иначе не подсказываем
_NEAR_EXACT = 0.90           # порог «почти точное совпадение суммы»
_MIN_CONFIDENCE = 0.45

# Служебные слова, не несущие категорию
_STOP_TOKENS = {
    "оплата", "покупка", "покупки", "перевод", "платеж", "платёж", "магазин",
    "оплатить", "счет", "счёт", "карта", "карты", "рублей", "руб",
}


def _time_bucket(hour: int) -> int:
    if 6 <= hour < 12: return 0
    if 12 <= hour < 18: return 1
    if 18 <= hour < 22: return 2
    return 3


def _amount_similarity(a: float, b: float) -> float:
    """1.0 — суммы совпадают; плавно убывает с разницей (гаусс).

    Для мелких сумм знаменатель прижат к 500: 120 и 180 ₽ — это «похоже»
    (обе — кофе), хотя относительная разница 33%.
    """
    if a <= 0 or b <= 0:
        return 0.0
    d = abs(a - b) / max(a, b, 500.0)
    return _math.exp(-(d * d) / (2 * _AMOUNT_SIGMA * _AMOUNT_SIGMA))


def _desc_tokens(s: str | None) -> set[str]:
    """Нормализованные токены описания: lower, ё→е, только буквы, ≥3 символов."""
    if not s:
        return set()
    s = s.lower().replace("ё", "е")
    s = _re.sub(r"[^а-яa-z ]", " ", s)
    return {t for t in s.split() if len(t) >= 3 and t not in _STOP_TOKENS}


def _text_match(q_tokens: set[str], row_tokens: set[str]) -> bool:
    """Совпадение описаний: общий токен или общий префикс ≥4 (склонения)."""
    if not q_tokens or not row_tokens:
        return False
    if q_tokens & row_tokens:
        return True
    for qt in q_tokens:
        if len(qt) < 4:
            continue
        p = qt[:4]
        for rt in row_tokens:
            if rt.startswith(p) or (len(rt) >= 4 and qt.startswith(rt[:4])):
                return True
    return False


def _dom_close(d1: int, d2: int) -> bool:
    """Циклическая близость дня месяца (±2 дня): ипотека 1-го ≈ 30-го."""
    diff = abs(d1 - d2)
    return min(diff, 31 - diff) <= 2


def _is_weekend(dt) -> bool:
    return dt.weekday() >= 5


def _median(xs: list) -> float:
    ys = sorted(xs)
    n = len(ys)
    mid = n // 2
    return float(ys[mid]) if n % 2 else (ys[mid - 1] + ys[mid]) / 2.0


def _log_typicality(amount: float, amounts: list[float]) -> float | None:
    """Насколько сумма типична для категории (лог-нормаль, [0..1]).

    У «Связи» разброс нулевой, у «Продуктов» огромный — общая сигма это
    не ловит. None, если истории мало (<4 операций).
    """
    vals = [x for x in amounts if x > 0]
    if len(vals) < 4 or amount <= 0:
        return None
    la = [_math.log(x) for x in vals]
    mean = sum(la) / len(la)
    var = sum((x - mean) ** 2 for x in la) / len(la)
    sd = max(var ** 0.5, 0.10)
    z = abs(_math.log(amount) - mean) / sd
    return _math.exp(-(z * z) / 2.0)


def _roundness_class(a: float) -> str:
    """Круглость: 5000 ровно — перевод/подарок, 4873.50 — магазинный чек."""
    if abs(a - round(a)) > 0.004:
        return "kop"
    ai = int(round(a))
    if ai % 1000 == 0:
        return "r1000"
    if ai % 100 == 0:
        return "r100"
    return "odd"


class SuggestCategoryRequest(BaseModel):
    amount: str
    wallet_id: int | None = None
    operation_type: str
    hour: int | None = None
    description: str | None = None   # введённый текст — сильный сигнал
    date: str | None = None          # YYYY-MM-DD даты операции (для дня месяца/недели)


class SuggestCategoryResult(BaseModel):
    category_id: int
    confidence: float
    exact: bool = False        # есть прошлый платёж почти с такой же суммой
    reason: str = ""           # короткое объяснение «почему»


@router.post("/transactions/suggest-category", response_model=list[SuggestCategoryResult])
def suggest_category(
    body: SuggestCategoryRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = get_user_id(request, db)
    since = datetime.utcnow() - timedelta(days=_LOOKBACK_DAYS)

    rows = (
        db.query(
            TransactionFeed.category_id,
            TransactionFeed.amount,
            TransactionFeed.wallet_id,
            TransactionFeed.occurred_at,
            TransactionFeed.description,
        )
        .filter(
            TransactionFeed.account_id == user_id,
            TransactionFeed.operation_type == body.operation_type,
            TransactionFeed.category_id.isnot(None),
            TransactionFeed.occurred_at >= since,
        )
        .all()
    )

    if len(rows) < 3:
        return []

    try:
        amount = float(body.amount)
        if amount <= 0:
            return []
    except (ValueError, TypeError):
        return []

    try:
        target_date = date.fromisoformat(body.date) if body.date else date.today()
    except ValueError:
        target_date = date.today()

    # ── Обучение на исправлениях: прошлые «подсказали X → юзер выбрал Y» ─────
    from app.infrastructure.db.models import CategorySuggestLog
    corr_mult: dict = {}
    for c in (
        db.query(CategorySuggestLog)
        .filter(
            CategorySuggestLog.account_id == user_id,
            CategorySuggestLog.operation_type == body.operation_type,
            CategorySuggestLog.created_at >= since,
        )
        .all()
    ):
        if _amount_similarity(amount, float(c.amount)) < 0.5:
            continue
        if (body.wallet_id is not None and c.wallet_id is not None
                and c.wallet_id != body.wallet_id):
            continue
        if not c.accepted and c.chosen_category_id:
            corr_mult[c.suggested_category_id] = corr_mult.get(c.suggested_category_id, 1.0) * 0.75
            corr_mult[c.chosen_category_id] = corr_mult.get(c.chosen_category_id, 1.0) * 1.15
    corr_mult = {k: min(1.4, max(0.5, v)) for k, v in corr_mult.items()}

    # ── Уровень 0: сумма совпадает с плановой операцией ближайших дней ───────
    from app.infrastructure.db.models import OperationOccurrence, OperationTemplateModel
    po = (
        db.query(OperationTemplateModel.category_id, OperationTemplateModel.title,
                 OperationTemplateModel.amount)
        .join(OperationOccurrence,
              OperationOccurrence.template_id == OperationTemplateModel.template_id)
        .filter(
            OperationOccurrence.account_id == user_id,
            OperationOccurrence.status == "ACTIVE",
            OperationOccurrence.scheduled_date >= target_date - timedelta(days=10),
            OperationOccurrence.scheduled_date <= target_date + timedelta(days=10),
            OperationTemplateModel.kind == body.operation_type,
            OperationTemplateModel.category_id.isnot(None),
            OperationTemplateModel.amount.isnot(None),
        )
        .all()
    )
    for cat_id, title, po_amount in po:
        if po_amount and abs(float(po_amount) - amount) <= max(1.0, amount * 0.03):
            return [SuggestCategoryResult(
                category_id=cat_id,
                confidence=0.93,
                exact=True,
                reason=f"плановая операция «{title}»",
            )]

    # ── Уровень 1: совпадение описания (текст — сильнее суммы) ───────────────
    q_tokens = _desc_tokens(body.description)
    row_tokens_cache: dict[int, set[str]] = {}
    if q_tokens:
        text_cat: dict = _defaultdict(float)
        text_total = 0.0
        text_hits = 0
        for i, r in enumerate(rows):
            rt = _desc_tokens(r.description)
            row_tokens_cache[i] = rt
            if _text_match(q_tokens, rt):
                w = 1.0 if (body.wallet_id is not None and r.wallet_id == body.wallet_id) else 0.8
                text_cat[r.category_id] += w
                text_total += w
                text_hits += 1
        if text_hits >= 2 and text_total > 0:
            best_cid = max(text_cat, key=lambda c: text_cat[c])
            share = text_cat[best_cid] / text_total
            if share >= 0.65:
                return [SuggestCategoryResult(
                    category_id=best_cid,
                    confidence=round(max(0.85, share), 4),
                    exact=True,
                    reason="по описанию",
                )]

    # ── Уровень 2: точный повтор суммы (сильнейший сигнал) ──────────────────
    # «Ровно такая же сумма уже была — почти всегда та же категория»
    # (857 ₽ → связь, 3200 ₽ → транспорт). Узкий допуск, чтобы 850 не примешалось.
    exact_tol = max(1.0, amount * 0.005)   # ±0.5%, минимум 1 ₽
    exact_rows = [r for r in rows if abs(float(r.amount) - amount) <= exact_tol]
    if len(exact_rows) >= 2:
        exact_cat: dict = _defaultdict(float)
        exact_total = 0.0
        for r in exact_rows:
            w = 1.0 if (body.wallet_id is not None and r.wallet_id == body.wallet_id) else 0.7
            exact_cat[r.category_id] += w
            exact_total += w
        best_cid = max(exact_cat, key=lambda c: exact_cat[c])
        share = exact_cat[best_cid] / exact_total
        # не повторяем подтверждённую юзером ошибку на этой же сумме
        if share >= 0.6 and corr_mult.get(best_cid, 1.0) >= 0.8:
            return [SuggestCategoryResult(
                category_id=best_cid,
                confidence=round(max(0.85, share), 4),
                exact=True,
                reason="повторяющийся платёж",
            )]

    # ── Уровень 3: похожие суммы (weighted k-NN) + категорийные факторы ─────
    now = datetime.utcnow()
    target_weekend = _is_weekend(target_date)

    # Пер-категорийная статистика всей истории: типичность суммы, круглость,
    # профиль кошелька, периодичность, «уже было сегодня»
    cat_amounts: dict = _defaultdict(list)
    cat_wallets: dict = _defaultdict(dict)
    cat_dates_all: dict = _defaultdict(set)
    for row in rows:
        cid = row.category_id
        cat_amounts[cid].append(float(row.amount))
        if row.wallet_id is not None:
            cat_wallets[cid][row.wallet_id] = cat_wallets[cid].get(row.wallet_id, 0) + 1
        if row.occurred_at:
            cat_dates_all[cid].add(row.occurred_at.date())

    cat_weight: dict = _defaultdict(float)
    cat_best_sim: dict = _defaultdict(float)   # лучшая близость суммы в категории
    cat_contrib: dict = _defaultdict(int)      # сколько заметно похожих операций
    cat_same_wallet: dict = _defaultdict(int)
    cat_dates_similar: dict = _defaultdict(set)

    for i, row in enumerate(rows):
        a_sim = _amount_similarity(amount, float(row.amount))
        if a_sim < 0.05:
            continue   # сумма совсем другая — не учитываем

        same_wallet = body.wallet_id is not None and row.wallet_id == body.wallet_id
        wallet_factor = 1.0 if same_wallet else _WALLET_OTHER

        # Циклическая близость по часу (σ≈3 ч), без жёстких корзин:
        # 11:59 и 12:01 — это одно и то же время
        if body.hour is not None and row.occurred_at:
            hd = abs(row.occurred_at.hour - body.hour)
            hd = min(hd, 24 - hd)
            time_factor = _TIME_OTHER + (1.0 - _TIME_OTHER) * _math.exp(-(hd * hd) / 18.0)
        else:
            time_factor = 1.0

        if row.occurred_at:
            age_days = max(0.0, (now - row.occurred_at).total_seconds() / 86400.0)
            recency = max(0.6, 1.0 - (age_days / _LOOKBACK_DAYS) * 0.4)
        else:
            recency = 0.8

        # День месяца: почти та же сумма в те же числа = повторяющийся платёж
        dom_factor = 1.0
        if row.occurred_at and a_sim >= 0.5 and _dom_close(target_date.day, row.occurred_at.day):
            dom_factor = _DOM_BONUS

        # Будни/выходной: продукты по субботам ≠ обед в будни
        dow_factor = 1.0
        if row.occurred_at and _is_weekend(row.occurred_at) != target_weekend:
            dow_factor = _DOW_OTHER

        # Совпадение описания — сильный буст даже без раннего выхода
        text_factor = 1.0
        if q_tokens:
            rt = row_tokens_cache.get(i)
            if rt is None:
                rt = _desc_tokens(row.description)
            if _text_match(q_tokens, rt):
                text_factor = _TEXT_BONUS

        w = a_sim * wallet_factor * time_factor * recency * dom_factor * dow_factor * text_factor
        cid = row.category_id
        cat_weight[cid] += w
        cat_best_sim[cid] = max(cat_best_sim[cid], a_sim)
        if a_sim >= 0.5:
            cat_contrib[cid] += 1
            if row.occurred_at:
                cat_dates_similar[cid].add(row.occurred_at.date())
        if same_wallet:
            cat_same_wallet[cid] += 1

    if sum(cat_weight.values()) < _MIN_TOTAL_WEIGHT:
        return []   # нет осмысленно похожей истории

    # ── Пост-факторы уровня категории ────────────────────────────────────────
    round_cls = _roundness_class(amount)
    adjusted: dict = {}
    cat_periodic: dict = _defaultdict(bool)
    for cid, w in cat_weight.items():
        m = 1.0
        amounts_c = cat_amounts[cid]
        n = len(amounts_c)

        # Типичность суммы для распределения категории (лог-нормаль)
        typ = _log_typicality(amount, amounts_c)
        if typ is not None:
            m *= 0.7 + 0.6 * typ

        # Круглость суммы против профиля категории
        if n >= 4:
            share_r = sum(1 for x in amounts_c if _roundness_class(x) == round_cls) / n
            m *= 0.9 + 0.2 * share_r

        # Профиль кошелька: категория, никогда не жившая на этом кошельке,
        # штрафуется; «родной» кошелёк категории — буст
        if body.wallet_id is not None and n >= 5:
            share_w = cat_wallets[cid].get(body.wallet_id, 0) / n
            m *= 0.75 + 0.5 * share_w

        # Периодичность: похожая сумма повторяется с шагом ~N дней,
        # и с последнего раза прошло примерно N
        dates_sim = sorted(cat_dates_similar[cid])
        if len(dates_sim) >= 3:
            gaps = [(dates_sim[j + 1] - dates_sim[j]).days for j in range(len(dates_sim) - 1)]
            gaps = [g for g in gaps if g >= 1]
            if gaps:
                med = _median(gaps)
                since_last = (target_date - dates_sim[-1]).days
                if 5 <= med <= 45 and abs(since_last - med) <= max(2.0, med * 0.2):
                    m *= 1.2
                    cat_periodic[cid] = True

        # «Уже было сегодня» для категорий с типичным шагом ≥2 дней
        if target_date in cat_dates_all[cid]:
            dates_all = sorted(cat_dates_all[cid])
            if len(dates_all) >= 3:
                gaps_all = [(dates_all[j + 1] - dates_all[j]).days for j in range(len(dates_all) - 1)]
                gaps_all = [g for g in gaps_all if g >= 1]
                if gaps_all and _median(gaps_all) >= 2:
                    m *= 0.8

        # Обучение на исправлениях: не повторяем свои ошибки
        m *= corr_mult.get(cid, 1.0)

        adjusted[cid] = w * m

    total_adj = sum(adjusted.values())
    if total_adj <= 0:
        return []

    results = []
    for cid, w in adjusted.items():
        confidence = w / total_adj
        near_exact = cat_best_sim[cid] >= _NEAR_EXACT
        # нужна реальная опора: либо ≥2 похожих операции, либо одна почти точная
        if not (cat_contrib[cid] >= 2 or near_exact):
            continue
        # слабые кандидаты не показываем даже чипом
        if confidence < 0.25:
            continue

        if near_exact:
            reason = "повторяющийся платёж"
        elif cat_periodic[cid]:
            reason = "регулярный платёж"
        elif cat_same_wallet[cid] >= 2:
            reason = "похожие траты с этого кошелька"
        else:
            reason = "по похожим суммам"

        results.append(SuggestCategoryResult(
            category_id=cid,
            confidence=round(confidence, 4),
            # exact управляет автоподстановкой — требуем и точную сумму, и уверенность
            exact=near_exact and confidence >= _MIN_CONFIDENCE,
            reason=reason,
        ))

    results.sort(key=lambda r: (r.exact, r.confidence), reverse=True)
    return results[:3]


# ── Create transaction ─────────────────────────────────────────────────────

class CreateTransactionRequest(BaseModel):
    operation_type: str           # INCOME | EXPENSE | TRANSFER
    amount: str                   # decimal string
    description: str = ""
    occurred_at: str | None = None        # ISO datetime
    # INCOME / EXPENSE
    wallet_id: int | None = None
    category_id: int | None = None
    # TRANSFER
    from_wallet_id: int | None = None
    to_wallet_id: int | None = None
    from_goal_id: int | None = None       # for SAVINGS wallets
    to_goal_id: int | None = None         # for SAVINGS wallets
    # Subscription coverage
    sub_subscription_id: int | None = None
    sub_payer_type: str | None = None     # SELF or MEMBER
    sub_member_id: int | None = None
    sub_start_date: str | None = None     # YYYY-MM-DD
    sub_end_date: str | None = None       # YYYY-MM-DD
    # Trip container link
    list_id: int | None = None
    # Бюджетный месяц-переопределение: YYYY-MM-DD (любой день месяца)
    budget_month: str | None = None
    # Что подсказал движок категорий (для обучения на исправлениях)
    suggested_category_id: int | None = None


@router.post("/transactions", status_code=201)
def create_transaction(body: CreateTransactionRequest, request: Request, db: Session = Depends(get_db)):
    from app.application.transactions import CreateTransactionUseCase, TransactionValidationError
    from app.application.subscriptions import (
        CreateSubscriptionCoverageUseCase,
        SubscriptionValidationError,
        validate_coverage_before_transaction,
    )
    user_id = get_user_id(request, db)

    try:
        amount = Decimal(body.amount)
    except InvalidOperation:
        raise HTTPException(status_code=400, detail="Некорректная сумма")

    # Parse occurred_at
    tx_occurred_at = None
    if body.occurred_at:
        try:
            tx_occurred_at = datetime.fromisoformat(body.occurred_at)
        except ValueError:
            raise HTTPException(status_code=400, detail="Некорректный формат даты occurred_at")

    # Pre-validate subscription coverage before creating the transaction
    has_coverage = bool(body.sub_subscription_id and body.sub_start_date and body.sub_end_date)
    if has_coverage:
        try:
            cov_start = date.fromisoformat(body.sub_start_date)
            cov_end = date.fromisoformat(body.sub_end_date)
            validate_coverage_before_transaction(
                db,
                account_id=user_id,
                subscription_id=body.sub_subscription_id,
                payer_type=body.sub_payer_type or "SELF",
                member_id=body.sub_member_id,
                start_date=cov_start,
                end_date=cov_end,
            )
        except SubscriptionValidationError as e:
            raise HTTPException(status_code=400, detail=str(e))

    uc = CreateTransactionUseCase(db)

    try:
        if body.operation_type == "INCOME":
            if not body.wallet_id:
                raise HTTPException(status_code=400, detail="Не указан кошелёк")
            # currency from wallet
            wallet = db.query(WalletBalance).filter(WalletBalance.wallet_id == body.wallet_id).first()
            currency = wallet.currency if wallet else "RUB"
            tx_id = uc.execute_income(
                account_id=user_id,
                wallet_id=body.wallet_id,
                amount=amount,
                currency=currency,
                category_id=body.category_id,
                description=body.description,
                occurred_at=tx_occurred_at,
                actor_user_id=user_id,
                to_goal_id=body.to_goal_id,
            )
        elif body.operation_type == "EXPENSE":
            if not body.wallet_id:
                raise HTTPException(status_code=400, detail="Не указан кошелёк")
            wallet = db.query(WalletBalance).filter(WalletBalance.wallet_id == body.wallet_id).first()
            currency = wallet.currency if wallet else "RUB"
            tx_id = uc.execute_expense(
                account_id=user_id,
                wallet_id=body.wallet_id,
                amount=amount,
                currency=currency,
                category_id=body.category_id,
                description=body.description,
                occurred_at=tx_occurred_at,
                actor_user_id=user_id,
            )
        elif body.operation_type == "TRANSFER":
            if not body.from_wallet_id or not body.to_wallet_id:
                raise HTTPException(status_code=400, detail="Укажите кошельки для перевода")
            wallet = db.query(WalletBalance).filter(WalletBalance.wallet_id == body.from_wallet_id).first()
            currency = wallet.currency if wallet else "RUB"
            tx_id = uc.execute_transfer(
                account_id=user_id,
                from_wallet_id=body.from_wallet_id,
                to_wallet_id=body.to_wallet_id,
                amount=amount,
                currency=currency,
                description=body.description,
                occurred_at=tx_occurred_at,
                actor_user_id=user_id,
                from_goal_id=body.from_goal_id,
                to_goal_id=body.to_goal_id,
            )
        else:
            raise HTTPException(status_code=400, detail="Неизвестный тип операции")
    except TransactionValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Create subscription coverage if fields were provided
    if has_coverage and tx_id:
        try:
            cov_start = date.fromisoformat(body.sub_start_date)
            cov_end = date.fromisoformat(body.sub_end_date)
            CreateSubscriptionCoverageUseCase(db).execute(
                account_id=user_id,
                subscription_id=body.sub_subscription_id,
                payer_type=body.sub_payer_type or "SELF",
                member_id=body.sub_member_id,
                transaction_id=tx_id,
                start_date=cov_start,
                end_date=cov_end,
            )
        except SubscriptionValidationError as e:
            raise HTTPException(status_code=400, detail=str(e))

    # Лог подсказки категории: принял юзер или исправил (обучение движка)
    if (body.suggested_category_id and tx_id
            and body.operation_type in ("INCOME", "EXPENSE")):
        from app.infrastructure.db.models import CategorySuggestLog
        db.add(CategorySuggestLog(
            account_id=user_id,
            operation_type=body.operation_type,
            amount=amount,
            wallet_id=body.wallet_id,
            suggested_category_id=body.suggested_category_id,
            chosen_category_id=body.category_id,
            accepted=(body.category_id == body.suggested_category_id),
        ))
        db.commit()

    # Set list_id / budget_month on the read model (not event-sourced)
    if (body.list_id is not None or body.budget_month) and tx_id:
        tx = db.query(TransactionFeed).filter(TransactionFeed.transaction_id == tx_id).first()
        if tx:
            if body.list_id is not None:
                tx.list_id = body.list_id
            if body.budget_month:
                tx.budget_month = _parse_budget_month(body.budget_month)
            db.commit()

    return {"id": tx_id}


def _parse_budget_month(value: str) -> date:
    """YYYY-MM-DD (любой день) → 1-е число месяца."""
    try:
        d = date.fromisoformat(value)
    except ValueError:
        raise HTTPException(status_code=400, detail="Некорректный budget_month")
    return d.replace(day=1)


# ── Update transaction ──────────────────────────────────────────────────────

class UpdateTransactionRequest(BaseModel):
    amount: str | None = None
    wallet_id: int | None = None
    category_id: int | None = None
    description: str | None = None
    list_id: int | None = None
    budget_month: str | None = None  # None в fields_set = сбросить (по дате)


@router.patch("/transactions/{transaction_id}")
def update_transaction(
    transaction_id: int,
    body: UpdateTransactionRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    from app.application.transactions import UpdateTransactionUseCase, TransactionValidationError
    user_id = get_user_id(request, db)

    changes: dict = {}
    if body.amount is not None:
        try:
            changes["amount"] = Decimal(body.amount)
        except InvalidOperation:
            raise HTTPException(status_code=400, detail="Некорректная сумма")
    if body.wallet_id is not None:
        changes["wallet_id"] = body.wallet_id
    if "category_id" in body.model_fields_set:
        changes["category_id"] = body.category_id  # None = clear category
    if body.description is not None:
        changes["description"] = body.description

    list_id_in_request = "list_id" in body.model_fields_set
    budget_month_in_request = "budget_month" in body.model_fields_set

    if not changes and not list_id_in_request and not budget_month_in_request:
        raise HTTPException(status_code=400, detail="Нет изменений")

    if changes:
        try:
            UpdateTransactionUseCase(db).execute(
                transaction_id=transaction_id,
                account_id=user_id,
                actor_user_id=user_id,
                **changes,
            )
        except TransactionValidationError as e:
            raise HTTPException(status_code=400, detail=str(e))

    # Update list_id / budget_month directly on the read model
    if list_id_in_request or budget_month_in_request:
        tx = db.query(TransactionFeed).filter(
            TransactionFeed.transaction_id == transaction_id,
            TransactionFeed.account_id == user_id,
        ).first()
        if not tx:
            raise HTTPException(status_code=404, detail="Транзакция не найдена")
        if list_id_in_request:
            tx.list_id = body.list_id
        if budget_month_in_request:
            tx.budget_month = _parse_budget_month(body.budget_month) if body.budget_month else None
        db.commit()

    return {"ok": True}


@router.delete("/transactions/{transaction_id}", status_code=204)
def cancel_transaction(transaction_id: int, request: Request, db: Session = Depends(get_db)):
    from app.application.transactions import CancelTransactionUseCase, TransactionValidationError
    user_id = get_user_id(request, db)
    try:
        CancelTransactionUseCase(db).execute(
            transaction_id=transaction_id,
            account_id=user_id,
            actor_user_id=user_id,
        )
    except TransactionValidationError as e:
        raise HTTPException(status_code=404, detail=str(e))
