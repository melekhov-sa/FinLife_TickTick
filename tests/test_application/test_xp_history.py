"""
Tests for XP history service: describe_xp_event, list_paginated, and filters.
"""
import pytest
from datetime import datetime, timezone, timedelta, date

from app.application.xp_history import describe_xp_event, XpHistoryService
from app.infrastructure.db.models import XpEvent


MSK = timezone(timedelta(hours=3))
UTC = timezone.utc


# ---------------------------------------------------------------------------
# describe_xp_event — pure function, no DB
# ---------------------------------------------------------------------------

class TestDescribeXpEvent:
    def test_task_with_title(self):
        assert describe_xp_event("task_completed", title="Купить продукты") == \
            "Закрыта задача: «Купить продукты»"

    def test_task_occurrence_with_title(self):
        assert describe_xp_event("task_occurrence_completed", title="Звонок врачу") == \
            "Закрыта задача: «Звонок врачу»"

    def test_task_without_title(self):
        assert describe_xp_event("task_completed") == "Закрыта задача"

    def test_habit_with_title(self):
        assert describe_xp_event("habit_occurrence_completed", title="Зарядка") == \
            "Выполнена привычка: «Зарядка»"

    def test_habit_without_title(self):
        assert describe_xp_event("habit_occurrence_completed") == "Выполнена привычка"

    def test_transaction_with_description(self):
        assert describe_xp_event("transaction_created", extra="Кофе") == \
            "Добавлена операция: Кофе"

    def test_transaction_without_description(self):
        assert describe_xp_event("transaction_created") == "Добавлена операция"

    def test_goal_achieved(self):
        assert describe_xp_event("goal_achieved") == "Достигнута цель"

    def test_goal_with_title(self):
        assert describe_xp_event("goal_achieved", title="Отпуск") == \
            "Достигнута цель: «Отпуск»"

    def test_unknown_reason_returns_default(self):
        assert describe_xp_event("some_future_event") == "Начисление XP"

    def test_empty_string_reason(self):
        assert describe_xp_event("") == "Начисление XP"

    def test_title_takes_priority_over_extra_for_non_transaction(self):
        # For non-transaction events, title is used, extra is ignored
        result = describe_xp_event("task_completed", title="Задача", extra="ignored")
        assert result == "Закрыта задача: «Задача»"

    def test_extra_is_used_for_transaction_not_title(self):
        # For transactions, extra (description) is used; title is irrelevant
        result = describe_xp_event("transaction_created", title="ignored", extra="Продукты")
        assert result == "Добавлена операция: Продукты"


# ---------------------------------------------------------------------------
# XpHistoryService — DB tests
# ---------------------------------------------------------------------------

def _make_xp_event(db, user_id: int, event_id: int, xp_amount: int,
                   reason: str, created_at: datetime) -> XpEvent:
    """Helper: insert an XpEvent without a corresponding EventLog row."""
    ev = XpEvent(
        id=event_id,
        user_id=user_id,
        source_event_id=event_id,   # no real EventLog row; outerjoin gives None
        xp_amount=xp_amount,
        reason=reason,
        created_at=created_at,
    )
    db.add(ev)
    db.flush()
    return ev


class TestXpHistoryPagination:
    def test_page1_returns_first_page_size_items(self, db_session, sample_account_id):
        uid = sample_account_id
        # Insert 25 events
        for i in range(1, 26):
            _make_xp_event(db_session, uid, i, 10, "task_completed",
                           datetime(2026, 2, i % 28 + 1, 12, 0, tzinfo=UTC))
        db_session.commit()

        items, total, total_pages = XpHistoryService(db_session).list_paginated(uid, page=1, page_size=20)
        assert len(items) == 20
        assert total == 25
        assert total_pages == 2

    def test_page2_returns_remaining_items(self, db_session, sample_account_id):
        uid = sample_account_id
        for i in range(1, 26):
            _make_xp_event(db_session, uid, i, 10, "task_completed",
                           datetime(2026, 2, i % 28 + 1, 12, 0, tzinfo=UTC))
        db_session.commit()

        items, total, total_pages = XpHistoryService(db_session).list_paginated(uid, page=2, page_size=20)
        assert len(items) == 5
        assert total == 25

    def test_empty_result_returns_zero_total(self, db_session, sample_account_id):
        items, total, total_pages = XpHistoryService(db_session).list_paginated(sample_account_id)
        assert items == []
        assert total == 0
        assert total_pages == 1  # at least 1 page (empty)

    def test_exactly_one_page(self, db_session, sample_account_id):
        uid = sample_account_id
        for i in range(1, 6):
            _make_xp_event(db_session, uid, i, 5, "transaction_created",
                           datetime(2026, 2, 1, tzinfo=UTC))
        db_session.commit()

        items, total, total_pages = XpHistoryService(db_session).list_paginated(uid, page=1, page_size=20)
        assert total == 5
        assert total_pages == 1
        assert len(items) == 5

    def test_page_clamped_to_total_pages(self, db_session, sample_account_id):
        uid = sample_account_id
        _make_xp_event(db_session, uid, 1, 10, "task_completed",
                       datetime(2026, 2, 1, tzinfo=UTC))
        db_session.commit()

        # Requesting page 99 but total_pages == 1 → should return last valid page
        items, total, total_pages = XpHistoryService(db_session).list_paginated(uid, page=99, page_size=20)
        assert total_pages == 1
        assert len(items) == 1


