from decimal import Decimal

from fastapi import APIRouter, Depends, Request, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.v2.deps import get_user_id
from app.infrastructure.db.models import GoalInfo, GoalWalletBalance
from app.infrastructure.db.session import get_db

router = APIRouter()


class GoalItem(BaseModel):
    goal_id: int
    title: str
    currency: str
    target_amount: str | None
    current_balance: str
    percent: float | None
    wallet_count: int
    is_system: bool
    is_archived: bool


@router.get("/goals", response_model=list[GoalItem])
def list_goals(
    request: Request,
    db: Session = Depends(get_db),
    include_archived: bool = Query(False),
):
    user_id = get_user_id(request)

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
            is_system=g.is_system,
            is_archived=g.is_archived,
        ))
    return items
