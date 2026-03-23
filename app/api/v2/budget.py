"""
GET /api/v2/budget?year=YYYY&month=M  — plan-vs-actual summary for one month.
GET /api/v2/budget/matrix             — full multi-period budget matrix.
POST /api/v2/budget/plan              — save plan lines for a month.
"""
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.infrastructure.db.session import get_db
from app.api.v2.deps import get_user_id

router = APIRouter()

MONTH_NAMES_RU = [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
]


@router.get("/budget")
def budget_summary(
    request: Request,
    year: int | None = Query(None),
    month: int | None = Query(None),
    db: Session = Depends(get_db),
):
    from app.application.budget_matrix import BudgetMatrixService

    user_id = get_user_id(request, db)
    today = date.today()
    year = year or today.year
    month = month or today.month

    svc = BudgetMatrixService(db)
    matrix = svc.build(
        account_id=user_id,
        grain="month",
        range_count=1,
        anchor_year=year,
        anchor_month=month,
    )

    def _cell(cells):
        if not cells:
            return {"plan": 0.0, "fact": 0.0}
        c = cells[0]
        return {"plan": float(c["plan"]), "fact": float(c["fact"])}

    def _row(r):
        c = _cell(r.get("cells", []))
        return {
            "category_id": r["category_id"],
            "title": r["title"],
            "depth": r.get("depth", 0),
            "parent_id": r.get("parent_id"),
            "plan": c["plan"],
            "fact": c["fact"],
        }

    income_rows  = [_row(r) for r in matrix["income_rows"]  if r.get("category_id") is not None]
    expense_rows = [_row(r) for r in matrix["expense_rows"] if r.get("category_id") is not None]

    # "other" uncategorised rows
    other_inc = matrix.get("other_income")
    other_exp = matrix.get("other_expense")
    if other_inc:
        c = _cell(other_inc.get("cells", []))
        if c["plan"] or c["fact"]:
            income_rows.append({"category_id": None, "title": "Прочие доходы", "depth": 0,
                                 "parent_id": None, "plan": c["plan"], "fact": c["fact"]})
    if other_exp:
        c = _cell(other_exp.get("cells", []))
        if c["plan"] or c["fact"]:
            expense_rows.append({"category_id": None, "title": "Прочие расходы", "depth": 0,
                                  "parent_id": None, "plan": c["plan"], "fact": c["fact"]})

    inc_tot = _cell(matrix["income_totals"].get("cells", []))
    exp_tot = _cell(matrix["expense_totals"].get("cells", []))

    return {
        "year": year,
        "month": month,
        "period_label": f"{MONTH_NAMES_RU[month - 1]} {year}",
        "income_total": inc_tot,
        "expense_total": exp_tot,
        "income_rows": income_rows,
        "expense_rows": expense_rows,
    }