class TestXpHistoryFilters:
    def test_min_xp_filters_small_events(self, db_session, sample_account_id):
        uid = sample_account_id
        _make_xp_event(db_session, uid, 1, 3,  "habit_occurrence_completed", datetime(2026, 2, 1, tzinfo=UTC))
        _make_xp_event(db_session, uid, 2, 10, "task_completed",             datetime(2026, 2, 2, tzinfo=UTC))
        _make_xp_event(db_session, uid, 3, 5,  "transaction_created",        datetime(2026, 2, 3, tzinfo=UTC))
        db_session.commit()

        items, total, _ = XpHistoryService(db_session).list_paginated(uid, min_xp=5)
        assert total == 2
        assert all(e["xp_amount"] >= 5 for e in items)

    def test_min_xp_none_returns_all(self, db_session, sample_account_id):
        uid = sample_account_id
        _make_xp_event(db_session, uid, 1, 3,  "habit_occurrence_completed", datetime(2026, 2, 1, tzinfo=UTC))
        _make_xp_event(db_session, uid, 2, 10, "task_completed",             datetime(2026, 2, 2, tzinfo=UTC))
        db_session.commit()

        _, total, _ = XpHistoryService(db_session).list_paginated(uid, min_xp=None)
        assert total == 2

    def test_reason_filter(self, db_session, sample_account_id):
        uid = sample_account_id
        _make_xp_event(db_session, uid, 1, 10, "task_completed",             datetime(2026, 2, 1, tzinfo=UTC))
        _make_xp_event(db_session, uid, 2, 3,  "habit_occurrence_completed", datetime(2026, 2, 2, tzinfo=UTC))
        _make_xp_event(db_session, uid, 3, 10, "task_completed",             datetime(2026, 2, 3, tzinfo=UTC))
        db_session.commit()

        items, total, _ = XpHistoryService(db_session).list_paginated(uid, reason="task_completed")
        assert total == 2
        assert all(e["reason"] == "task_completed" for e in items)

    def test_reason_filter_no_match(self, db_session, sample_account_id):
        uid = sample_account_id
        _make_xp_event(db_session, uid, 1, 10, "task_completed", datetime(2026, 2, 1, tzinfo=UTC))
        db_session.commit()

        _, total, _ = XpHistoryService(db_session).list_paginated(uid, reason="goal_achieved")
        assert total == 0

    def test_from_date_filter(self, db_session, sample_account_id):
        """Events clearly before the from_date are excluded; events after are included.

        Uses dates far apart (whole months) so the MSK±3h offset is irrelevant
        when SQLite compares naive datetime strings.
        """
        uid = sample_account_id
        # January — well before a March filter boundary
        _make_xp_event(db_session, uid, 1, 10, "task_completed",
                       datetime(2026, 1, 15, 12, 0))   # Jan 15 noon
        # April — well after a March filter boundary
        _make_xp_event(db_session, uid, 2, 10, "task_completed",
                       datetime(2026, 4, 15, 12, 0))   # Apr 15 noon
        db_session.commit()

        items, total, _ = XpHistoryService(db_session).list_paginated(
            uid, from_date=date(2026, 3, 1)
        )
        assert total == 1

    def test_to_date_filter(self, db_session, sample_account_id):
        """Events clearly after the to_date are excluded; events before are included.

        Uses dates far apart (whole months) so the MSK±3h offset is irrelevant.
        """
        uid = sample_account_id
        # January — well before a February to_date boundary
        _make_xp_event(db_session, uid, 1, 10, "task_completed",
                       datetime(2026, 1, 15, 12, 0))   # Jan 15 noon
        # April — well after a February to_date boundary
        _make_xp_event(db_session, uid, 2, 10, "task_completed",
                       datetime(2026, 4, 15, 12, 0))   # Apr 15 noon
        db_session.commit()

        items, total, _ = XpHistoryService(db_session).list_paginated(
            uid, to_date=date(2026, 2, 28)
        )
        assert total == 1


class TestListRecent:
    def test_returns_at_most_limit(self, db_session, sample_account_id):
        uid = sample_account_id
        for i in range(1, 11):
            _make_xp_event(db_session, uid, i, 10, "task_completed",
                           datetime(2026, 2, 1, i, 0, tzinfo=UTC))
        db_session.commit()

        items = XpHistoryService(db_session).list_recent(uid, limit=5)
        assert len(items) == 5

    def test_returns_most_recent_first(self, db_session, sample_account_id):
        uid = sample_account_id
        _make_xp_event(db_session, uid, 1, 10, "task_completed",
                       datetime(2026, 2, 1, 10, 0, tzinfo=UTC))
        _make_xp_event(db_session, uid, 2, 10, "habit_occurrence_completed",
                       datetime(2026, 2, 2, 10, 0, tzinfo=UTC))
        db_session.commit()

        items = XpHistoryService(db_session).list_recent(uid, limit=5)
        # Most recent (habit, Feb 2) should come first
        assert items[0]["reason"] == "habit_occurrence_completed"

    def test_each_item_has_required_keys(self, db_session, sample_account_id):
        uid = sample_account_id
        _make_xp_event(db_session, uid, 1, 10, "task_completed",
                       datetime(2026, 2, 1, tzinfo=UTC))
        db_session.commit()

        items = XpHistoryService(db_session).list_recent(uid, limit=5)
        assert len(items) == 1
        item = items[0]
        assert "created_at" in item
        assert "description" in item
        assert "xp_amount" in item
        assert "reason" in item
        assert item["xp_amount"] == 10
        assert item["description"] == "Закрыта задача"  # no EventLog → no title
