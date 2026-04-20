"""Tests for federal RF holidays module."""
from datetime import date

from app.application.holidays import get_holiday_ru, get_holidays_ru_range


class TestGetHolidayRu:
    def test_new_year_is_holiday(self):
        h = get_holiday_ru(date(2026, 1, 1))
        assert h is not None
        assert h.name == "Новый год"
        assert h.icon == "🎄"
        assert h.theme == "winter"

    def test_orthodox_christmas(self):
        h = get_holiday_ru(date(2026, 1, 7))
        assert h is not None
        assert h.name == "Рождество Христово"
        assert h.theme == "christmas"

    def test_mar_8_is_rose_theme(self):
        h = get_holiday_ru(date(2026, 3, 8))
        assert h is not None
        assert "женский" in h.name.lower()
        assert h.theme == "rose"

    def test_victory_day_has_ribbon_icon_theme(self):
        h = get_holiday_ru(date(2026, 5, 9))
        assert h is not None
        assert h.theme == "victory"

    def test_russia_day_tricolor(self):
        h = get_holiday_ru(date(2026, 6, 12))
        assert h is not None
        assert h.theme == "tricolor"

    def test_unity_day(self):
        h = get_holiday_ru(date(2026, 11, 4)) is not None

    def test_regular_day_returns_none(self):
        assert get_holiday_ru(date(2026, 4, 20)) is None  # random Monday
        assert get_holiday_ru(date(2026, 7, 4)) is None  # US Independence Day, not RF

    def test_year_agnostic(self):
        # Every year Jan 1 is Новый год — function ignores year for lookup
        for year in (2024, 2026, 2030, 2040):
            h = get_holiday_ru(date(year, 1, 1))
            assert h is not None
            assert h.name == "Новый год"


class TestGetHolidaysRuRange:
    def test_range_covers_january_2026(self):
        holidays = get_holidays_ru_range(date(2026, 1, 1), date(2026, 1, 10))
        # Jan 1-6, 8 as Новогодние-family + Jan 7 Рождество = 8 holidays
        assert len(holidays) == 8
        dates = {h.date for h in holidays}
        for day in (1, 2, 3, 4, 5, 6, 7, 8):
            assert date(2026, 1, day) in dates

    def test_range_no_holidays(self):
        # Random October week — no federal holidays
        holidays = get_holidays_ru_range(date(2026, 10, 13), date(2026, 10, 19))
        assert holidays == []

    def test_range_single_day_hit(self):
        holidays = get_holidays_ru_range(date(2026, 2, 23), date(2026, 2, 23))
        assert len(holidays) == 1
        assert holidays[0].name == "День защитника Отечества"

    def test_to_dict_has_iso_date(self):
        h = get_holiday_ru(date(2026, 5, 9))
        assert h is not None
        d = h.to_dict()
        assert d["date"] == "2026-05-09"
        assert d["theme"] == "victory"
