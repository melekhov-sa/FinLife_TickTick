"""
Tests for XpAnalyticsService: daily and monthly XP aggregation.
"""
import pytest
from datetime import datetime, date, timezone, timedelta

from app.application.xp_analytics import XpAnalyticsService
from app.infrastructure.db.models import XpEvent


UTC = timezone.utc


def _ev(db, user_id: int, event_id: int, xp: int, created_at: datetime) -> XpEvent:
    """Insert a minimal XpEvent row."""
    ev = XpEvent(
        id=event_id,
        user_id=user_id,
        source_event_id=event_id,
        xp_amount=xp,
        reason="task_completed",
        created_at=created_at,
    )
    db.add(ev)
    db.flush()
    return ev


# ---------------------------------------------------------------------------
# get_current_month_label
# ---------------------------------------------------------------------------

class TestGetCurrentMonthLabel:
    def test_february_2026(self, db_session, sample_account_id):
        svc = XpAnalyticsService(db_session)
        label = svc.get_current_month_label(today=date(2026, 2, 1))
        assert label == "Февраль 2026"

    def test_january(self, db_session, sample_account_id):
        svc = XpAnalyticsService(db_session)
        assert svc.get_current_month_label(today=date(2025, 1, 15)) == "Январь 2025"

    def test_december(self, db_session, sample_account_id):
        svc = XpAnalyticsService(db_session)
        assert svc.get_current_month_label(today=date(2025, 12, 31)) == "Декабрь 2025"


# ---------------------------------------------------------------------------
# get_daily_xp_for_month
# ---------------------------------------------------------------------------

class TestGetDailyXpForMonth:
    def test_returns_all_days_for_february(self, db_session, sample_account_id):
        uid = sample_account_id
        svc = XpAnalyticsService(db_session)
        # February 2026 has 28 days
        result = svc.get_daily_xp_for_month(uid, 2026, 2)
        assert len(result) == 28

    def test_returns_31_days_for_march(self, db_session, sample_account_id):
        uid = sample_account_id
        svc = XpAnalyticsService(db_session)
        result = svc.get_daily_xp_for_month(uid, 2026, 3)
        assert len(result) == 31

    def test_empty_month_all_zero(self, db_session, sample_account_id):
        uid = sample_account_id
        svc = XpAnalyticsService(db_session)
        result = svc.get_daily_xp_for_month(uid, 2026, 2)
        assert all(d["xp"] == 0 for d in result)

    def test_event_on_day_15_aggregated_correctly(self, db_session, sample_account_id):
        uid = sample_account_id
        # Insert 2 events on Feb 15 and 1 on Feb 20 — use noon UTC (naive),
        # which converts to 15:00 MSK, so stays on the same MSK date.
        _ev(db_session, uid, 1, 10, datetime(2026, 2, 15, 12, 0))
        _ev(db_session, uid, 2, 5,  datetime(2026, 2, 15, 14, 0))
        _ev(db_session, uid, 3, 8,  datetime(2026, 2, 20, 12, 0))
        db_session.commit()

        result = XpAnalyticsService(db_session).get_daily_xp_for_month(uid, 2026, 2)
        day_map = {d["day"]: d["xp"] for d in result}

        assert day_map[15] == 15   # 10 + 5
        assert day_map[20] == 8
        # All other days are 0
        for day, xp in day_map.items():
            if day not in (15, 20):
                assert xp == 0, f"day {day} should be 0"

    def test_events_from_other_months_excluded(self, db_session, sample_account_id):
        uid = sample_account_id
        _ev(db_session, uid, 1, 10, datetime(2026, 1, 15, 12, 0))   # Jan — excluded
        _ev(db_session, uid, 2, 10, datetime(2026, 2, 10, 12, 0))   # Feb — included
        _ev(db_session, uid, 3, 10, datetime(2026, 3, 5,  12, 0))   # Mar — excluded
        db_session.commit()

        result = XpAnalyticsService(db_session).get_daily_xp_for_month(uid, 2026, 2)
        total = sum(d["xp"] for d in result)
        assert total == 10   # only Feb event counted

    def test_date_str_format(self, db_session, sample_account_id):
        uid = sample_account_id
        svc = XpAnalyticsService(db_session)
        result = svc.get_daily_xp_for_month(uid, 2026, 2)
        # First entry: 01-02-2026
        assert result[0]["date_str"] == "01-02-2026"
        assert result[-1]["date_str"] == "28-02-2026"

    def test_multiple_users_isolated(self, db_session):
        uid1, uid2 = 1, 2
        _ev(db_session, uid1, 1, 10, datetime(2026, 2, 10, 12, 0))
        _ev(db_session, uid2, 2, 99, datetime(2026, 2, 10, 12, 0))
        db_session.commit()

        result = XpAnalyticsService(db_session).get_daily_xp_for_month(uid1, 2026, 2)
        total = sum(d["xp"] for d in result)
        assert total == 10   # uid2's events must not appear

    def test_leap_year_february_has_29_days(self, db_session, sample_account_id):
        uid = sample_account_id
        svc = XpAnalyticsService(db_session)
        result = svc.get_daily_xp_for_month(uid, 2024, 2)   # 2024 is a leap year
        assert len(result) == 29


