"""
Tests for task productivity analytics (_build_task_analytics).
Uses the same in-memory SQLite setup as other application tests.
"""
import pytest
from datetime import date, datetime, timedelta, timezone

from app.infrastructure.db.models import TaskModel, WorkCategory
from app.api.v1.pages import _build_task_analytics


def _utc(d: date, hour: int = 12) -> datetime:
    """Helper: date → datetime at given hour UTC."""
    return datetime(d.year, d.month, d.day, hour, 0, 0, tzinfo=timezone.utc)


class TestTaskAnalyticsPeriods:
    """Tests for 7d/30d created/completed counts."""

    def test_created_and_completed_in_7_days(self, db_session, sample_account_id):
        today = date.today()
        # 3 tasks created within 7 days, 2 completed
        for i in range(3):
            t = TaskModel(
                account_id=sample_account_id, title=f"Task {i}",
                created_at=_utc(today - timedelta(days=i)),
                status="DONE" if i < 2 else "ACTIVE",
                completed_at=_utc(today - timedelta(days=i)) if i < 2 else None,
            )
            db_session.add(t)
        db_session.flush()

        result = _build_task_analytics(db_session, sample_account_id, today, [])
        assert result["days7"]["created"] == 3
        assert result["days7"]["completed"] == 2
        assert result["days7"]["completion_rate"] == 67  # round(2/3*100)

    def test_old_tasks_excluded_from_7_days(self, db_session, sample_account_id):
        today = date.today()
        # Task created 10 days ago — outside 7d window
        t = TaskModel(
            account_id=sample_account_id, title="Old",
            created_at=_utc(today - timedelta(days=10)),
            status="DONE",
            completed_at=_utc(today - timedelta(days=10)),
        )
        db_session.add(t)
        db_session.flush()

        result = _build_task_analytics(db_session, sample_account_id, today, [])
        assert result["days7"]["created"] == 0
        assert result["days7"]["completed"] == 0

    def test_30_day_window(self, db_session, sample_account_id):
        today = date.today()
        # Task created 20 days ago — in 30d window, outside 7d
        t = TaskModel(
            account_id=sample_account_id, title="Mid",
            created_at=_utc(today - timedelta(days=20)),
            status="DONE",
            completed_at=_utc(today - timedelta(days=15)),
        )
        db_session.add(t)
        db_session.flush()

        result = _build_task_analytics(db_session, sample_account_id, today, [])
        assert result["days7"]["created"] == 0
        assert result["days30"]["created"] == 1
        assert result["days30"]["completed"] == 1

    def test_zero_created_rate_is_zero(self, db_session, sample_account_id):
        today = date.today()
        result = _build_task_analytics(db_session, sample_account_id, today, [])
        assert result["days7"]["completion_rate"] == 0
        assert result["days30"]["completion_rate"] == 0


