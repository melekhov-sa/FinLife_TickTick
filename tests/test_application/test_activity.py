"""
Tests for ActivityReadService and compute_activity_index.
"""
import pytest
from datetime import date, datetime, timezone

from app.application.activity import ActivityReadService, compute_activity_index, SATURATION_POINTS_7D
from app.infrastructure.db.models import UserActivityDaily

UTC = timezone.utc


def _day(db, user_id: int, day: date, ops: int = 0, tasks: int = 0,
         habits: int = 0, goals: int = 0) -> UserActivityDaily:
    """Insert a UserActivityDaily row with computed points."""
    points = 2 * ops + tasks + habits + 5 * goals
    row = UserActivityDaily(
        user_id=user_id,
        day_date=day,
        ops_count=ops,
        tasks_count=tasks,
        habits_count=habits,
        goals_count=goals,
        points=points,
    )
    db.add(row)
    db.flush()
    return row


# ---------------------------------------------------------------------------
# compute_activity_index — pure function
# ---------------------------------------------------------------------------

class TestComputeActivityIndex:
    def test_zero_points_returns_zero(self):
        assert compute_activity_index(0) == 0

    def test_half_saturation_returns_50(self):
        assert compute_activity_index(SATURATION_POINTS_7D // 2) == 50

    def test_full_saturation_returns_100(self):
        assert compute_activity_index(SATURATION_POINTS_7D) == 100

    def test_exceeds_saturation_capped_at_100(self):
        assert compute_activity_index(SATURATION_POINTS_7D * 2) == 100

    def test_35_points_from_saturation_70(self):
        assert compute_activity_index(35, saturation=70) == 50

    def test_custom_saturation(self):
        assert compute_activity_index(25, saturation=100) == 25

    def test_zero_saturation_with_points_returns_100(self):
        assert compute_activity_index(5, saturation=0) == 100

    def test_zero_saturation_no_points_returns_zero(self):
        assert compute_activity_index(0, saturation=0) == 0


# ---------------------------------------------------------------------------
# trend_delta derived from two index calls
# ---------------------------------------------------------------------------

class TestTrendDelta:
    def test_positive_trend(self):
        idx = compute_activity_index(42)
        prev = compute_activity_index(28)
        delta = idx - prev
        assert delta > 0

    def test_negative_trend(self):
        idx = compute_activity_index(21)
        prev = compute_activity_index(56)
        delta = idx - prev
        assert delta < 0

    def test_equal_trend_is_zero(self):
        idx = compute_activity_index(35)
        prev = compute_activity_index(35)
        assert idx - prev == 0

    def test_activity60_prev40(self):
        # rough assertion — just verify sign and magnitude direction
        idx = compute_activity_index(42)   # ~60
        prev = compute_activity_index(28)   # ~40
        assert idx - prev == 20

    def test_activity30_prev80(self):
        idx = compute_activity_index(21)   # 30
        prev = compute_activity_index(56)   # 80
        assert idx - prev == -50


# ---------------------------------------------------------------------------
# ActivityReadService — DB-backed tests
# ---------------------------------------------------------------------------

class TestGetActivitySummary:
    def test_empty_returns_zeros(self, db_session, sample_account_id):
        uid = sample_account_id
        summary = ActivityReadService(db_session).get_activity_summary(uid, date(2026, 2, 15))
        assert summary["activity_index"] == 0
        assert summary["trend_delta"] == 0
        assert summary["points_7d"] == 0
        assert summary["points_prev_7d"] == 0
        assert summary["points_30d_total"] == 0
        assert summary["best_day_date_30d"] is None
        assert summary["best_day_points_30d"] == 0

    def test_points_7d_includes_today(self, db_session, sample_account_id):
        uid = sample_account_id
        today = date(2026, 2, 15)
        _day(db_session, uid, today, tasks=3)    # points=3
        db_session.commit()

        summary = ActivityReadService(db_session).get_activity_summary(uid, today)
        assert summary["points_7d"] == 3

    def test_points_7d_boundary_7_days_ago(self, db_session, sample_account_id):
        uid = sample_account_id
        today = date(2026, 2, 15)
        from datetime import timedelta
        _day(db_session, uid, today - timedelta(days=6), ops=1)   # points=2 — edge, included
        _day(db_session, uid, today - timedelta(days=7), tasks=5)  # points=5 — excluded (prev window)
        db_session.commit()

        summary = ActivityReadService(db_session).get_activity_summary(uid, today)
        assert summary["points_7d"] == 2   # only the day-6 row

    def test_points_prev_7d_window(self, db_session, sample_account_id):
        uid = sample_account_id
        today = date(2026, 2, 15)
        from datetime import timedelta
        _day(db_session, uid, today - timedelta(days=7),  ops=2)   # points=4 — in prev window
        _day(db_session, uid, today - timedelta(days=13), habits=3) # points=3 — in prev window
        _day(db_session, uid, today - timedelta(days=14), tasks=10) # outside all windows
        db_session.commit()

        summary = ActivityReadService(db_session).get_activity_summary(uid, today)
        assert summary["points_prev_7d"] == 7   # 4 + 3

    def test_points_30d_total(self, db_session, sample_account_id):
        uid = sample_account_id
        today = date(2026, 2, 15)
        from datetime import timedelta
        _day(db_session, uid, today,                    tasks=10)  # 10
        _day(db_session, uid, today - timedelta(days=29), ops=1)   # 2 — edge, included
        _day(db_session, uid, today - timedelta(days=30), goals=1) # 5 — excluded
        db_session.commit()

        summary = ActivityReadService(db_session).get_activity_summary(uid, today)
        assert summary["points_30d_total"] == 12   # 10 + 2

    def test_points_30d_avg_always_divides_by_30(self, db_session, sample_account_id):
        uid = sample_account_id
        today = date(2026, 2, 15)
        _day(db_session, uid, today, tasks=30)  # points=30
        db_session.commit()

        summary = ActivityReadService(db_session).get_activity_summary(uid, today)
        assert summary["points_30d_avg"] == 1.0   # 30 / 30

    def test_best_day_is_highest_points_day(self, db_session, sample_account_id):
        uid = sample_account_id
        today = date(2026, 2, 15)
        from datetime import timedelta
        _day(db_session, uid, today,                    tasks=3)   # 3
        _day(db_session, uid, today - timedelta(days=5), goals=1)  # 5 — best
        _day(db_session, uid, today - timedelta(days=10), ops=1)   # 2
        db_session.commit()

        summary = ActivityReadService(db_session).get_activity_summary(uid, today)
        assert summary["best_day_points_30d"] == 5
        assert summary["best_day_date_30d"] == (today - timedelta(days=5)).strftime("%d-%m-%Y")

    def test_best_day_null_when_all_zero(self, db_session, sample_account_id):
        uid = sample_account_id
        summary = ActivityReadService(db_session).get_activity_summary(
            sample_account_id, date(2026, 2, 15)
        )
        assert summary["best_day_date_30d"] is None

    def test_activity_index_nonzero_when_points_exist(self, db_session, sample_account_id):
        uid = sample_account_id
        today = date(2026, 2, 15)
        _day(db_session, uid, today, ops=5)   # points = 10
        db_session.commit()

        summary = ActivityReadService(db_session).get_activity_summary(uid, today)
        assert summary["activity_index"] > 0

    def test_multiple_users_isolated(self, db_session):
        uid1, uid2 = 1, 2
        today = date(2026, 2, 15)
        _day(db_session, uid1, today, tasks=5)  # 5
        _day(db_session, uid2, today, ops=10)   # 20
        db_session.commit()

        s1 = ActivityReadService(db_session).get_activity_summary(uid1, today)
        s2 = ActivityReadService(db_session).get_activity_summary(uid2, today)
        assert s1["points_7d"] == 5
        assert s2["points_7d"] == 20

    def test_trend_positive_this_week_better(self, db_session, sample_account_id):
        uid = sample_account_id
        today = date(2026, 2, 15)
        from datetime import timedelta
        _day(db_session, uid, today, ops=10)                        # this week: 20 pts
        _day(db_session, uid, today - timedelta(days=10), ops=2)   # prev week: 4 pts
        db_session.commit()

        summary = ActivityReadService(db_session).get_activity_summary(uid, today)
        assert summary["trend_delta"] > 0

    def test_trend_negative_prev_week_better(self, db_session, sample_account_id):
        uid = sample_account_id
        today = date(2026, 2, 15)
        from datetime import timedelta
        _day(db_session, uid, today, ops=1)                         # this week: 2 pts
        _day(db_session, uid, today - timedelta(days=10), ops=10)  # prev week: 20 pts
        db_session.commit()

        summary = ActivityReadService(db_session).get_activity_summary(uid, today)
        assert summary["trend_delta"] < 0