# ---------------------------------------------------------------------------
# get_monthly_xp_last_n_months
# ---------------------------------------------------------------------------

class TestGetMonthlyXpLastNMonths:
    def test_returns_n_entries(self, db_session, sample_account_id):
        uid = sample_account_id
        result = XpAnalyticsService(db_session).get_monthly_xp_last_n_months(uid, n=6, today=date(2026, 2, 15))
        assert len(result) == 6

    def test_newest_month_first(self, db_session, sample_account_id):
        uid = sample_account_id
        result = XpAnalyticsService(db_session).get_monthly_xp_last_n_months(uid, n=3, today=date(2026, 2, 15))
        # Order: Feb, Jan, Dec (2025)
        assert result[0] == {"year": 2026, "month": 2, "month_name": "Февраль", "xp": 0}
        assert result[1] == {"year": 2026, "month": 1, "month_name": "Январь",  "xp": 0}
        assert result[2] == {"year": 2025, "month": 12, "month_name": "Декабрь", "xp": 0}

    def test_empty_months_are_zero(self, db_session, sample_account_id):
        uid = sample_account_id
        result = XpAnalyticsService(db_session).get_monthly_xp_last_n_months(uid, n=4, today=date(2026, 2, 15))
        assert all(mo["xp"] == 0 for mo in result)

    def test_events_aggregated_per_month(self, db_session, sample_account_id):
        uid = sample_account_id
        _ev(db_session, uid, 1, 10, datetime(2026, 2, 5,  12, 0))
        _ev(db_session, uid, 2, 5,  datetime(2026, 2, 20, 12, 0))
        _ev(db_session, uid, 3, 15, datetime(2026, 1, 10, 12, 0))
        db_session.commit()

        result = XpAnalyticsService(db_session).get_monthly_xp_last_n_months(
            uid, n=3, today=date(2026, 2, 28)
        )
        feb = next(mo for mo in result if mo["month"] == 2 and mo["year"] == 2026)
        jan = next(mo for mo in result if mo["month"] == 1 and mo["year"] == 2026)

        assert feb["xp"] == 15   # 10 + 5
        assert jan["xp"] == 15

    def test_december_to_january_year_boundary(self, db_session, sample_account_id):
        uid = sample_account_id
        # Events in Dec 2025 and Jan 2026
        _ev(db_session, uid, 1, 20, datetime(2025, 12, 15, 12, 0))
        _ev(db_session, uid, 2, 10, datetime(2026, 1,  5, 12, 0))
        db_session.commit()

        result = XpAnalyticsService(db_session).get_monthly_xp_last_n_months(
            uid, n=3, today=date(2026, 2, 1)
        )
        # Entries: Feb 2026, Jan 2026, Dec 2025
        feb = result[0]; jan = result[1]; dec = result[2]
        assert feb["year"] == 2026 and feb["month"] == 2 and feb["xp"] == 0
        assert jan["year"] == 2026 and jan["month"] == 1 and jan["xp"] == 10
        assert dec["year"] == 2025 and dec["month"] == 12 and dec["xp"] == 20

    def test_events_before_window_excluded(self, db_session, sample_account_id):
        uid = sample_account_id
        # Insert event 7 months ago — outside n=6 window
        _ev(db_session, uid, 1, 100, datetime(2025, 7, 15, 12, 0))
        _ev(db_session, uid, 2, 10,  datetime(2026, 2,  1, 12, 0))
        db_session.commit()

        result = XpAnalyticsService(db_session).get_monthly_xp_last_n_months(
            uid, n=6, today=date(2026, 2, 28)
        )
        total = sum(mo["xp"] for mo in result)
        assert total == 10   # only Feb 2026 event within window

    def test_month_names_all_twelve(self, db_session, sample_account_id):
        uid = sample_account_id
        svc = XpAnalyticsService(db_session)
        # Get 12 months from December
        result = svc.get_monthly_xp_last_n_months(uid, n=12, today=date(2026, 12, 1))
        names = [mo["month_name"] for mo in result]
        assert names[0] == "Декабрь"
        assert names[1] == "Ноябрь"
        assert names[-1] == "Январь"
