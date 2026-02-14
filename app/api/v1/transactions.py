"""
Transaction API endpoints
"""
from datetime import datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.infrastructure.db.models import User, TransactionFeed
from app.application.transactions import CreateTransactionUseCase


router = APIRouter(prefix="/api/v1/transactions", tags=["transactions"])


# === Request models ===

class CreateIncomeRequest(BaseModel):
    wallet_id: int
    amount: str  # Decimal as string
    currency: str
    category_id: int | None = None
    description: str
    occurred_at: datetime | None = None


class CreateExpenseRequest(BaseModel):
    wallet_id: int
    amount: str  # Decimal as string
    currency: str
    category_id: int | None = None
    description: str
    occurred_at: datetime | None = None


class CreateTransferRequest(BaseModel):
    from_wallet_id: int
    to_wallet_id: int
    amount: str  # Decimal as string
    currency: str
    description: str
    occurred_at: datetime | None = None


class TransactionResponse(BaseModel):
    transaction_id: int
    operation_type: str
    amount: str
    currency: str
    description: str
    occurred_at: datetime
    wallet_id: int | None = None
    category_id: int | None = None
    from_wallet_id: int | None = None
    to_wallet_id: int | None = None


# === Helper function ===

def _get_current_user(request: Request, db: Session) -> User:
    """Get current user from session"""
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user


# === Endpoints ===

@router.post("/income", response_model=TransactionResponse)
def create_income(
    request: Request,
    req: CreateIncomeRequest,
    db: Session = Depends(get_db)
):
    """Создать доход (INCOME)"""
    user = _get_current_user(request, db)

    use_case = CreateTransactionUseCase(db)
    transaction_id = use_case.execute_income(
        account_id=user.id,
        wallet_id=req.wallet_id,
        amount=Decimal(req.amount),
        currency=req.currency,
        category_id=req.category_id,
        description=req.description,
        occurred_at=req.occurred_at,
        actor_user_id=user.id
    )

    # Получить transaction из read model
    tx = db.query(TransactionFeed).filter(
        TransactionFeed.transaction_id == transaction_id
    ).first()

    if not tx:
        raise HTTPException(status_code=500, detail="Transaction creation failed")

    return TransactionResponse(
        transaction_id=tx.transaction_id,
        operation_type=tx.operation_type,
        amount=str(tx.amount),
        currency=tx.currency,
        description=tx.description,
        occurred_at=tx.occurred_at,
        wallet_id=tx.wallet_id,
        category_id=tx.category_id
    )


@router.post("/expense", response_model=TransactionResponse)
def create_expense(
    request: Request,
    req: CreateExpenseRequest,
    db: Session = Depends(get_db)
):
    """Создать расход (EXPENSE)"""
    user = _get_current_user(request, db)

    use_case = CreateTransactionUseCase(db)
    transaction_id = use_case.execute_expense(
        account_id=user.id,
        wallet_id=req.wallet_id,
        amount=Decimal(req.amount),
        currency=req.currency,
        category_id=req.category_id,
        description=req.description,
        occurred_at=req.occurred_at,
        actor_user_id=user.id
    )

    # Получить transaction из read model
    tx = db.query(TransactionFeed).filter(
        TransactionFeed.transaction_id == transaction_id
    ).first()

    if not tx:
        raise HTTPException(status_code=500, detail="Transaction creation failed")

    return TransactionResponse(
        transaction_id=tx.transaction_id,
        operation_type=tx.operation_type,
        amount=str(tx.amount),
        currency=tx.currency,
        description=tx.description,
        occurred_at=tx.occurred_at,
        wallet_id=tx.wallet_id,
        category_id=tx.category_id
    )


@router.post("/transfer", response_model=TransactionResponse)
def create_transfer(
    request: Request,
    req: CreateTransferRequest,
    db: Session = Depends(get_db)
):
    """Создать перевод (TRANSFER)"""
    user = _get_current_user(request, db)

    try:
        use_case = CreateTransactionUseCase(db)
        transaction_id = use_case.execute_transfer(
            account_id=user.id,
            from_wallet_id=req.from_wallet_id,
            to_wallet_id=req.to_wallet_id,
            amount=Decimal(req.amount),
            currency=req.currency,
            description=req.description,
            occurred_at=req.occurred_at,
            actor_user_id=user.id
        )
    except ValueError as e:
        # Валидация валют
        raise HTTPException(status_code=400, detail=str(e))

    # Получить transaction из read model
    tx = db.query(TransactionFeed).filter(
        TransactionFeed.transaction_id == transaction_id
    ).first()

    if not tx:
        raise HTTPException(status_code=500, detail="Transaction creation failed")

    return TransactionResponse(
        transaction_id=tx.transaction_id,
        operation_type=tx.operation_type,
        amount=str(tx.amount),
        currency=tx.currency,
        description=tx.description,
        occurred_at=tx.occurred_at,
        from_wallet_id=tx.from_wallet_id,
        to_wallet_id=tx.to_wallet_id
    )


@router.get("/", response_model=list[TransactionResponse])
def list_transactions(
    request: Request,
    db: Session = Depends(get_db),
    limit: int = 50,
    offset: int = 0
):
    """Лента операций (последние транзакции)"""
    user = _get_current_user(request, db)

    transactions = db.query(TransactionFeed).filter(
        TransactionFeed.account_id == user.id
    ).order_by(
        TransactionFeed.occurred_at.desc()
    ).limit(limit).offset(offset).all()

    return [
        TransactionResponse(
            transaction_id=tx.transaction_id,
            operation_type=tx.operation_type,
            amount=str(tx.amount),
            currency=tx.currency,
            description=tx.description,
            occurred_at=tx.occurred_at,
            wallet_id=tx.wallet_id,
            category_id=tx.category_id,
            from_wallet_id=tx.from_wallet_id,
            to_wallet_id=tx.to_wallet_id
        )
        for tx in transactions
    ]
