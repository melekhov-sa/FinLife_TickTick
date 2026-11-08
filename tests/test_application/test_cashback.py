from decimal import Decimal

from app.application.cashback import compute_highlights


def test_single_card_category_is_neutral():
    """Категория только на одной карте — сравнивать не с чем, подсветки нет."""
    result = compute_highlights([(1, 10, Decimal("5.00"))])
    assert result == {1: {"is_best": False, "is_outranked": False}}


def test_two_cards_best_and_outranked():
    """Категория на двух картах — у большего процента is_best, у меньшего is_outranked."""
    result = compute_highlights([
        (1, 10, Decimal("3.00")),
        (2, 10, Decimal("5.00")),
    ])
    assert result[2] == {"is_best": True, "is_outranked": False}
    assert result[1] == {"is_best": False, "is_outranked": True}


def test_tie_marks_all_as_best():
    """При равенстве максимума обе карты лучшие, проигравших нет."""
    result = compute_highlights([
        (1, 10, Decimal("5.00")),
        (2, 10, Decimal("5.00")),
    ])
    assert result[1] == {"is_best": True, "is_outranked": False}
    assert result[2] == {"is_best": True, "is_outranked": False}


def test_three_cards_one_best_two_outranked():
    result = compute_highlights([
        (1, 10, Decimal("1.00")),
        (2, 10, Decimal("10.00")),
        (3, 10, Decimal("3.00")),
    ])
    assert result[2]["is_best"] is True
    assert result[1]["is_outranked"] is True
    assert result[3]["is_outranked"] is True


def test_categories_are_independent():
    """Разные категории считаются отдельно и не влияют друг на друга."""
    result = compute_highlights([
        (1, 10, Decimal("5.00")),
        (2, 10, Decimal("3.00")),
        (3, 20, Decimal("1.00")),
    ])
    assert result[1]["is_best"] is True
    assert result[2]["is_outranked"] is True
    # Категория 20 одна — нейтральна, несмотря на самый низкий процент.
    assert result[3] == {"is_best": False, "is_outranked": False}


def test_empty_input():
    assert compute_highlights([]) == {}


def test_best_per_category_picks_max():
    from app.application.cashback import best_per_category
    rows = best_per_category([
        (1, "Супермаркеты", Decimal("3.00"), "T-Bank"),
        (2, "Супермаркеты", Decimal("5.00"), "Alfa"),
    ])
    assert rows == [("Супермаркеты", Decimal("5.00"), "Alfa")]


def test_best_per_category_keeps_single_card_categories():
    """Категория на одной карте обязана попасть в виджет — в отличие от
    compute_highlights, где она нейтральна."""
    from app.application.cashback import best_per_category
    rows = best_per_category([(1, "АЗС", Decimal("5.00"), "Sber")])
    assert rows == [("АЗС", Decimal("5.00"), "Sber")]


def test_best_per_category_sorted_by_percent_desc():
    from app.application.cashback import best_per_category
    rows = best_per_category([
        (1, "Аптеки", Decimal("3.00"), "Alfa"),
        (2, "Кафе", Decimal("10.00"), "T-Bank"),
        (3, "АЗС", Decimal("5.00"), "Sber"),
    ])
    assert [r[0] for r in rows] == ["Кафе", "АЗС", "Аптеки"]


def test_best_per_category_tie_is_stable():
    from app.application.cashback import best_per_category
    rows = best_per_category([
        (1, "Кафе", Decimal("5.00"), "Zeta"),
        (2, "Кафе", Decimal("5.00"), "Alfa"),
    ])
    assert rows == [("Кафе", Decimal("5.00"), "Alfa")]
