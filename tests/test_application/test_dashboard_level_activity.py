"""
Unit tests for pure helper functions used on the Dashboard:
  - get_level_title   (app.application.profile)
  - compute_activity_index  (app.application.activity)
  - trend_sign + trend_abs  (inline logic in pages.py, tested as formula here)
  - percent_progress        (formula from XpService, tested as formula here)

All functions are pure (no DB), so no fixtures are needed.
"""
import pytest

from app.application.profile import get_level_title
from app.application.activity import compute_activity_index, SATURATION_POINTS_7D


# ─────────────────────────────────────────────
# get_level_title
# ─────────────────────────────────────────────

class TestGetLevelTitle:
    """Maps XP level integer → rank string."""

    def test_level_1_is_novice(self):
        assert get_level_title(1) == "Новичок"

    def test_level_2_is_novice(self):
        assert get_level_title(2) == "Новичок"

    def test_level_3_is_controller(self):
        assert get_level_title(3) == "Контролёр"

    def test_level_4_is_controller(self):
        assert get_level_title(4) == "Контролёр"

    def test_level_5_is_planner(self):
        assert get_level_title(5) == "Планировщик"

    def test_level_7_is_planner(self):
        assert get_level_title(7) == "Планировщик"

    def test_level_8_is_strategist(self):
        assert get_level_title(8) == "Стратег"

    def test_level_11_is_strategist(self):
        assert get_level_title(11) == "Стратег"

    def test_level_12_is_architect(self):
        assert get_level_title(12) == "Архитектор"

    def test_level_20_is_architect(self):
        assert get_level_title(20) == "Архитектор"

    def test_level_0_falls_back_to_novice(self):
        # Edge: level 0 should not crash, returns "Новичок"
        assert get_level_title(0) == "Новичок"


# ─────────────────────────────────────────────
# compute_activity_index
# ─────────────────────────────────────────────

class TestComputeActivityIndex:
    """Activity Index is 0–100, linearly scaled to SATURATION_POINTS_7D."""

    def test_zero_points_gives_zero(self):
        assert compute_activity_index(0) == 0

    def test_saturation_gives_100(self):
        assert compute_activity_index(SATURATION_POINTS_7D) == 100

    def test_above_saturation_capped_at_100(self):
        assert compute_activity_index(SATURATION_POINTS_7D * 2) == 100

    def test_half_saturation_gives_50(self):
        result = compute_activity_index(SATURATION_POINTS_7D // 2)
        assert result == 50

    def test_one_point(self):
        # 1/70 * 100 ≈ 1.43 → rounds to 1
        result = compute_activity_index(1)
        assert result == round(100 / SATURATION_POINTS_7D)

    def test_custom_saturation(self):
        assert compute_activity_index(25, saturation=100) == 25

    def test_custom_saturation_zero_guard(self):
        # saturation=0, points>0 → 100; points=0 → 0
        assert compute_activity_index(5, saturation=0) == 100
        assert compute_activity_index(0, saturation=0) == 0

    def test_result_always_integer(self):
        for pts in range(0, SATURATION_POINTS_7D + 1, 7):
            result = compute_activity_index(pts)
            assert isinstance(result, int), f"Expected int, got {type(result)} for pts={pts}"


# ─────────────────────────────────────────────
# trend_sign + trend_abs  (pages.py inline formula)
# ─────────────────────────────────────────────

def _trend_sign(delta: int) -> str:
    """Mirrors the logic in pages.py dashboard handler."""
    if delta > 0:
        return "up"
    elif delta < 0:
        return "down"
    return "zero"


class TestTrendSign:
    def test_positive_delta_is_up(self):
        assert _trend_sign(10) == "up"

    def test_negative_delta_is_down(self):
        assert _trend_sign(-5) == "down"

    def test_zero_delta_is_zero(self):
        assert _trend_sign(0) == "zero"

    def test_trend_abs_positive(self):
        assert abs(10) == 10

    def test_trend_abs_negative(self):
        assert abs(-7) == 7

    def test_trend_abs_zero(self):
        assert abs(0) == 0


# ─────────────────────────────────────────────
# percent_progress  (XP level progress bar formula)
# ─────────────────────────────────────────────

def _percent_progress(current_level_xp: int, xp_to_next_level: int) -> float:
    """
    Mirrors the computation used in XpService / pages.py.
    percent = current / (current + to_next) * 100
    """
    total = current_level_xp + xp_to_next_level
    if total <= 0:
        return 0.0
    return round(current_level_xp / total * 100, 1)


class TestPercentProgress:
    def test_zero_xp_earned_is_0_percent(self):
        assert _percent_progress(0, 100) == 0.0

    def test_full_xp_is_100_percent(self):
        assert _percent_progress(100, 0) == 100.0

    def test_halfway(self):
        assert _percent_progress(50, 50) == 50.0

    def test_three_quarters(self):
        assert _percent_progress(75, 25) == 75.0

    def test_no_level_data_is_zero(self):
        # Guard: both zero → 0
        assert _percent_progress(0, 0) == 0.0

    def test_result_clamps_to_0_100(self):
        # Current > total should not happen in practice, but formula stays sane
        result = _percent_progress(100, 0)
        assert 0.0 <= result <= 100.0
