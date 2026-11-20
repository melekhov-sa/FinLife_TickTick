"""
Подсказки по бюджету.

Данных в приложении было много, выводов — ноль: графики показывали
цифры, а смысл пользователь достраивал сам. Здесь проверяется, что
выводы делаются по понятным правилам и не срабатывают на шуме.
"""
from datetime import date
from unittest.mock import patch

import pytest

from app.application.budget_insights import compute_budget_insights

ACCT = 1
YEAR, MONTH = 2026, 11


def _cell(plan=0, fact=0):
    return {"plan": plan, "fact": fact}


def _matrix(expense_rows, totals=None):
    return {
        "expense_rows": expense_rows,
        "expense_totals": {"cells": totals or [_cell()]},
    }


def _run(matrix, today):
    with patch("app.application.budget_matrix.BudgetMatrixService") as svc:
        svc.return_value.build.return_value = matrix
        return compute_budget_insights(None, ACCT, YEAR, MONTH, today=today)


def _codes(res):
    return {i["code"] for i in res}


class TestPace:
    def test_warns_when_pace_exceeds_plan(self):
        """10 дней из 30, потрачено 2/3 плана — выйдет вдвое."""
        rows = [{"category_id": 1, "title": "Продукты",
                 "cells": [_cell(), _cell(30000, 20000)]}]
        res = _run(_matrix(rows), today=date(2026, 11, 10))

        assert "pace_over" in _codes(res)
        assert "20 000" in res[0]["detail"]

    def test_silent_when_pace_is_fine(self):
        rows = [{"category_id": 1, "title": "Продукты",
                 "cells": [_cell(), _cell(30000, 9000)]}]
        assert _codes(_run(_matrix(rows), today=date(2026, 11, 10))) == set()

    def test_no_pace_check_on_a_closed_month(self):
        """Закрытый месяц прогнозировать незачем — он уже случился."""
        rows = [{"category_id": 1, "title": "Продукты",
                 "cells": [_cell(), _cell(30000, 20000)]}]
        assert "pace_over" not in _codes(_run(_matrix(rows), today=date(2026, 12, 5)))

    def test_small_amounts_are_ignored(self):
        """На мелких статьях проценты скачут от одной покупки."""
        rows = [{"category_id": 1, "title": "Мелочь",
                 "cells": [_cell(), _cell(300, 200)]}]
        assert _codes(_run(_matrix(rows), today=date(2026, 11, 10))) == set()


class TestChronicOverspend:
    def test_three_months_of_overspend_is_a_pattern(self):
        hist = [_cell(10000, 12000), _cell(10000, 13000), _cell(10000, 11500)]
        rows = [{"category_id": 2, "title": "Авто", "cells": hist + [_cell(10000, 0)]}]

        res = _run(_matrix(rows), today=date(2026, 11, 10))

        assert "chronic_over" in _codes(res)

    def test_two_months_is_not_yet_a_pattern(self):
        hist = [_cell(10000, 12000), _cell(10000, 9000), _cell(10000, 11500)]
        rows = [{"category_id": 2, "title": "Авто", "cells": hist + [_cell(10000, 0)]}]

        assert "chronic_over" not in _codes(_run(_matrix(rows), today=date(2026, 11, 10)))


class TestUnusedPlan:
    def test_plan_standing_without_spending(self):
        hist = [_cell(5000, 0), _cell(5000, 0), _cell(5000, 0)]
        rows = [{"category_id": 3, "title": "Подарки", "cells": hist + [_cell(5000, 0)]}]

        res = _run(_matrix(rows), today=date(2026, 11, 10))

        assert "plan_unused" in _codes(res)

    def test_not_reported_when_money_is_spent(self):
        hist = [_cell(5000, 0), _cell(5000, 0), _cell(5000, 0)]
        rows = [{"category_id": 3, "title": "Подарки", "cells": hist + [_cell(5000, 4000)]}]

        assert "plan_unused" not in _codes(_run(_matrix(rows), today=date(2026, 11, 10)))


class TestSpike:
    def test_closed_month_far_above_usual(self):
        hist = [_cell(0, 5000), _cell(0, 5200), _cell(0, 4800)]
        rows = [{"category_id": 4, "title": "Одежда", "cells": hist + [_cell(0, 15000)]}]

        res = _run(_matrix(rows), today=date(2026, 12, 5))

        assert "spike" in _codes(res)

    def test_open_month_is_not_called_a_spike(self):
        """Месяц ещё идёт — сравнивать его итог с прошлыми рано."""
        hist = [_cell(0, 5000), _cell(0, 5200), _cell(0, 4800)]
        rows = [{"category_id": 4, "title": "Одежда", "cells": hist + [_cell(0, 15000)]}]

        assert "spike" not in _codes(_run(_matrix(rows), today=date(2026, 11, 10)))


class TestTotals:
    def test_open_month_overspending_is_danger(self):
        res = _run(_matrix([], totals=[_cell(), _cell(100000, 70000)]),
                   today=date(2026, 11, 10))

        assert "total_pace_over" in _codes(res)
        assert res[0]["severity"] == "danger"

    def test_closed_month_over_plan(self):
        res = _run(_matrix([], totals=[_cell(), _cell(100000, 120000)]),
                   today=date(2026, 12, 5))

        assert "total_over" in _codes(res)

    def test_nothing_to_say_without_a_plan(self):
        assert _run(_matrix([], totals=[_cell(), _cell(0, 50000)]),
                    today=date(2026, 11, 10)) == []


@pytest.mark.unit
def test_most_severe_comes_first():
    rows = [{"category_id": 1, "title": "Продукты", "cells": [_cell(), _cell(30000, 20000)]}]
    res = _run(_matrix(rows, totals=[_cell(), _cell(100000, 70000)]), today=date(2026, 11, 10))

    assert res[0]["severity"] == "danger"
