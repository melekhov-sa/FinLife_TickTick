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
from app.infrastructure.db.models import WalletBalance, CategoryInfo, TransactionFeed

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


@router.get("/wallets", response_model=list[WalletItem])
def list_wallets(request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request)
    wallets = (
        db.query(WalletBalance)
        .filter(WalletBalance.account_id == user_id, WalletBalance.is_archived == False)
        .order_by(WalletBalance.title)
        .all()
    )
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
        )
        for w in wallets
    ]


class RenameWalletRequest(BaseModel):
    title: str


@router.patch("/wallets/{wallet_id}")
def rename_wallet(wallet_id: int, body: RenameWalletRequest, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request)
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
    user_id = get_user_id(request)
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
    user_id = get_user_id(request)
    wallet = db.query(WalletBalance).filter(
        WalletBalance.wallet_id == wallet_id, WalletBalance.account_id == user_id,
    ).first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    wallet.is_archived = True
    db.commit()


# ── Financial categories ───────────────────────────────────────────────────

class FinCategoryItem(BaseModel):
    category_id: int
    title: str
    category_type: str   # INCOME | EXPENSE
    parent_id: int | None
    is_frequent: bool = False


class FinCategoryItemFull(BaseModel):
    category_id: int
    title: str
    category_type: str   # INCOME | EXPENSE
    parent_id: int | None
    is_frequent: bool = False
    is_archived: bool = False
    is_system: bool = False


@router.get("/fin-categories", response_model=list[FinCategoryItemFull])
def list_fin_categories(
    request: Request,
    db: Session = Depends(get_db),
    include_archived: bool = Query(False),
):
    user_id = get_user_id(request)
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

    return [
        FinCategoryItemFull(
            category_id=c.category_id,
            title=c.title,
            category_type=c.category_type,
            parent_id=c.parent_id,
            is_frequent=c.category_id in freq_ids,
            is_archived=c.is_archived,
            is_system=c.is_system,
        )
        for c in cats
    ]


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
    user_id = get_user_id(request)
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
    )


class UpdateFinCategoryRequest(BaseModel):
    title: str | None = None


@router.patch("/fin-categories/{category_id}")
def update_fin_category(
    category_id: int,
    body: UpdateFinCategoryRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    from app.application.categories import UpdateCategoryUseCase, CategoryValidationError
    user_id = get_user_id(request)
    cat = db.query(CategoryInfo).filter(
        CategoryInfo.category_id == category_id,
        CategoryInfo.account_id == user_id,
    ).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Категория не найдена")
    title = body.title.strip() if body.title is not None else None
    if title is not None and not title:
        raise HTTPException(status_code=400, detail="Название не может быть пустым")
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
    user_id = get_user_id(request)
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
    user_id = get_user_id(request)
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


@router.get("/transactions", response_model=dict)
def list_transactions(
    request: Request,
    operation_type: str | None = Query(None),
    wallet_id: int | None = Query(None),
    category_id: int | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, le=200),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(request)

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
    if category_id:
        q = q.filter(TransactionFeed.category_id == category_id)
    if date_from:
        q = q.filter(TransactionFeed.occurred_at >= date_from)
    if date_to:
        q = q.filter(TransactionFeed.occurred_at <= f"{date_to}T23:59:59")
    if search and search.strip():
        q = q.filter(TransactionFeed.description.ilike(f"%{search.strip()}%"))

    total = q.count()
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
        )
        for t in transactions
    ]

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
        "items": [i.model_dump() for i in items],
    }


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


@router.post("/transactions", status_code=201)
def create_transaction(body: CreateTransactionRequest, request: Request, db: Session = Depends(get_db)):
    from app.application.transactions import CreateTransactionUseCase, TransactionValidationError
    from app.application.subscriptions import (
        CreateSubscriptionCoverageUseCase,
        SubscriptionValidationError,
        validate_coverage_before_transaction,
    )
    user_id = get_user_id(request)

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

    return {"id": tx_id}
