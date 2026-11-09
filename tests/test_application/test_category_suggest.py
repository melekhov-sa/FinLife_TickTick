from decimal import Decimal

from app.application.category_suggest import rank_categories


def test_more_used_category_wins():
    rows = [
        (10, Decimal("500"), 1.0),
        (10, Decimal("500"), 2.0),
        (20, Decimal("500"), 1.0),
    ]
    assert rank_categories(rows)[0] == 10


def test_recent_beats_old_at_equal_count():
    """Полураспад 45 дней: свежая операция весит заметно больше старой."""
    rows = [
        (10, Decimal("500"), 200.0),
        (20, Decimal("500"), 1.0),
    ]
    assert rank_categories(rows)[0] == 20


def test_amount_matters():
    """Главное отличие от «просто частоты»: 300 рублей и 120 тысяч —
    это разные статьи, даже если обе используются одинаково часто."""
    rows = [
        (10, Decimal("300"), 5.0),     # кофе
        (20, Decimal("120000"), 5.0),  # аренда
    ]
    assert rank_categories(rows, target_amount=Decimal("350"))[0] == 10
    assert rank_categories(rows, target_amount=Decimal("100000"))[0] == 20


def test_without_amount_falls_back_to_frequency():
    rows = [
        (10, Decimal("300"), 5.0),
        (20, Decimal("120000"), 5.0),
        (20, Decimal("120000"), 6.0),
    ]
    assert rank_categories(rows, target_amount=None)[0] == 20


def test_limit_and_stable_order():
    rows = [(i, Decimal("100"), 1.0) for i in (30, 10, 20)]
    out = rank_categories(rows, limit=2)
    assert len(out) == 2
    # Очки равны — тогда по возрастанию id, чтобы порядок не прыгал
    assert out == [10, 20]


def test_empty_and_none_category():
    assert rank_categories([]) == []
    assert rank_categories([(None, Decimal("100"), 1.0)]) == []


def test_zero_amount_does_not_crash():
    rows = [(10, Decimal("0"), 1.0)]
    assert rank_categories(rows, target_amount=Decimal("500")) == [10]
