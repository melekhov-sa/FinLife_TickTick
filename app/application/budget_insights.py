"""
Подсказки по бюджету: не «что произошло», а «что это значит».

Данных в приложении хватало — десять аналитических срезов, матрица по
месяцам, план против факта. Не хватало выводов: графики показывают
цифры, а смысл достраивать приходилось самому.

Здесь считаются именно выводы, без ИИ. Каждый должен выдерживать вопрос
«почему ты так решил» — поэтому у всех есть числа, на которых он основан.
"""
import calendar
from dataclasses import dataclass, asdict
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

# Сколько закрытых месяцев берём как историю. Шесть — как у подсказки
# плана: меньше ловит случайность, больше тянет уже неактуальное.
HISTORY_MONTHS = 6

# Ниже этой суммы расхождения не обсуждаем: на мелких статьях проценты
# скачут от любой случайной покупки и подсказки превращаются в шум.
MIN_AMOUNT = Decimal("500")

# Насколько прогноз должен превысить план, чтобы это стоило упоминания.
PACE_TOLERANCE = Decimal("1.10")

# Сколько месяцев подряд должен повторяться перерасход, чтобы считать
# его закономерностью, а не невезением.
CHRONIC_MONTHS = 3

SEVERITY_ORDER = {"danger": 0, "warning": 1, "info": 2}


@dataclass
class Insight:
    code: str
    severity: str           # danger | warning | info
    category_id: int | None
    title: str
    detail: str

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


def _money(v: Decimal) -> str:
    return f"{int(round(v)):,}".replace(",", " ")


def _month_progress(year: int, month: int, today: date) -> tuple[int, int]:
    """Сколько дней месяца прошло и сколько в нём всего."""
    total = calendar.monthrange(year, month)[1]
    if (today.year, today.month) != (year, month):
        return total, total          # месяц закрыт
    return max(1, today.day), total


def _cells(row: dict) -> list[dict]:
    return row.get("cells") or []


def compute_budget_insights(
    db: Session,
    account_id: int,
    year: int,
    month: int,
    today: date | None = None,
) -> list[dict[str, Any]]:
    """Выводы по бюджету месяца. Пустой список — значит всё ровно."""
    from app.application.budget_matrix import BudgetMatrixService

    today = today or date.today()
    elapsed, days_total = _month_progress(year, month, today)
    is_open = elapsed < days_total

    # Берём текущий месяц плюс историю одним запросом.
    matrix = BudgetMatrixService(db).build(
        account_id=account_id,
        grain="month",
        range_count=HISTORY_MONTHS + 1,
        anchor_year=year,
        anchor_month=month,
    )

    out: list[Insight] = []
    for row in matrix.get("expense_rows", []):
        if row.get("category_id") is None:
            continue
        cells = _cells(row)
        if not cells:
            continue
        # Последняя ячейка — запрошенный месяц, перед ней история.
        cur = cells[-1]
        history = cells[:-1]
        out.extend(_row_insights(row, cur, history, elapsed, days_total, is_open))

    out.extend(_total_insights(matrix, elapsed, days_total, is_open))
    out.extend(_savings_insights(matrix))

    out.sort(key=lambda i: (SEVERITY_ORDER.get(i.severity, 9), i.title))
    return [i.as_dict() for i in out]


