"""
Расчёт помесячного взноса по накопительному плану цели.

Раньше суммы в строке «Отложить» вбивались руками в каждую клетку.
Здесь проверяется, что окно считается так, как задумано, и что
ежегодный режим перезапускается сам — без фоновых заданий и без
хранения расчётных сумм.
"""
from decimal import Decimal

import pytest

from app.application.goal_saving_plans import (
    computed_plans_for_month,
    monthly_amount,
    month_key,
)
from app.infrastructure.db.models import GoalSavingPlan

ACCT = 1


def _plan(**kw):
    defaults = dict(
        id=1, account_id=ACCT, goal_id=10,
        target_amount=Decimal("30000"),
        start_month="2027-01", target_month="2027-12",
        save_in_target_month=False, repeat_yearly=False, is_active=True,
    )
    defaults.update(kw)
    return GoalSavingPlan(**defaults)


class TestWindow:
    def test_target_month_excluded_by_default(self):
        """30 000 к декабрю, с января, в декабре не копим → 11 месяцев."""
        p = _plan()
        assert monthly_amount(p, "2027-01") == Decimal("2727.27")
        assert monthly_amount(p, "2027-11") == Decimal("2727.27")
        assert monthly_amount(p, "2027-12") == Decimal("0")

    def test_target_month_included(self):
        p = _plan(save_in_target_month=True)
        assert monthly_amount(p, "2027-12") == Decimal("2500.00")
        assert monthly_amount(p, "2027-01") == Decimal("2500.00")

    def test_nothing_before_the_start(self):
        assert monthly_amount(_plan(), "2026-12") == Decimal("0")

    def test_nothing_after_the_window(self):
        assert monthly_amount(_plan(), "2028-03") == Decimal("0")

    def test_single_month_window(self):
        """Срок — следующий месяц: вся сумма приходится на него."""
        p = _plan(start_month="2027-05", target_month="2027-06")
        assert monthly_amount(p, "2027-05") == Decimal("30000.00")

    def test_empty_window_gives_nothing(self):
        """Копить некогда: начало совпадает с целевым, а в нём не копим."""
        p = _plan(start_month="2027-12", target_month="2027-12")
        assert monthly_amount(p, "2027-12") == Decimal("0")


class TestYearlyRepeat:
    def test_cycle_shifts_itself_after_the_target_month(self):
        """Декабрь прошёл — с января снова копим, без фоновых заданий."""
        p = _plan(repeat_yearly=True)

        assert monthly_amount(p, "2028-01") == Decimal("2727.27")
        assert monthly_amount(p, "2028-11") == Decimal("2727.27")
        assert monthly_amount(p, "2028-12") == Decimal("0")

    def test_still_works_many_years_later(self):
        p = _plan(repeat_yearly=True)
        assert monthly_amount(p, "2035-06") == Decimal("2727.27")

    def test_one_off_plan_stops_forever(self):
        p = _plan(repeat_yearly=False)
        assert monthly_amount(p, "2028-06") == Decimal("0")


class TestAggregation:
    def test_plans_of_one_goal_are_summed(self, db_session):
        """Копим и на страховку, и на шины в общее «Авто»."""
        db_session.add(_plan(id=1, goal_id=10, target_amount=Decimal("30000"),
                             start_month="2027-01", target_month="2027-12"))
        db_session.add(_plan(id=2, goal_id=10, target_amount=Decimal("11000"),
                             start_month="2027-01", target_month="2027-12"))
        db_session.flush()

        got = computed_plans_for_month(db_session, ACCT, 2027, 3)

        assert got[10] == Decimal("2727.27") + Decimal("1000.00")

    def test_inactive_plan_is_skipped(self, db_session):
        db_session.add(_plan(is_active=False))
        db_session.flush()

        assert computed_plans_for_month(db_session, ACCT, 2027, 3) == {}

    def test_other_accounts_do_not_leak(self, db_session):
        db_session.add(_plan(account_id=ACCT + 999))
        db_session.flush()

        assert computed_plans_for_month(db_session, ACCT, 2027, 3) == {}

    def test_months_outside_any_window_give_nothing(self, db_session):
        db_session.add(_plan())
        db_session.flush()

        assert computed_plans_for_month(db_session, ACCT, 2029, 3) == {}


@pytest.mark.unit
def test_month_key_pads():
    assert month_key(2027, 3) == "2027-03"
