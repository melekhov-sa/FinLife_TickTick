"""
Wallet API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.infrastructure.db.models import User, WalletBalance
from app.application.wallets import CreateWalletUseCase, ArchiveWalletUseCase
from app.utils.validation import validate_and_normalize_amount


router = APIRouter(prefix="/api/v1/wallets", tags=["wallets"])


# === Request/Response models ===

class CreateWalletRequest(BaseModel):
    title: str
    currency: str  # USD, EUR, RUB
    wallet_type: str = "REGULAR"  # REGULAR, CREDIT, SAVINGS
    initial_balance: str = "0"  # Начальный баланс

    @field_validator("initial_balance")
    @classmethod
    def validate_balance(cls, v: str) -> str:
        """Валидация и нормализация баланса (точка/запятая, макс 2 знака)"""
        return validate_and_normalize_amount(v, max_decimal_places=2)


class WalletResponse(BaseModel):
    wallet_id: int
    title: str
    currency: str
    wallet_type: str
    balance: str  # Decimal as string
    is_archived: bool


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

@router.post("/", response_model=WalletResponse)
def create_wallet(
    request: Request,
    req: CreateWalletRequest,
    db: Session = Depends(get_db)
):
    """Создать новый кошелёк"""
    user = _get_current_user(request, db)

    use_case = CreateWalletUseCase(db)
    wallet_id = use_case.execute(
        account_id=user.id,  # user.id = account_id
        title=req.title,
        currency=req.currency,
        wallet_type=req.wallet_type,
        initial_balance=req.initial_balance,
        actor_user_id=user.id
    )

    # Получить wallet из read model
    wallet = db.query(WalletBalance).filter(
        WalletBalance.wallet_id == wallet_id
    ).first()

    if not wallet:
        raise HTTPException(status_code=500, detail="Wallet creation failed")

    return WalletResponse(
        wallet_id=wallet.wallet_id,
        title=wallet.title,
        currency=wallet.currency,
        wallet_type=wallet.wallet_type,
        balance=str(wallet.balance),
        is_archived=wallet.is_archived
    )


@router.get("/", response_model=list[WalletResponse])
def list_wallets(
    request: Request,
    db: Session = Depends(get_db),
    include_archived: bool = False
):
    """Список всех кошельков"""
    user = _get_current_user(request, db)

    query = db.query(WalletBalance).filter(
        WalletBalance.account_id == user.id
    )

    if not include_archived:
        query = query.filter(WalletBalance.is_archived == False)

    wallets = query.all()

    return [
        WalletResponse(
            wallet_id=w.wallet_id,
            title=w.title,
            currency=w.currency,
            wallet_type=w.wallet_type,
            balance=str(w.balance),
            is_archived=w.is_archived
        )
        for w in wallets
    ]


@router.post("/{wallet_id}/archive")
def archive_wallet(
    request: Request,
    wallet_id: int,
    db: Session = Depends(get_db)
):
    """Архивировать кошелёк"""
    user = _get_current_user(request, db)

    use_case = ArchiveWalletUseCase(db)
    use_case.execute(
        wallet_id=wallet_id,
        account_id=user.id,
        actor_user_id=user.id
    )

    return {"status": "archived"}