@router.get("/budget/matrix")
def budget_matrix(
    request: Request,
    grain: str = Query("month"),
    range_count: int = Query(4, ge=1, le=12),
    year: int | None = Query(None),
    month: int | None = Query(None),
    variant_id: int | None = Query(None),
    avg_months: int = Query(0),
    db: Session = Depends(get_db),
):
    from app.application.budget_matrix import BudgetMatrixService
    from app.application.budget import (
        get_active_variant, get_hidden_category_ids,
        get_hidden_goal_ids, get_hidden_withdrawal_goal_ids,
        clamp_granularity, EnsureBudgetMonthUseCase,
    )
    from datetime import date as date_type

    user_id = get_user_id(request, db)
    today = date_type.today()

    if year is None:
        year = today.year
    if month is None:
        month = today.month

    variant = get_active_variant(db, user_id, variant_id)
    base_gran = variant.base_granularity if variant else "MONTH"
    grain = clamp_granularity(grain, base_gran)

    variant_id_resolved = variant.id if variant else None

    hidden_cats = get_hidden_category_ids(db, variant_id_resolved) if variant_id_resolved else set()
    hidden_goals = get_hidden_goal_ids(db, variant_id_resolved) if variant_id_resolved else set()
    hidden_wgoals = get_hidden_withdrawal_goal_ids(db, variant_id_resolved) if variant_id_resolved else set()

    if grain == "month":
        for offset in range(range_count):
            m = month + offset
            y = year
            while m > 12:
                m -= 12
                y += 1
            EnsureBudgetMonthUseCase(db).execute(
                account_id=user_id,
                year=y, month=m,
                budget_variant_id=variant_id_resolved,
            )

    view = BudgetMatrixService(db).build(
        account_id=user_id,
        grain=grain,
        range_count=range_count,
        anchor_year=year,
        anchor_month=month,
        base_granularity=base_gran,
        budget_variant_id=variant_id_resolved,
        hidden_category_ids=hidden_cats,
        hidden_goal_ids=hidden_goals,
        hidden_withdrawal_goal_ids=hidden_wgoals,
        avg_months=avg_months,
    )

    def serialize(obj):
        if isinstance(obj, dict):
            return {k: serialize(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [serialize(v) for v in obj]
        elif isinstance(obj, Decimal):
            return float(obj)
        elif isinstance(obj, date_type):
            return obj.isoformat()
        return obj

    return serialize(view)


class BudgetPlanLine(BaseModel):
    category_id: int
    kind: str  # INCOME or EXPENSE
    plan_amount: str  # Decimal as string
    note: str | None = None


class SaveBudgetPlanRequest(BaseModel):
    year: int
    month: int
    lines: list[BudgetPlanLine]
    variant_id: int | None = None


@router.post("/budget/plan")
def save_budget_plan(body: SaveBudgetPlanRequest, request: Request, db: Session = Depends(get_db)):
    from app.application.budget import SaveBudgetPlanUseCase, get_active_variant
    user_id = get_user_id(request, db)

    variant = get_active_variant(db, user_id, body.variant_id)
    variant_id = variant.id if variant else None

    lines = [
        {"category_id": l.category_id, "kind": l.kind, "plan_amount": l.plan_amount, "note": l.note}
        for l in body.lines
    ]

    SaveBudgetPlanUseCase(db).execute(
        account_id=user_id,
        year=body.year,
        month=body.month,
        lines=lines,
        actor_user_id=user_id,
        budget_variant_id=variant_id,
    )
    return {"ok": True}


class ReorderItem(BaseModel):
    category_id: int
    sort_order: int


class ReorderRequest(BaseModel):
    items: list[ReorderItem]


@router.post("/categories/reorder")
def reorder_categories(body: ReorderRequest, request: Request, db: Session = Depends(get_db)):
    from app.infrastructure.db.models import CategoryInfo
    user_id = get_user_id(request, db)

    for item in body.items:
        db.query(CategoryInfo).filter(
            CategoryInfo.category_id == item.category_id,
            CategoryInfo.account_id == user_id,
        ).update({"sort_order": item.sort_order})

    db.commit()
    return {"ok": True}


class GoalPlanLine(BaseModel):
    goal_id: int
    plan_amount: str
    note: str | None = None


class SaveGoalPlanRequest(BaseModel):
    year: int
    month: int
    lines: list[GoalPlanLine]
    variant_id: int | None = None
    plan_type: str = "goal"  # "goal" or "withdrawal"


@router.post("/budget/goal-plan")
def save_goal_plan(body: SaveGoalPlanRequest, request: Request, db: Session = Depends(get_db)):
    from app.application.budget import SaveGoalPlansUseCase, SaveWithdrawalPlansUseCase, get_active_variant
    user_id = get_user_id(request, db)

    variant = get_active_variant(db, user_id, body.variant_id)
    variant_id = variant.id if variant else None

    plans = [
        {"goal_id": l.goal_id, "plan_amount": l.plan_amount, "note": l.note}
        for l in body.lines
    ]

    UseCase = SaveWithdrawalPlansUseCase if body.plan_type == "withdrawal" else SaveGoalPlansUseCase
    UseCase(db).execute(
        account_id=user_id,
        year=body.year,
        month=body.month,
        goal_plans=plans,
        actor_user_id=user_id,
        budget_variant_id=variant_id,
    )
    return {"ok": True}
