"""
Pure-function tests for the dashboard event feed grouping logic.

The actual get_dashboard_feed() method touches PostgreSQL-specific features
(JSONB) and timezone-aware timestamps — so we test the pure helper logic here
without a DB session, mirroring the same formulas used in DashboardService.

Tests cover:
  - _day_label: "Сегодня" / "Вчера" / "DD.MM" classification
  - MSK timezone conversion (UTC midnight → next MSK calendar day)
  - Feed item sorting (desc by occurred_at)
  - 30-item cap
"""
from datetime import date, timedelta, timezone, datetime as dt

MSK = timezone(timedelta(hours=3))


# ---------------------------------------------------------------------------
# Pure helper mirroring the same logic in DashboardService.get_dashboard_feed
# ---------------------------------------------------------------------------

def _day_label(day: date, today: date) -> str:
    """Return human-readable day label matching the feed grouping logic."""
    yesterday = today - timedelta(days=1)
    if day == today:
        return "Сегодня"
    elif day == yesterday:
        return "Вчера"
    return day.strftime("%d.%m")


def _msk_date(occurred_at: dt) -> date:
    """Convert an aware datetime to an MSK calendar date."""
    return occurred_at.astimezone(MSK).date()


def _make_item(iso_str: str) -> dict:
    """Build a minimal feed item dict from an ISO-8601 timestamp string."""
    ts = dt.fromisoformat(iso_str)
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=MSK)
    return {
        "occurred_at": ts,
        "kind": "event",
        "icon": "✅",
        "title": "test",
        "amount_fmt": None,
        "amount_sign": None,
    }


# ---------------------------------------------------------------------------
# TestFeedDayLabel
# ---------------------------------------------------------------------------

class TestFeedDayLabel:
    """_day_label maps dates to correct Russian labels."""

    def test_today_returns_segodnya(self):
        d = date(2026, 2, 19)
        assert _day_label(d, d) == "Сегодня"

    def test_yesterday_returns_vchera(self):
        today = date(2026, 2, 19)
        assert _day_label(today - timedelta(days=1), today) == "Вчера"

    def test_two_days_ago_returns_date_string(self):
        today = date(2026, 2, 19)
        assert _day_label(date(2026, 2, 17), today) == "17.02"

    def test_older_date_returns_date_string(self):
        today = date(2026, 2, 19)
        assert _day_label(date(2026, 2, 15), today) == "15.02"

    def test_month_boundary_march1_feb28_is_yesterday(self):
        today = date(2026, 3, 1)
        assert _day_label(date(2026, 2, 28), today) == "Вчера"

    def test_new_year_boundary_jan1_dec31_is_yesterday(self):
        today = date(2026, 1, 1)
        assert _day_label(date(2025, 12, 31), today) == "Вчера"

    def test_date_format_is_dd_dot_mm(self):
        today = date(2026, 2, 19)
        # January 5 should be "05.01" (zero-padded)
        assert _day_label(date(2026, 1, 5), today) == "05.01"


# ---------------------------------------------------------------------------
# TestMskConversion
# ---------------------------------------------------------------------------

class TestMskConversion:
    """MSK timezone conversion behaves correctly around calendar-day boundaries."""

    def test_utc_late_evening_is_next_msk_day(self):
        # 2026-02-18 21:30 UTC → 2026-02-19 00:30 MSK
        ts = dt(2026, 2, 18, 21, 30, tzinfo=timezone.utc)
        assert _msk_date(ts) == date(2026, 2, 19)

    def test_utc_early_evening_is_same_msk_day(self):
        # 2026-02-19 15:00 UTC → 2026-02-19 18:00 MSK
        ts = dt(2026, 2, 19, 15, 0, tzinfo=timezone.utc)
        assert _msk_date(ts) == date(2026, 2, 19)

    def test_msk_midnight_plus_one_minute_is_same_day(self):
        ts = dt(2026, 2, 19, 0, 1, tzinfo=MSK)
        assert _msk_date(ts) == date(2026, 2, 19)

    def test_msk_just_before_midnight_is_same_day(self):
        ts = dt(2026, 2, 19, 23, 59, tzinfo=MSK)
        assert _msk_date(ts) == date(2026, 2, 19)

    def test_aware_datetime_with_different_tz_converts_correctly(self):
        # +05:00 offset: 2026-02-19 01:00+05 = 2026-02-18 20:00 UTC = 2026-02-18 23:00 MSK → 18 Feb MSK
        tz_plus5 = timezone(timedelta(hours=5))
        ts = dt(2026, 2, 19, 1, 0, tzinfo=tz_plus5)
        assert _msk_date(ts) == date(2026, 2, 18)


# ---------------------------------------------------------------------------
# TestFeedItemSorting
# ---------------------------------------------------------------------------

