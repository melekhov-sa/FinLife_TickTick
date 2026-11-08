"""Подсветка ставок кэшбека.

Правило (считается ТОЛЬКО здесь, чтобы страница и шторка не разъехались):
  • категория встречается на одной карте  → нейтрально, оба флага False;
  • категория встречается на 2+ картах    → максимум процента получает is_best,
                                            остальные — is_outranked;
  • при равенстве максимума is_best у всех строк с этим процентом.

Внутри месяца уникальный индекс гарантирует не больше одной ставки на
карту+категорию, поэтому «сколько записей у категории» == «на сколько картах».
"""
from __future__ import annotations

from decimal import Decimal


def compute_highlights(
    entries: list[tuple[int, int, Decimal]],
) -> dict[int, dict[str, bool]]:
    """entries: список (entry_id, category_id, percent)."""
    by_category: dict[int, list[tuple[int, Decimal]]] = {}
    for entry_id, category_id, percent in entries:
        by_category.setdefault(category_id, []).append((entry_id, percent))

    flags: dict[int, dict[str, bool]] = {}
    for rows in by_category.values():
        if len(rows) < 2:
            for entry_id, _ in rows:
                flags[entry_id] = {"is_best": False, "is_outranked": False}
            continue
        top = max(percent for _, percent in rows)
        for entry_id, percent in rows:
            is_best = percent == top
            flags[entry_id] = {"is_best": is_best, "is_outranked": not is_best}
    return flags


def best_per_category(
    entries: list[tuple[int, str, Decimal, str]],
) -> list[tuple[str, Decimal, str]]:
    """Лучшая карта по каждой категории — проекция для виджета.

    entries: (entry_id, category_title, percent, card_title)
    Возврат: [(category_title, percent, card_title)] по убыванию процента.

    Это НЕ то же самое, что compute_highlights: там is_best помечает только
    спорные категории (на двух и более картах), а здесь нужны все категории,
    включая те, что заведены на одной карте. При равенстве процента берём
    первую по алфавиту карту — лишь бы результат был устойчивым.
    """
    best: dict[str, tuple[Decimal, str]] = {}
    for _entry_id, category, percent, card in entries:
        cur = best.get(category)
        if cur is None or percent > cur[0] or (percent == cur[0] and card < cur[1]):
            best[category] = (percent, card)
    rows = [(cat, pct, card) for cat, (pct, card) in best.items()]
    rows.sort(key=lambda r: (-r[1], r[0]))
    return rows