def _row_insights(
    row: dict, cur: dict, history: list[dict],
    elapsed: int, days_total: int, is_open: bool,
) -> list[Insight]:
    title = row["title"]
    cid = row["category_id"]
    plan = Decimal(str(cur.get("plan") or 0))
    fact = Decimal(str(cur.get("fact") or 0))
    res: list[Insight] = []

    # 1. Темп: при нынешнем расходе месяц закончится вот так.
    if is_open and plan > 0 and fact >= MIN_AMOUNT:
        projected = fact / elapsed * days_total
        if projected > plan * PACE_TOLERANCE:
            res.append(Insight(
                code="pace_over",
                severity="warning",
                category_id=cid,
                title=f"{title}: темп выше плана",
                detail=(
                    f"Потрачено {_money(fact)} за {elapsed} дн. "
                    f"При таком темпе выйдет {_money(projected)} против плана {_money(plan)}."
                ),
            ))

    # 2. Хронический перерасход: план занижен, а не месяц неудачный.
    over = [
        c for c in history
        if Decimal(str(c.get("plan") or 0)) > 0
        and Decimal(str(c.get("fact") or 0)) > Decimal(str(c.get("plan") or 0))
    ]
    if len(over) >= CHRONIC_MONTHS:
        typical = sum(Decimal(str(c.get("fact") or 0)) for c in over) / len(over)
        if typical >= MIN_AMOUNT:
            res.append(Insight(
                code="chronic_over",
                severity="info",
                category_id=cid,
                title=f"{title}: план регулярно не сходится",
                detail=(
                    f"Перерасход в {len(over)} из {len(history)} прошлых месяцев, "
                    f"в среднем выходит {_money(typical)}. Возможно, дело не в тратах, а в плане."
                ),
            ))

    # 3. План есть, трат нет — строка занимает место и искажает сумму плана.
    planned_unused = [
        c for c in history
        if Decimal(str(c.get("plan") or 0)) >= MIN_AMOUNT
        and Decimal(str(c.get("fact") or 0)) == 0
    ]
    if len(planned_unused) >= CHRONIC_MONTHS and plan >= MIN_AMOUNT and fact == 0:
        res.append(Insight(
            code="plan_unused",
            severity="info",
            category_id=cid,
            title=f"{title}: план не расходуется",
            detail=(
                f"{len(planned_unused)} месяцев подряд план стоит, а трат нет. "
                f"Эти {_money(plan)} зря заняты в бюджете."
            ),
        ))

    # 4. Резкий скачок относительно привычного.
    facts = [Decimal(str(c.get("fact") or 0)) for c in history if Decimal(str(c.get("fact") or 0)) > 0]
    if facts and fact >= MIN_AMOUNT and not is_open:
        typical = sorted(facts)[len(facts) // 2]       # медиана устойчивее среднего
        if typical > 0 and fact > typical * Decimal("1.5"):
            res.append(Insight(
                code="spike",
                severity="warning",
                category_id=cid,
                title=f"{title}: заметно больше обычного",
                detail=(
                    f"{_money(fact)} против привычных {_money(typical)} — "
                    f"в {fact / typical:.1f} раза больше."
                ),
            ))

    return res


def _savings_insights(matrix: dict) -> list[Insight]:
    """Снятие из отложенного.

    В «результат» месяца оно не входит — тот считается как доходы минус
    расходы. Значит деньги в месяце появились, а по таблице непонятно,
    откуда. Проговариваем прямо.
    """
    cells = _cells(matrix.get("withdrawal_totals", {}))
    if not cells:
        return []
    taken = Decimal(str(cells[-1].get("fact") or 0))
    if taken < MIN_AMOUNT:
        return []

    # Из каких целей именно — иначе непонятно, что трогали.
    names = [
        r["title"] for r in matrix.get("withdrawal_rows", [])
        if _cells(r) and Decimal(str(_cells(r)[-1].get("fact") or 0)) >= MIN_AMOUNT
    ]
    whence = ", ".join(names[:3]) if names else "накоплений"

    return [Insight(
        code="withdrawn_from_savings",
        severity="warning",
        category_id=None,
        title=f"Взято из отложенного: {_money(taken)}",
        detail=(
            f"Источник — {whence}. В результат месяца эта сумма не входит: "
            f"он считается как доходы минус расходы, накопления идут отдельно."
        ),
    )]


def _total_insights(
    matrix: dict, elapsed: int, days_total: int, is_open: bool,
) -> list[Insight]:
    cells = _cells(matrix.get("expense_totals", {}))
    if not cells:
        return []
    cur = cells[-1]
    plan = Decimal(str(cur.get("plan") or 0))
    fact = Decimal(str(cur.get("fact") or 0))
    if plan <= 0:
        return []

    if is_open:
        projected = fact / elapsed * days_total
        if projected > plan * PACE_TOLERANCE:
            return [Insight(
                code="total_pace_over",
                severity="danger",
                category_id=None,
                title="Месяц идёт с перерасходом",
                detail=(
                    f"Потрачено {_money(fact)} из {_money(plan)} за {elapsed} дн. из {days_total}. "
                    f"При таком темпе выйдет {_money(projected)}."
                ),
            )]
        return []

    if fact > plan:
        return [Insight(
            code="total_over",
            severity="danger",
            category_id=None,
            title="Месяц закрыт с перерасходом",
            detail=f"Потрачено {_money(fact)} при плане {_money(plan)} — на {_money(fact - plan)} больше.",
        )]
    return []