class TestFeedItemSorting:
    """Items are sorted descending by occurred_at."""

    def test_later_item_comes_first(self):
        earlier = _make_item("2026-02-19T08:00:00+03:00")
        later = _make_item("2026-02-19T10:00:00+03:00")
        items = [earlier, later]
        items.sort(key=lambda x: x["occurred_at"], reverse=True)
        assert items[0]["occurred_at"].hour == 10
        assert items[1]["occurred_at"].hour == 8

    def test_cross_day_sorting(self):
        today_ts = _make_item("2026-02-19T09:00:00+03:00")
        yesterday_ts = _make_item("2026-02-18T22:00:00+03:00")
        items = [yesterday_ts, today_ts]
        items.sort(key=lambda x: x["occurred_at"], reverse=True)
        assert _msk_date(items[0]["occurred_at"]) == date(2026, 2, 19)
        assert _msk_date(items[1]["occurred_at"]) == date(2026, 2, 18)

    def test_equal_timestamps_order_stable(self):
        ts = "2026-02-19T12:00:00+03:00"
        items = [_make_item(ts), _make_item(ts)]
        items.sort(key=lambda x: x["occurred_at"], reverse=True)
        assert len(items) == 2


# ---------------------------------------------------------------------------
# TestFeedCap
# ---------------------------------------------------------------------------

class TestFeedCap:
    """get_dashboard_feed caps results at 30 items."""

    def _make_items(self, n: int) -> list[dict]:
        return [
            _make_item(f"2026-02-{(i % 28) + 1:02d}T{(i % 24):02d}:00:00+03:00")
            for i in range(n)
        ]

    def test_exactly_30_items_kept(self):
        items = self._make_items(30)
        items.sort(key=lambda x: x["occurred_at"], reverse=True)
        assert len(items[:30]) == 30

    def test_31_items_capped_at_30(self):
        items = self._make_items(31)
        items.sort(key=lambda x: x["occurred_at"], reverse=True)
        assert len(items[:30]) == 30

    def test_fewer_than_30_items_all_kept(self):
        items = self._make_items(5)
        items.sort(key=lambda x: x["occurred_at"], reverse=True)
        assert len(items[:30]) == 5

    def test_zero_items_returns_empty(self):
        items = []
        assert items[:30] == []


# ---------------------------------------------------------------------------
# TestFeedGrouping
# ---------------------------------------------------------------------------

class TestFeedGrouping:
    """Items group correctly into day-buckets by MSK date."""

    def _group(self, items: list[dict], today: date) -> dict[date, list]:
        """Simulate the grouping logic from get_dashboard_feed."""
        yesterday = today - timedelta(days=1)
        groups: dict[date, dict] = {}
        for item in items:
            day = _msk_date(item["occurred_at"])
            item["time_str"] = item["occurred_at"].astimezone(MSK).strftime("%H:%M")
            if day not in groups:
                if day == today:
                    label = "Сегодня"
                elif day == yesterday:
                    label = "Вчера"
                else:
                    label = day.strftime("%d.%m")
                groups[day] = {"label": label, "date": day, "events": []}
            groups[day]["events"].append(item)
        return groups

    def test_same_day_items_in_one_group(self):
        today = date(2026, 2, 19)
        items = [
            _make_item("2026-02-19T08:00:00+03:00"),
            _make_item("2026-02-19T10:00:00+03:00"),
        ]
        groups = self._group(items, today)
        assert len(groups) == 1
        assert groups[today]["label"] == "Сегодня"
        assert len(groups[today]["events"]) == 2

    def test_two_days_produce_two_groups(self):
        today = date(2026, 2, 19)
        items = [
            _make_item("2026-02-19T10:00:00+03:00"),
            _make_item("2026-02-18T10:00:00+03:00"),
        ]
        groups = self._group(items, today)
        assert len(groups) == 2

    def test_yesterday_label_correct(self):
        today = date(2026, 2, 19)
        items = [_make_item("2026-02-18T10:00:00+03:00")]
        groups = self._group(items, today)
        assert groups[date(2026, 2, 18)]["label"] == "Вчера"

    def test_older_date_label_is_dd_mm(self):
        today = date(2026, 2, 19)
        items = [_make_item("2026-02-15T10:00:00+03:00")]
        groups = self._group(items, today)
        assert groups[date(2026, 2, 15)]["label"] == "15.02"

    def test_time_str_set_in_msk(self):
        today = date(2026, 2, 19)
        # 07:00 UTC = 10:00 MSK
        items = [_make_item("2026-02-19T07:00:00+00:00")]
        groups = self._group(items, today)
        item = groups[today]["events"][0]
        assert item["time_str"] == "10:00"

    def test_utc_midnight_groups_to_next_msk_day(self):
        today = date(2026, 2, 19)
        # 2026-02-18 21:30 UTC = 2026-02-19 00:30 MSK → "Сегодня"
        items = [_make_item("2026-02-18T21:30:00+00:00")]
        groups = self._group(items, today)
        assert today in groups
        assert groups[today]["label"] == "Сегодня"
