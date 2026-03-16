"""
GET /api/v2/budget?year=YYYY&month=M  — plan-vs-actual summary for one month.
"""
from datetime import date

from fastapi import APIRouter, Depends, Query, Request
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

    user_id = get_user_id(request)
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
