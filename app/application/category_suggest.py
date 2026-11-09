"""Подсказка статей по истории операций.

Зачем: список статей отсортирован вручную (sort_order), а внутри по алфавиту.
Поэтому статья, которой пользуются раз в год, может висеть наверху просто
потому, что её рано завели. Кошельки в той же форме давно сортируются по
частоте — здесь то же самое для статей.

Чем отличается от «просто частоты»: учитывается сумма. 300 ₽ и 120 000 ₽ —
это почти наверняка разные статьи, даже если обе популярны.
"""
from __future__ import annotations

import math
from decimal import Decimal

# Полураспад веса: операция 45-дневной давности весит вдвое меньше вчерашней.
RECENCY_HALFLIFE_DAYS = 45.0


def _recency_weight(days_ago: float) -> float:
    if days_ago < 0:
        days_ago = 0.0
    return 0.5 ** (days_ago / RECENCY_HALFLIFE_DAYS)


def _amount_weight(amount: Decimal, target: Decimal | None) -> float:
    """Насколько сумма операции похожа на вводимую.

    Сравниваем порядки величин, а не рубли: 300 против 600 — близко,
    300 против 30 000 — нет. Вес равен 1.0 при совпадении и плавно падает.
    """
    if target is None:
        return 1.0
    try:
        a, t = float(amount), float(target)
    except (TypeError, ValueError):
        return 1.0
    if a <= 0 or t <= 0:
        return 1.0
    return 1.0 / (1.0 + abs(math.log10(a / t)))


def rank_categories(
    rows: list[tuple[int, Decimal, float]],
    target_amount: Decimal | None = None,
    limit: int = 6,
) -> list[int]:
    """Вернуть id статей по убыванию уместности.

    rows: (category_id, amount, days_ago) — операции пользователя нужного типа.
    target_amount: сумма, которую пользователь вводит сейчас (может быть None).
    """
    scores: dict[int, float] = {}
    for category_id, amount, days_ago in rows:
        if category_id is None:
            continue
        scores[category_id] = scores.get(category_id, 0.0) + (
            _recency_weight(days_ago) * _amount_weight(amount, target_amount)
        )
    # При равных очках — меньший id, чтобы порядок не прыгал между запросами.
    ordered = sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))
    return [cid for cid, _ in ordered[:limit]]
