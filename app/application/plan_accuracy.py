"""
Точность плана: классификация статей и общие карты факт/план.

Правила (согласовано с юзером):
- коридор ±15% от плана → авто-«точно»;
- перерасход больше +15% → всегда «мимо» (вердиктом не помечается);
- недорасход меньше −15% (в т.ч. факт 0) → по ручному вердикту:
  FIT («сэкономил/вписался») = точно, MISS = мимо, без вердикта = ждёт оценки.

Модуль общий: и KPI в статистике бюджета, и страница «Точность плана»
считают по одним и тем же картам и одной классификации.
"""
from datetime import date, datetime

from sqlalchemy import func, and_, or_, extract, cast, TIMESTAMP
from sqlalchemy.orm import Session

from app.infrastructure.db.models import (
    TransactionFeed, BudgetMonth, BudgetLine,
    OperationOccurrence, OperationTemplateModel, PlanAccuracyVerdict,
)

CORRIDOR = 0.15


def classify(plan: float, fact: float, verdict: str | None) -> str:
    """Статус ячейки: 'accurate' | 'miss' | 'pending' | 'skip'."""
    if plan <= 0:
        return "skip"
    lo = plan * (1 - CORRIDOR)
    hi = plan * (1 + CORRIDOR)
    if fact > hi:
        return "miss"          # перерасход вне коридора — всегда мимо
    if fact >= lo:
        return "accurate"      # в коридоре
    # недорасход вне коридора — по вердикту
    if verdict == "FIT":
        return "accurate"
    if verdict == "MISS":
        return "miss"
    return "pending"


def load_verdicts(db: Session, user_id: int) -> dict:
    """(year, month, category_id) → 'FIT' | 'MISS'."""
    rows = (
        db.query(PlanAccuracyVerdict)
        .filter(PlanAccuracyVerdict.account_id == user_id)
        .all()
    )
    return {(r.year, r.month, r.category_id): r.verdict for r in rows}


def build_fact_plan_maps(
    db: Session, user_id: int,
    months_window: list[tuple[int, int]],
    d_start: datetime, d_end: datetime,
) -> tuple[dict, dict, dict, dict]:
    """Возвращает (fact_map, plan_map, plan_ops_map, monthly_totals).

    Ключи map: (year, month, category_id, kind). monthly_totals: (year, month, kind).
    План месяца = строка бюджета + плановые операции (SKIPPED не считаем).
    Факт бакетится по budget_month-переопределению или дате операции.
    Логика 1-в-1 с budget_stats, чтобы точность считалась по тем же цифрам.
    """
    # ── Факт ──────────────────────────────────────────────────────────────────
    _bdt = func.coalesce(
        cast(TransactionFeed.budget_month, TIMESTAMP(timezone=True)),
        TransactionFeed.occurred_at,
    )
    _yr = extract("year", _bdt)
    _mo = extract("month", _bdt)
    fact_rows = (
        db.query(
            _yr.label("yr"), _mo.label("mo"),
            TransactionFeed.category_id, TransactionFeed.operation_type,
            func.sum(TransactionFeed.amount).label("total"),
        )
        .filter(
            TransactionFeed.account_id == user_id,
            TransactionFeed.operation_type.in_(["INCOME", "EXPENSE"]),
            _bdt >= d_start, _bdt < d_end,
        )
        .group_by(_yr, _mo, TransactionFeed.category_id, TransactionFeed.operation_type)
        .all()
    )
    fact_map: dict = {}
    monthly_totals: dict = {}
    for r in fact_rows:
        y, m = int(r.yr), int(r.mo)
        val = float(r.total)
        fact_map[(y, m, r.category_id, r.operation_type)] = \
            fact_map.get((y, m, r.category_id, r.operation_type), 0.0) + val
        monthly_totals[(y, m, r.operation_type)] = \
            monthly_totals.get((y, m, r.operation_type), 0.0) + val

    # ── План: строки бюджета ──────────────────────────────────────────────────
    plan_conditions = or_(
        *[and_(BudgetMonth.year == y, BudgetMonth.month == m) for y, m in months_window]
    )
    plan_rows = (
        db.query(
            BudgetMonth.year, BudgetMonth.month,
            BudgetLine.category_id, BudgetLine.kind,
            func.sum(BudgetLine.plan_amount).label("total"),
        )
        .join(BudgetLine, BudgetLine.budget_month_id == BudgetMonth.id)
        .filter(BudgetMonth.account_id == user_id, plan_conditions)
        .group_by(BudgetMonth.year, BudgetMonth.month, BudgetLine.category_id, BudgetLine.kind)
        .all()
    )
    plan_map: dict = {}
    for r in plan_rows:
        plan_map[(r.year, r.month, r.category_id, r.kind)] = float(r.total)

    # ── План: плановые операции (сверх строки бюджета) ────────────────────────
    w_start = date(months_window[0][0], months_window[0][1], 1)
    _po_yr = extract("year", OperationOccurrence.scheduled_date)
    _po_mo = extract("month", OperationOccurrence.scheduled_date)
    po_rows = (
        db.query(
            _po_yr.label("yr"), _po_mo.label("mo"),
            OperationTemplateModel.category_id, OperationTemplateModel.kind,
            func.sum(OperationTemplateModel.amount).label("total"),
        )
        .join(OperationTemplateModel,
              OperationTemplateModel.template_id == OperationOccurrence.template_id)
        .filter(
            OperationOccurrence.account_id == user_id,
            OperationOccurrence.status != "SKIPPED",
            OperationOccurrence.scheduled_date >= w_start,
            OperationOccurrence.scheduled_date < d_end.date(),
            OperationTemplateModel.kind.in_(["INCOME", "EXPENSE"]),
            OperationTemplateModel.category_id != None,  # noqa: E711
            OperationTemplateModel.amount != None,  # noqa: E711
        )
        .group_by(_po_yr, _po_mo, OperationTemplateModel.category_id, OperationTemplateModel.kind)
        .all()
    )
    plan_ops_map: dict = {}
    for r in po_rows:
        key = (int(r.yr), int(r.mo), r.category_id, r.kind)
        plan_ops_map[key] = float(r.total)
        plan_map[key] = plan_map.get(key, 0.0) + float(r.total)

    return fact_map, plan_map, plan_ops_map, monthly_totals


def month_key_le(a: tuple[int, int], b: tuple[int, int]) -> bool:
    """a <= b по (год, месяц)."""
    return (a[0], a[1]) <= (b[0], b[1])
