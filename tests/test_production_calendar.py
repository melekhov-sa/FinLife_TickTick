"""Tests for production_calendar module — Russian production calendar."""
from datetime import date
from unittest.mock import MagicMock, patch

import pytest

from app.application import production_calendar as pc


# Realistic-ish JSON for 2026 — January (holidays 1–8) and April (some entries)
MOCK_CALENDAR_2026 = {
    "year": 2026,
    "months": [
        # January: days 1-8 are non-working (holidays/new year);
        # day 9 (Friday) becomes a normal day after the holidays;
        # day 11 is Sunday (weekend via plain number);
        # no explicit entry for 10 (Saturday) — it's Sat, so weekend by default
        {"month": 1, "days": "1,2,3,4,5,6,7,8,11"},
        # April 2026:
        # 18 is Saturday (no entry) — weekend by default
        # 17 (Friday) — normal, no entry
        # 20 (Monday) — normal work day, no entry
        # 30 (Thursday) = pre-holiday before May 1
        {"month": 4, "days": "30*"},
    ],
    "holidays": [
        {"id": 1, "title": "Новогодние каникулы"},
    ],
    "transitions": [],
}


def _make_httpx_response(data: dict):
    mock_resp = MagicMock()
    mock_resp.json.return_value = data
    mock_resp.raise_for_status.return_value = None
    return mock_resp


# ── Helper: reset cache before each test ────────────────────────────────────

@pytest.fixture(autouse=True)
def clear_pc_cache():
    pc.clear_cache()
    yield
    pc.clear_cache()


# ── Tests ────────────────────────────────────────────────────────────────────

class TestGetDayTypes:
    def _patch_fetch(self, data):
        return patch("httpx.get", return_value=_make_httpx_response(data))

    def test_new_year_holidays_are_holiday(self):
        """Days 1-8 January 2026 (weekdays in the entry) → holiday."""
        with self._patch_fetch(MOCK_CALENDAR_2026):
            result = pc.get_day_types(date(2026, 1, 1), date(2026, 1, 10))

        # 1 Jan is Thursday — non-working, weekday → holiday
        assert result[date(2026, 1, 1)] == "holiday"
        assert result[date(2026, 1, 2)] == "holiday"  # Friday
        assert result[date(2026, 1, 5)] == "holiday"  # Monday
        assert result[date(2026, 1, 8)] == "holiday"  # Thursday

    def test_weekend_in_january_is_weekend(self):
        """Day 11 January 2026 is Sunday — entry present but it's Sat/Sun → weekend."""
        with self._patch_fetch(MOCK_CALENDAR_2026):
            result = pc.get_day_types(date(2026, 1, 11), date(2026, 1, 11))

        assert result[date(2026, 1, 11)] == "weekend"

    def test_saturday_without_entry_is_weekend(self):
        """2026-04-18 is Saturday, no explicit entry → weekend by default."""
        with self._patch_fetch(MOCK_CALENDAR_2026):
            result = pc.get_day_types(date(2026, 4, 18), date(2026, 4, 18))

        assert result[date(2026, 4, 18)] == "weekend"

    def test_monday_is_work(self):
        """2026-04-20 is Monday — normal working day."""
        with self._patch_fetch(MOCK_CALENDAR_2026):
            result = pc.get_day_types(date(2026, 4, 20), date(2026, 4, 20))

        assert result[date(2026, 4, 20)] == "work"

    def test_preholiday_star_token(self):
        """April 30 marked as '30*' → preholiday."""
        with self._patch_fetch(MOCK_CALENDAR_2026):
            result = pc.get_day_types(date(2026, 4, 30), date(2026, 4, 30))

        assert result[date(2026, 4, 30)] == "preholiday"

    def test_work_override_plus_token(self):
        """A day marked N+ means it's a working Saturday (transfer)."""
        data = {
            "year": 2026,
            "months": [
                {"month": 3, "days": "28+"},  # 28 March 2026 is Saturday
            ],
            "holidays": [],
            "transitions": [],
        }
        with self._patch_fetch(data):
            result = pc.get_day_types(date(2026, 3, 28), date(2026, 3, 28))

        assert result[date(2026, 3, 28)] == "work"


class TestFallback:
    def test_network_error_returns_weekday_logic(self):
        """If httpx raises a connection error the function still returns data."""
        import httpx

        with patch("httpx.get", side_effect=httpx.ConnectError("timeout")):
            result = pc.get_day_types(date(2026, 4, 18), date(2026, 4, 20))

        # Should not raise; should fall back to weekday-based logic
        assert result[date(2026, 4, 18)] == "weekend"  # Saturday
        assert result[date(2026, 4, 19)] == "weekend"  # Sunday
        assert result[date(2026, 4, 20)] == "work"     # Monday

    def test_bad_json_returns_weekday_fallback(self):
        """If the API returns garbage JSON, fall back gracefully."""
        mock_resp = MagicMock()
        mock_resp.raise_for_status.return_value = None
        mock_resp.json.side_effect = ValueError("not json")

        with patch("httpx.get", return_value=mock_resp):
            result = pc.get_day_types(date(2026, 4, 18), date(2026, 4, 18))

        assert result[date(2026, 4, 18)] == "weekend"

    def test_http_status_error_returns_weekday_fallback(self):
        """If the API returns 404/500, fall back gracefully."""
        import httpx

        with patch("httpx.get", side_effect=httpx.HTTPStatusError("404", request=MagicMock(), response=MagicMock())):
            result = pc.get_day_types(date(2026, 4, 20), date(2026, 4, 20))

        assert result[date(2026, 4, 20)] == "work"
