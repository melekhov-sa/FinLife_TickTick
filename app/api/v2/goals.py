from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.v2.deps import get_user_id
from app.application.goals import (
    CreateGoalUseCase,
    UpdateGoalUseCase,
    ArchiveGoalUseCase,
    UnarchiveGoalUseCase,
    GoalValidationError,
)
from app.infrastructure.db.models import GoalInfo, GoalWalletBalance, WalletBalance
from app.infrastructure.db.session import get_db

router = APIRouter()


# ── Response schema ────────────────────────────────────────────────────────────

class GoalWalletItem(BaseModel):
    wallet_id: int
    title: str
    amount: str


class GoalItem(BaseModel):
    goal_id: int
    title: str
    currency: str
    target_amount: str | None
    current_balance: str
    percent: float | None
    wallet_count: int
    wallets: list[GoalWalletItem]
    is_system: bool
    is_archived: bool


# ── Request bodies ─────────────────────────────────────────────────────────────

class CreateGoalBody(BaseModel):
    title: str
    currency: str
    target_amount: str | None = None


class UpdateGoalBody(BaseModel):
    title: str | None = None
    target_amount: str | None = None


class ReorderItem(BaseModel):
    goal_id: int
    sort_order: int


# ── Helpers ────────────────────────────────────────────────────────────────────

def _build_goal_items(db: Session, user_id: int, include_archived: bool) -> list[GoalItem]:
    q = db.query(GoalInfo).filter(GoalInfo.account_id == user_id)
    if not include_archived:
        q = q.filter(GoalInfo.is_archived == False)
    goals = q.order_by(GoalInfo.sort_order, GoalInfo.title).all()

    balance_rows = (
        db.query(
            GoalWalletBalance.goal_id,
            func.sum(GoalWalletBalance.amount).label("total"),
            func.count(GoalWalletBalance.wallet_id).label("cnt"),
        )
        .filter(GoalWalletBalance.account_id == user_id)
        .group_by(GoalWalletBalance.goal_id)
        .all()
    )
    bal_map = {r.goal_id: (r.total or Decimal(0), r.cnt) for r in balance_rows}

    # Per-wallet breakdown for each goal (only wallets with amount > 0)
    wallet_rows = (
        db.query(
            GoalWalletBalance.goal_id,
            GoalWalletBalance.wallet_id,
            GoalWalletBalance.amount,
            WalletBalance.title,
        )
        .join(WalletBalance, WalletBalance.wallet_id == GoalWalletBalance.wallet_id)
        .filter(GoalWalletBalance.account_id == user_id, GoalWalletBalance.amount > 0)
        .order_by(GoalWalletBalance.goal_id, GoalWalletBalance.amount.desc())
        .all()
    )
    wallets_map: dict[int, list[GoalWalletItem]] = {}
    for row in wallet_rows:
        wallets_map.setdefault(row.goal_id, []).append(
            GoalWalletItem(wallet_id=row.wallet_id, title=row.title, amount=str(row.amount))
        )

    items = []
    for g in goals:
        total, cnt = bal_map.get(g.goal_id, (Decimal(0), 0))
        pct = None
        if g.target_amount and g.target_amount > 0:
            pct = round(float(total / g.target_amount * 100), 1)
        items.append(GoalItem(
            goal_id=g.goal_id,
            title=g.title,
            currency=g.currency,
            target_amount=str(g.target_amount) if g.target_amount else None,
            current_balance=str(total),
            percent=pct,
            wallet_count=cnt,
            wallets=wallets_map.get(g.goal_id, []),
            is_system=g.is_system,
            is_archived=g.is_archived,
        ))
    return items


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/goals", response_model=list[GoalItem])
def list_goals(
    request: Request,
    db: Session = Depends(get_db),
    include_archived: bool = Query(False),
):
    user_id = get_user_id(request, db)
    return _build_goal_items(db, user_id, include_archived)


