"""
Точность плана — JSON API.

GET  /api/v2/plan-accuracy?months=N — по закрытым месяцам: выбивающиеся из
     плана статьи расходов + их вердикты + итоговая точность.
POST /api/v2/plan-accuracy/verdict — поставить/снять вердикт по (месяц, статья).
"""
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.infrastructure.db.session import get_db
from app.api.v2.deps import get_user_id
from app.infrastructure.db.models import CategoryInfo, PlanAccuracyVerdict
from app.application.plan_accuracy import (
    CORRIDOR, classify, load_verdicts, build_fact_plan_maps,
)

router = APIRouter(prefix="/plan-accuracy", tags=["plan-accuracy"])

_SHORT_MONTHS = {
    1: "Янв", 2: "Фев", 3: "Мар", 4: "Апр", 5: "Май", 6: "Июн",
    7: "Июл", 8: "Авг", 9: "Сен", 10: "Окт", 11: "Ноя", 12: "Дек",
}


def _months_back(today: date, n: int) -> list[tuple[int, int]]:
    out = []
    for i in range(n - 1, -1, -1):
        m, y = today.month - i, today.year
        while m <= 0:
            m += 12
            y -= 1
        out.append((y, m))
    return out


@router.get("")
def get_plan_accuracy(
    request: Request,
    months: int = Query(6, ge=1, le=24),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(request, db)
    today = date.today()

    window = _months_back(today, months)
    cur = (today.year, today.month)
    closed = [ym for ym in window if ym != cur]  # текущий месяц не оцениваем
    if not closed:
        return {"corridor_pct": round(CORRIDOR * 100), "accuracy": None,
                "counts": {"accurate": 0, "miss": 0, "pending": 0}, "months": []}

    d_start = datetime(window[0][0], window[0][1], 1)
    d_end = datetime(cur[0], cur[1], 1)  # до 1-го числа текущего месяца

    fact_map, plan_map, _, _ = build_fact_plan_maps(db, user_id, window, d_start, d_end)
    verdicts = load_verdicts(db, user_id)

    cats = {
        c.category_id: c
        for c in db.query(CategoryInfo).filter(
            CategoryInfo.account_id == user_id,
            CategoryInfo.category_type == "EXPENSE",
        ).all()
    }

    tot = {"accurate": 0, "miss": 0, "pending": 0}
    months_out = []
    for (y, m) in reversed(closed):  # свежие месяцы сверху
        rows = []
        for cid, cat in cats.items():
            plan = plan_map.get((y, m, cid, "EXPENSE"), 0.0)
            if plan <= 0:
                continue
            fact = fact_map.get((y, m, cid, "EXPENSE"), 0.0)
            verdict = verdicts.get((y, m, cid))
            status = classify(plan, fact, verdict)
            if status == "skip":
                continue
            tot[status] = tot.get(status, 0) + 1
            # в списке показываем только выбивающиеся (в коридоре — не тревожим)
            in_corridor = plan * (1 - CORRIDOR) <= fact <= plan * (1 + CORRIDOR)
            if in_corridor:
                continue
            rows.append({
                "category_id": cid,
                "title": cat.title,
                "color": cat.color,
                "plan": round(plan),
                "fact": round(fact),
                "deviation_pct": round((fact - plan) / plan * 100) if plan else 0,
                "over": fact > plan,           # перерасход — вердикт недоступен
                "status": status,              # miss | pending | accurate
                "verdict": verdict,            # FIT | MISS | None
            })
        if rows:
            # незакрытые/выбивающиеся сортируем: сначала ждущие оценки
            rows.sort(key=lambda r: (r["status"] != "pending", -abs(r["deviation_pct"])))
            months_out.append({
                "year": y, "month": m,
                "label": f"{_SHORT_MONTHS[m]} {y}",
                "rows": rows,
            })

    reviewed = tot["accurate"] + tot["miss"]
    accuracy = round(tot["accurate"] / reviewed * 100) if reviewed else None
    return {
        "corridor_pct": round(CORRIDOR * 100),
        "accuracy": accuracy,
        "counts": tot,
        "months": months_out,
    }


class VerdictIn(BaseModel):
    year: int
    month: int
    category_id: int
    verdict: str | None  # FIT | MISS | null (снять)


@router.post("/verdict")
def set_verdict(body: VerdictIn, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    if body.verdict not in ("FIT", "MISS", None):
        raise HTTPException(400, "verdict: FIT, MISS или null")

    row = db.query(PlanAccuracyVerdict).filter(
        PlanAccuracyVerdict.account_id == user_id,
        PlanAccuracyVerdict.year == body.year,
        PlanAccuracyVerdict.month == body.month,
        PlanAccuracyVerdict.category_id == body.category_id,
    ).first()

    if body.verdict is None:
        if row:
            db.delete(row)
            db.commit()
        return {"ok": True, "verdict": None}

    if row:
        row.verdict = body.verdict
    else:
        db.add(PlanAccuracyVerdict(
            account_id=user_id, year=body.year, month=body.month,
            category_id=body.category_id, verdict=body.verdict,
        ))
    db.commit()
    return {"ok": True, "verdict": body.verdict}
