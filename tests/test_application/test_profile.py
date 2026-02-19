"""
Tests for profile service helpers: compute_days_in_system and get_level_title.
"""
import pytest
from datetime import date

from app.application.profile import compute_days_in_system, get_level_title


# ---------------------------------------------------------------------------
# compute_days_in_system
# ---------------------------------------------------------------------------

class TestComputeDaysInSystem:
    def test_same_day_returns_zero(self):
        d = date(2026, 1, 1)
        assert compute_days_in_system(d, d) == 0

    def test_one_day_later(self):
        reg = date(2026, 1, 1)
        today = date(2026, 1, 2)
        assert compute_days_in_system(reg, today) == 1

    def test_full_year(self):
        reg = date(2025, 2, 19)
        today = date(2026, 2, 19)
        assert compute_days_in_system(reg, today) == 365

    def test_leap_year_included(self):
        # 2024 is a leap year (366 days)
        reg = date(2024, 1, 1)
        today = date(2025, 1, 1)
        assert compute_days_in_system(reg, today) == 366

    def test_never_negative(self):
        # today < reg would be a bug; result must be clamped to 0
        reg = date(2026, 6, 1)
        today = date(2026, 1, 1)
        assert compute_days_in_system(reg, today) == 0

    def test_arbitrary_value(self):
        reg = date(2024, 3, 10)
        today = date(2026, 2, 19)
        expected = (today - reg).days
        assert compute_days_in_system(reg, today) == expected


# ---------------------------------------------------------------------------
# get_level_title — boundary cases
# ---------------------------------------------------------------------------

class TestGetLevelTitle:
    def test_level_1_is_novice(self):
        assert get_level_title(1) == "Новичок"

    def test_level_2_is_novice(self):
        assert get_level_title(2) == "Новичок"

    def test_level_3_boundary(self):
        assert get_level_title(3) == "Контролёр"

    def test_level_4_is_controller(self):
        assert get_level_title(4) == "Контролёр"

    def test_level_5_boundary(self):
        assert get_level_title(5) == "Планировщик"

    def test_level_7_is_planner(self):
        assert get_level_title(7) == "Планировщик"

    def test_level_8_boundary(self):
        assert get_level_title(8) == "Стратег"

    def test_level_11_is_strategist(self):
        assert get_level_title(11) == "Стратег"

    def test_level_12_boundary(self):
        assert get_level_title(12) == "Архитектор"

    def test_level_50_is_architect(self):
        assert get_level_title(50) == "Архитектор"
