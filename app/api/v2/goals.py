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
from app.application.goal_saving_plans import (
    SavingPlanError,
    month_key,
    parse_amount,
    plan_schedule,
    validate_window,
)
from app.infrastructure.db.models import (
    GoalInfo,
    GoalSavingPlan,
    GoalWalletBalance,
    WalletBalance,
)
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


# ── Накопительные планы ───────────────────────────────────────────────
#
# «К декабрю надо 30 000, откладывать с января» — бюджет сам подставляет
# помесячный взнос в строку «Отложить». Расчёт живёт в
# app/application/goal_saving_plans.py и ничего не хранит, поэтому здесь
# только сами условия плана.


class SavingPlanSchedule(BaseModel):
    first_month: str
    last_month: str
    months: int
    monthly_amount: str


class SavingPlanItem(BaseModel):
    id: int
    goal_id: int
    target_amount: str
    start_month: str
    target_month: str
    save_in_target_month: bool
    repeat_yearly: bool
    is_active: bool
    schedule: SavingPlanSchedule | None
    # Разовый план с прошедшим сроком. В бюджет он уже ничего не
    # подставляет, но окно у него остаётся — без этого признака список
    # показывал бы его как действующий.
    is_finished: bool


class SavingPlanBody(BaseModel):
    goal_id: int
    target_amount: str
    start_month: str
    target_month: str
    save_in_target_month: bool = False
    repeat_yearly: bool = False


class UpdateSavingPlanBody(BaseModel):
    target_amount: str | None = None
    start_month: str | None = None
    target_month: str | None = None
    save_in_target_month: bool | None = None
    repeat_yearly: bool | None = None
    is_active: bool | None = None


class PreviewSavingPlanBody(BaseModel):
    target_amount: str
    start_month: str
    target_month: str
    save_in_target_month: bool = False
    repeat_yearly: bool = False


def _this_month() -> str:
    from datetime import date as date_type

    today = date_type.today()
    return month_key(today.year, today.month)


def _schedule_payload(sched: dict | None) -> SavingPlanSchedule | None:
    if sched is None:
        return None
    return SavingPlanSchedule(
        first_month=sched["first_month"],
        last_month=sched["last_month"],
        months=sched["months"],
        monthly_amount=str(sched["monthly_amount"]),
    )


def _plan_item(plan: GoalSavingPlan) -> SavingPlanItem:
    sched = plan_schedule(plan, _this_month())
    finished = (
        not plan.repeat_yearly
        and sched is not None
        and sched["last_month"] < _this_month()
    )
    return SavingPlanItem(
        id=plan.id,
        goal_id=plan.goal_id,
        target_amount=str(plan.target_amount),
        start_month=plan.start_month,
        target_month=plan.target_month,
        save_in_target_month=plan.save_in_target_month,
        repeat_yearly=plan.repeat_yearly,
        is_active=plan.is_active,
        schedule=_schedule_payload(sched),
        is_finished=finished,
    )


def _own_plan(db: Session, plan_id: int, account_id: int) -> GoalSavingPlan:
    plan = (
        db.query(GoalSavingPlan)
        .filter(GoalSavingPlan.id == plan_id, GoalSavingPlan.account_id == account_id)
        .first()
    )
    if plan is None:
        raise HTTPException(status_code=404, detail="План не найден")
    return plan


@router.get("/goals/saving-plans", response_model=list[SavingPlanItem])
def list_saving_plans(
    request: Request,
    db: Session = Depends(get_db),
    goal_id: int | None = Query(None),
):
    user_id = get_user_id(request, db)
    q = db.query(GoalSavingPlan).filter(GoalSavingPlan.account_id == user_id)
    if goal_id is not None:
        q = q.filter(GoalSavingPlan.goal_id == goal_id)
    plans = q.order_by(GoalSavingPlan.target_month, GoalSavingPlan.id).all()
    return [_plan_item(p) for p in plans]


@router.post("/goals/saving-plans/preview", response_model=SavingPlanSchedule | None)
def preview_saving_plan(
    body: PreviewSavingPlanBody,
    request: Request,
    db: Session = Depends(get_db),
):
    """Расчёт до сохранения: по сколько в месяц и сколько месяцев."""
    get_user_id(request, db)
    try:
        amount = parse_amount(body.target_amount)
        validate_window(body.start_month, body.target_month, body.save_in_target_month)
    except SavingPlanError as e:
        raise HTTPException(status_code=400, detail=str(e))

    draft = GoalSavingPlan(
        target_amount=amount,
        start_month=body.start_month,
        target_month=body.target_month,
        save_in_target_month=body.save_in_target_month,
        repeat_yearly=body.repeat_yearly,
    )
    return _schedule_payload(plan_schedule(draft, _this_month()))


@router.post("/goals/saving-plans", response_model=SavingPlanItem)
def create_saving_plan(
    body: SavingPlanBody,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = get_user_id(request, db)
    goal = (
        db.query(GoalInfo)
        .filter(GoalInfo.goal_id == body.goal_id, GoalInfo.account_id == user_id)
        .first()
    )
    if goal is None:
        raise HTTPException(status_code=404, detail="Цель не найдена")
    if goal.is_archived:
        raise HTTPException(status_code=400, detail="Цель в архиве")

    try:
        amount = parse_amount(body.target_amount)
        validate_window(body.start_month, body.target_month, body.save_in_target_month)
    except SavingPlanError as e:
        raise HTTPException(status_code=400, detail=str(e))

    plan = GoalSavingPlan(
        account_id=user_id,
        goal_id=body.goal_id,
        target_amount=amount,
        start_month=body.start_month,
        target_month=body.target_month,
        save_in_target_month=body.save_in_target_month,
        repeat_yearly=body.repeat_yearly,
        is_active=True,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return _plan_item(plan)


@router.patch("/goals/saving-plans/{plan_id}", response_model=SavingPlanItem)
def update_saving_plan(
    plan_id: int,
    body: UpdateSavingPlanBody,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = get_user_id(request, db)
    plan = _own_plan(db, plan_id, user_id)

    # Окно проверяем целиком: менять можно одно поле, а осмысленность
    # зависит от всех трёх сразу.
    start = body.start_month if body.start_month is not None else plan.start_month
    target = body.target_month if body.target_month is not None else plan.target_month
    in_target = (
        body.save_in_target_month
        if body.save_in_target_month is not None
        else plan.save_in_target_month
    )
    try:
        amount = parse_amount(body.target_amount) if body.target_amount is not None else None
        validate_window(start, target, in_target)
    except SavingPlanError as e:
        # Проверяем до записи: иначе отказ оставил бы в сессии
        # недоправленный объект.
        raise HTTPException(status_code=400, detail=str(e))

    if amount is not None:
        plan.target_amount = amount
    plan.start_month = start
    plan.target_month = target
    plan.save_in_target_month = in_target
    if body.repeat_yearly is not None:
        plan.repeat_yearly = body.repeat_yearly
    if body.is_active is not None:
        plan.is_active = body.is_active

    db.commit()
    db.refresh(plan)
    return _plan_item(plan)


@router.delete("/goals/saving-plans/{plan_id}")
def delete_saving_plan(
    plan_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = get_user_id(request, db)
    plan = _own_plan(db, plan_id, user_id)
    db.delete(plan)
    db.commit()
    return {"ok": True}
