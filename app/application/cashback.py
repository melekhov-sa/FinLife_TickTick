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
