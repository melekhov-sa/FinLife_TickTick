"""
Помесячный взнос по накопительным планам целей.

Раньше суммы в строке «Отложить» вбивались руками в каждую клетку.
Теперь можно сказать «к декабрю нужно 30 000, копить с января», и взнос
считается сам.

Расчёт намеренно без состояния: ничего не хранится и не дописывается
фоном. Поэтому ежегодный режим получается даром — прошёл целевой месяц,
окно само сдвинулось на год, — а правка срока не оставляет в базе
устаревших цифр.
"""
import re
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation

from sqlalchemy.orm import Session

from app.infrastructure.db.models import GoalSavingPlan

_ZERO = Decimal("0")
MONTH_RE = re.compile(r"^\d{4}-(?:0[1-9]|1[0-2])$")


class SavingPlanError(ValueError):
    """Понятная человеку причина, почему план не принят."""


def month_key(year: int, month: int) -> str:
    return f"{year:04d}-{month:02d}"


def _to_index(key: str) -> int:
    """YYYY-MM → порядковый номер месяца. Нужен для арифметики окон."""
    y, m = key.split("-")
    return int(y) * 12 + (int(m) - 1)


def _shift_years(key: str, years: int) -> str:
    y, m = key.split("-")
    return month_key(int(y) + years, int(m))


def _from_index(idx: int) -> str:
    return month_key(idx // 12, idx % 12 + 1)


def window_bounds(plan: GoalSavingPlan, at_month: str) -> tuple[int, int] | None:
    """Границы окна накопления в номерах месяцев, уже с учётом повтора.

    Возвращает (первый, последний) включительно или None, если копить
    нечего: разовый план отработал, или окно пустое.
    """
    start = plan.start_month
    target = plan.target_month

    if plan.repeat_yearly:
        # Сдвигаем цикл вперёд, пока целевой месяц не окажется не раньше
        # запрошенного: прошлогодний график интересен только как история.
        guard = 0
        while _to_index(target) < _to_index(at_month) and guard < 100:
            start = _shift_years(start, 1)
            target = _shift_years(target, 1)
            guard += 1

    first = _to_index(start)
    last = _to_index(target)
    if not plan.save_in_target_month:
        last -= 1          # деньги должны лежать к началу целевого месяца
    if last < first:
        return None
    return first, last


def monthly_amount(plan: GoalSavingPlan, at_month: str) -> Decimal:
    """Взнос по этому плану в указанном месяце. Ноль — значит не копим."""
    bounds = window_bounds(plan, at_month)
    if bounds is None:
        return _ZERO

    first, last = bounds
    idx = _to_index(at_month)
    if idx < first or idx > last:
        return _ZERO

    months = last - first + 1
    amount = Decimal(str(plan.target_amount)) / months
    return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def plan_schedule(plan: GoalSavingPlan, at_month: str) -> dict | None:
    """График текущего (или ближайшего) цикла: с какого по какой месяц,
    сколько месяцев и по сколько в месяц.

    Нужен форме настройки, чтобы показать расчёт до сохранения, и
    карточке цели. None — копить нечего.
    """
    bounds = window_bounds(plan, at_month)
    if bounds is None:
        return None

    first, last = bounds
    months = last - first + 1
    per = (Decimal(str(plan.target_amount)) / months).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    return {
        "first_month": _from_index(first),
        "last_month": _from_index(last),
        "months": months,
        "monthly_amount": per,
    }


def load_active_plans(db: Session, account_id: int) -> list[GoalSavingPlan]:
    return (
        db.query(GoalSavingPlan)
        .filter(
            GoalSavingPlan.account_id == account_id,
            GoalSavingPlan.is_active == True,  # noqa: E712
        )
        .all()
    )


def plans_for_month(
    plans: list[GoalSavingPlan], year: int, month: int
) -> dict[int, Decimal]:
    """goal_id → расчётный взнос за месяц. Без обращений к базе.

    Планы одной цели складываются: можно копить и на страховку, и на
    шины в общее «Авто».
    """
    at = month_key(year, month)
    out: dict[int, Decimal] = {}
    for plan in plans:
        amount = monthly_amount(plan, at)
        if amount > 0:
            out[plan.goal_id] = out.get(plan.goal_id, _ZERO) + amount
    return out


def computed_plans_for_month(
    db: Session, account_id: int, year: int, month: int
) -> dict[int, Decimal]:
    """То же, но с загрузкой планов. Для разового вызова.

    Матрица бюджета считает сразу много месяцев и грузит планы один раз
    через load_active_plans — иначе выходил запрос на каждый месяц.
    """
    return plans_for_month(load_active_plans(db, account_id), year, month)


# ── Проверка входных данных ───────────────────────────────────────────

def parse_amount(raw) -> Decimal:
    try:
        amount = Decimal(str(raw))
    except (InvalidOperation, ValueError, TypeError):
        raise SavingPlanError("Сумма не похожа на число")
    if amount <= 0:
        raise SavingPlanError("Сумма должна быть больше нуля")
    return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def validate_window(
    start_month: str, target_month: str, save_in_target_month: bool
) -> None:
    """Проверяет месяцы и то, что копить вообще есть когда."""
    for key, name in ((start_month, "Месяц начала"), (target_month, "Целевой месяц")):
        if not isinstance(key, str) or not MONTH_RE.match(key):
            raise SavingPlanError(f"{name} должен быть в виде ГГГГ-ММ")

    first = _to_index(start_month)
    last = _to_index(target_month)
    if last < first:
        raise SavingPlanError("Целевой месяц раньше месяца начала")
    if not save_in_target_month and last - 1 < first:
        # Классический случай: начало и цель в одном месяце, а копить
        # в целевом нельзя — откладывать оказывается некуда.
        raise SavingPlanError(
            "Копить негде: включите взнос в целевом месяце или начните раньше"
        )
