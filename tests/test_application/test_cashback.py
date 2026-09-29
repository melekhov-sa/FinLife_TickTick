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