@router.post("/goals", response_model=dict)
def create_goal(
    body: CreateGoalBody,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = get_user_id(request, db)
    try:
        goal_id = CreateGoalUseCase(db).execute(
            account_id=user_id,
            title=body.title,
            currency=body.currency,
            target_amount=body.target_amount,
            actor_user_id=user_id,
        )
    except GoalValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"goal_id": goal_id}


@router.patch("/goals/reorder")
def reorder_goals(
    items: list[ReorderItem],
    request: Request,
    db: Session = Depends(get_db),
):
    """Update sort_order for multiple goals at once."""
    user_id = get_user_id(request, db)
    for item in items:
        db.query(GoalInfo).filter(
            GoalInfo.goal_id == item.goal_id,
            GoalInfo.account_id == user_id,
        ).update({"sort_order": item.sort_order})
    db.commit()
    return {"ok": True}


@router.patch("/goals/{goal_id}")
def update_goal(
    goal_id: int,
    body: UpdateGoalBody,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = get_user_id(request, db)
    # Distinguish "field absent" from "field = null" using model_fields_set
    ta_sentinel = ... if "target_amount" not in body.model_fields_set else body.target_amount
    try:
        UpdateGoalUseCase(db).execute(
            goal_id=goal_id,
            account_id=user_id,
            title=body.title,
            target_amount=ta_sentinel,
            actor_user_id=user_id,
        )
    except GoalValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True}


@router.post("/goals/{goal_id}/archive")
def archive_goal(
    goal_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = get_user_id(request, db)
    try:
        ArchiveGoalUseCase(db).execute(
            goal_id=goal_id,
            account_id=user_id,
            actor_user_id=user_id,
        )
    except GoalValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True}


@router.post("/goals/{goal_id}/unarchive")
def unarchive_goal(
    goal_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = get_user_id(request, db)
    try:
        UnarchiveGoalUseCase(db).execute(
            goal_id=goal_id,
            account_id=user_id,
            actor_user_id=user_id,
        )
    except GoalValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True}


@router.post("/goals/rebuild-allocations")
def rebuild_goal_allocations(
    request: Request,
    db: Session = Depends(get_db),
):
    """Пересобрать распределение денег по целям с нуля (реплей событий).

    Ремонт для «зависших» денег: исторические доходы на SAVINGS-кошельки,
    созданные до появления to_goal_id у INCOME, при реплее падают в системную
    цель «Без цели» (фолбэк в проекторе). Идемпотентно.
    """
    from app.readmodels.projectors.goal_wallet_balances import GoalWalletBalancesProjector

    user_id = get_user_id(request, db)
    projector = GoalWalletBalancesProjector(db)
    projector.reset(user_id)
    db.commit()
    processed = projector.run(
        user_id,
        event_types=[
            "transaction_created",
            "transaction_updated",
            "transaction_cancelled",
            "wallet_created",
        ],
    )

    # Итог: сколько по целям на SAVINGS-кошельках и остаток вне целей
    totals = (
        db.query(
            WalletBalance.wallet_id,
            WalletBalance.title,
            WalletBalance.balance,
            func.coalesce(func.sum(GoalWalletBalance.amount), 0).label("by_goals"),
        )
        .outerjoin(GoalWalletBalance, GoalWalletBalance.wallet_id == WalletBalance.wallet_id)
        .filter(
            WalletBalance.account_id == user_id,
            WalletBalance.wallet_type == "SAVINGS",
            WalletBalance.is_archived == False,  # noqa: E712
        )
        .group_by(WalletBalance.wallet_id, WalletBalance.title, WalletBalance.balance)
        .all()
    )
    return {
        "ok": True,
        "processed_events": processed,
        "wallets": [
            {
                "wallet_id": t.wallet_id,
                "title": t.title,
                "balance": str(t.balance),
                "by_goals": str(t.by_goals),
                "hung": str(Decimal(str(t.balance)) - Decimal(str(t.by_goals))),
            }
            for t in totals
        ],
    }