class TestTaskAnalyticsByCategory:
    """Tests for by-category 30-day breakdown."""

    def test_group_by_category(self, db_session, sample_account_id):
        today = date.today()
        cat = WorkCategory(
            account_id=sample_account_id, title="Работа", emoji="💼",
        )
        db_session.add(cat)
        db_session.flush()

        for i in range(4):
            t = TaskModel(
                account_id=sample_account_id, title=f"Work {i}",
                category_id=cat.category_id,
                created_at=_utc(today - timedelta(days=i)),
                status="DONE" if i < 3 else "ACTIVE",
                completed_at=_utc(today - timedelta(days=i)) if i < 3 else None,
            )
            db_session.add(t)
        db_session.flush()

        result = _build_task_analytics(db_session, sample_account_id, today, [cat])
        rows = result["by_category_30"]
        assert len(rows) == 1
        assert rows[0]["category_name"] == "💼 Работа"
        assert rows[0]["created"] == 4
        assert rows[0]["completed"] == 3
        assert rows[0]["rate"] == 75

    def test_no_category_shows_bez_kategorii(self, db_session, sample_account_id):
        today = date.today()
        t = TaskModel(
            account_id=sample_account_id, title="Uncategorized",
            category_id=None,
            created_at=_utc(today),
            status="ACTIVE",
        )
        db_session.add(t)
        db_session.flush()

        result = _build_task_analytics(db_session, sample_account_id, today, [])
        rows = result["by_category_30"]
        assert len(rows) == 1
        assert rows[0]["category_name"] == "Без категории"
        assert rows[0]["created"] == 1
        assert rows[0]["completed"] == 0

    def test_top_8_limit(self, db_session, sample_account_id):
        today = date.today()
        cats = []
        for i in range(10):
            c = WorkCategory(
                account_id=sample_account_id, title=f"Cat {i}",
            )
            db_session.add(c)
            db_session.flush()
            cats.append(c)
            t = TaskModel(
                account_id=sample_account_id, title=f"T{i}",
                category_id=c.category_id,
                created_at=_utc(today),
                status="DONE",
                completed_at=_utc(today),
            )
            db_session.add(t)
        db_session.flush()

        result = _build_task_analytics(db_session, sample_account_id, today, cats)
        assert len(result["by_category_30"]) == 8

    def test_sorted_by_completed_desc(self, db_session, sample_account_id):
        today = date.today()
        cat_a = WorkCategory(account_id=sample_account_id, title="A")
        cat_b = WorkCategory(account_id=sample_account_id, title="B")
        db_session.add_all([cat_a, cat_b])
        db_session.flush()

        # Cat A: 1 completed, Cat B: 3 completed
        for _ in range(1):
            db_session.add(TaskModel(
                account_id=sample_account_id, title="a",
                category_id=cat_a.category_id,
                created_at=_utc(today), status="DONE", completed_at=_utc(today),
            ))
        for _ in range(3):
            db_session.add(TaskModel(
                account_id=sample_account_id, title="b",
                category_id=cat_b.category_id,
                created_at=_utc(today), status="DONE", completed_at=_utc(today),
            ))
        db_session.flush()

        result = _build_task_analytics(db_session, sample_account_id, today, [cat_a, cat_b])
        rows = result["by_category_30"]
        assert rows[0]["category_name"] == "B"
        assert rows[1]["category_name"] == "A"


class TestProductivity7Days:
    """Tests for daily mini-chart data (productivity_7)."""

    def test_returns_7_entries(self, db_session, sample_account_id):
        today = date.today()
        result = _build_task_analytics(db_session, sample_account_id, today, [])
        assert len(result["productivity_7"]) == 7

    def test_last_entry_is_today(self, db_session, sample_account_id):
        today = date.today()
        result = _build_task_analytics(db_session, sample_account_id, today, [])
        last = result["productivity_7"][-1]
        assert last["date"] == today.isoformat()
        assert last["is_today"] is True

    def test_first_entry_is_6_days_ago(self, db_session, sample_account_id):
        today = date.today()
        result = _build_task_analytics(db_session, sample_account_id, today, [])
        first = result["productivity_7"][0]
        assert first["date"] == (today - timedelta(days=6)).isoformat()
        assert first["is_today"] is False

    def test_counts_completed_per_day(self, db_session, sample_account_id):
        today = date.today()
        yesterday = today - timedelta(days=1)
        # 2 tasks completed today, 1 yesterday
        for _ in range(2):
            db_session.add(TaskModel(
                account_id=sample_account_id, title="t",
                created_at=_utc(today), status="DONE", completed_at=_utc(today),
            ))
        db_session.add(TaskModel(
            account_id=sample_account_id, title="y",
            created_at=_utc(yesterday), status="DONE", completed_at=_utc(yesterday),
        ))
        db_session.flush()

        result = _build_task_analytics(db_session, sample_account_id, today, [])
        p7 = result["productivity_7"]
        today_entry = [e for e in p7 if e["date"] == today.isoformat()][0]
        yesterday_entry = [e for e in p7 if e["date"] == yesterday.isoformat()][0]
        assert today_entry["count"] == 2
        assert yesterday_entry["count"] == 1

    def test_zero_days_have_count_zero(self, db_session, sample_account_id):
        today = date.today()
        result = _build_task_analytics(db_session, sample_account_id, today, [])
        assert all(e["count"] == 0 for e in result["productivity_7"])

    def test_weekday_labels_are_russian(self, db_session, sample_account_id):
        today = date.today()
        result = _build_task_analytics(db_session, sample_account_id, today, [])
        valid_labels = {"Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"}
        for e in result["productivity_7"]:
            assert e["weekday"] in valid_labels
