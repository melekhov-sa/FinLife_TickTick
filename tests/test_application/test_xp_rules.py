"""
Tests for XP early-completion bonus rules (preview_task_xp) and flash session
serialization.

Part A — preview_task_xp(due_date, completed_date_msk) -> int
Part B — flash dict round-trip via session (starlette session is a plain dict)
"""
import pytest
from datetime import date, timedelta

from app.readmodels.projectors.xp import (
    preview_task_xp,
    BASE_TASK_COMPLETED_XP,
    BONUS_EARLY_COMPLETE_XP,
)


# ---------------------------------------------------------------------------
# A — preview_task_xp pure function
# ---------------------------------------------------------------------------

class TestPreviewTaskXp:
    """Business rule: early = completed strictly BEFORE due_date (MSK calendar days)."""

    def test_no_due_date_returns_base(self):
        """Task without a deadline → base XP only."""
        assert preview_task_xp(None, date(2026, 2, 15)) == BASE_TASK_COMPLETED_XP

    def test_due_tomorrow_completed_today_gives_bonus(self):
        """Completed today, due tomorrow → early → bonus."""
        today = date(2026, 2, 15)
        tomorrow = today + timedelta(days=1)
        assert preview_task_xp(tomorrow, today) == BASE_TASK_COMPLETED_XP + BONUS_EARLY_COMPLETE_XP

    def test_due_today_completed_today_no_bonus(self):
        """Completed on the due day itself → NOT early → no bonus."""
        today = date(2026, 2, 15)
        assert preview_task_xp(today, today) == BASE_TASK_COMPLETED_XP

    def test_due_yesterday_completed_today_no_bonus(self):
        """Completed AFTER due_date → overdue → no bonus."""
        today = date(2026, 2, 15)
        yesterday = today - timedelta(days=1)
        assert preview_task_xp(yesterday, today) == BASE_TASK_COMPLETED_XP

    def test_due_far_future_completed_today_gives_bonus(self):
        """Due in a month, completed today → early → bonus."""
        today = date(2026, 2, 15)
        far_future = date(2026, 3, 15)
        assert preview_task_xp(far_future, today) == BASE_TASK_COMPLETED_XP + BONUS_EARLY_COMPLETE_XP

    def test_base_xp_constant_is_10(self):
        assert BASE_TASK_COMPLETED_XP == 10

    def test_bonus_xp_constant_is_2(self):
        assert BONUS_EARLY_COMPLETE_XP == 2

    def test_early_total_is_12(self):
        today = date(2026, 2, 15)
        due = date(2026, 2, 20)
        assert preview_task_xp(due, today) == 12

    def test_on_time_total_is_10(self):
        today = date(2026, 2, 15)
        assert preview_task_xp(today, today) == 10

    def test_overdue_total_is_10(self):
        today = date(2026, 2, 15)
        due = date(2026, 2, 10)
        assert preview_task_xp(due, today) == 10


# ---------------------------------------------------------------------------
# B — XP projector early bonus integration (with test DB)
# ---------------------------------------------------------------------------

from app.readmodels.projectors.xp import XpProjector
from app.infrastructure.db.models import EventLog, TaskModel, UserXpState, XpEvent


def _insert_task(db, account_id: int, task_id: int, due_date=None) -> TaskModel:
    task = TaskModel(
        task_id=task_id,
        account_id=account_id,
        title=f"Task {task_id}",
        status="ACTIVE",
        due_date=due_date,
    )
    db.add(task)
    db.flush()
    return task


def _insert_event(db, account_id: int, event_id: int, event_type: str,
                  payload: dict, occurred_at) -> EventLog:
    from sqlalchemy.dialects.postgresql import JSONB
    ev = EventLog(
        id=event_id,
        account_id=account_id,
        event_type=event_type,
        payload_json=payload,
        occurred_at=occurred_at,
    )
    db.add(ev)
    db.flush()
    return ev


class TestXpProjectorEarlyBonus:
    def test_task_without_due_date_awards_base_xp(self, db_session, sample_account_id):
        from datetime import datetime, timezone
        uid = sample_account_id
        _insert_task(db_session, uid, task_id=1, due_date=None)
        _insert_event(db_session, uid, event_id=1,
                      event_type="task_completed",
                      payload={"task_id": 1},
                      occurred_at=datetime(2026, 2, 15, 12, 0, tzinfo=timezone.utc))
        db_session.commit()

        XpProjector(db_session).run(uid, event_types=["task_completed"])

        ev = db_session.query(XpEvent).filter(XpEvent.user_id == uid).first()
        assert ev.xp_amount == BASE_TASK_COMPLETED_XP

    def test_task_completed_before_due_date_awards_bonus(self, db_session, sample_account_id):
        from datetime import datetime, timezone
        uid = sample_account_id
        due = date(2026, 2, 20)        # task due Feb 20
        _insert_task(db_session, uid, task_id=1, due_date=due)
        # Completed on Feb 15 (MSK noon = 9:00 UTC — still Feb 15 MSK)
        _insert_event(db_session, uid, event_id=1,
                      event_type="task_completed",
                      payload={"task_id": 1},
                      occurred_at=datetime(2026, 2, 15, 12, 0, tzinfo=timezone.utc))
        db_session.commit()

        XpProjector(db_session).run(uid, event_types=["task_completed"])

        ev = db_session.query(XpEvent).filter(XpEvent.user_id == uid).first()
        assert ev.xp_amount == BASE_TASK_COMPLETED_XP + BONUS_EARLY_COMPLETE_XP

    def test_task_completed_on_due_date_no_bonus(self, db_session, sample_account_id):
        from datetime import datetime, timezone
        uid = sample_account_id
        due = date(2026, 2, 15)        # due today
        _insert_task(db_session, uid, task_id=1, due_date=due)
        _insert_event(db_session, uid, event_id=1,
                      event_type="task_completed",
                      payload={"task_id": 1},
                      occurred_at=datetime(2026, 2, 15, 12, 0, tzinfo=timezone.utc))
        db_session.commit()

        XpProjector(db_session).run(uid, event_types=["task_completed"])

        ev = db_session.query(XpEvent).filter(XpEvent.user_id == uid).first()
        assert ev.xp_amount == BASE_TASK_COMPLETED_XP

    def test_task_completed_after_due_date_no_bonus(self, db_session, sample_account_id):
        from datetime import datetime, timezone
        uid = sample_account_id
        due = date(2026, 2, 10)        # due in the past
        _insert_task(db_session, uid, task_id=1, due_date=due)
        _insert_event(db_session, uid, event_id=1,
                      event_type="task_completed",
                      payload={"task_id": 1},
                      occurred_at=datetime(2026, 2, 15, 12, 0, tzinfo=timezone.utc))
        db_session.commit()

        XpProjector(db_session).run(uid, event_types=["task_completed"])

        ev = db_session.query(XpEvent).filter(XpEvent.user_id == uid).first()
        assert ev.xp_amount == BASE_TASK_COMPLETED_XP

    def test_early_bonus_reflected_in_user_xp_state(self, db_session, sample_account_id):
        from datetime import datetime, timezone
        uid = sample_account_id
        due = date(2026, 3, 1)   # far in future
        _insert_task(db_session, uid, task_id=1, due_date=due)
        _insert_event(db_session, uid, event_id=1,
                      event_type="task_completed",
                      payload={"task_id": 1},
                      occurred_at=datetime(2026, 2, 15, 12, 0, tzinfo=timezone.utc))
        db_session.commit()

        XpProjector(db_session).run(uid, event_types=["task_completed"])

        state = db_session.query(UserXpState).filter(UserXpState.user_id == uid).first()
        assert state.total_xp == BASE_TASK_COMPLETED_XP + BONUS_EARLY_COMPLETE_XP


# ---------------------------------------------------------------------------
# C — Flash session dict round-trip (pure dict, no HTTP needed)
# ---------------------------------------------------------------------------

class TestFlashSession:
    def test_flash_written_and_readable(self):
        """Simulate writing a flash to the session dict and reading it back."""
        session = {}
        session["flash"] = {"message": "🎉 +12 XP"}
        assert session.get("flash") == {"message": "🎉 +12 XP"}

    def test_flash_pop_clears_key(self):
        session = {"flash": {"message": "🎉 +10 XP"}}
        val = session.pop("flash", None)
        assert val == {"message": "🎉 +10 XP"}
        assert "flash" not in session

    def test_flash_pop_missing_returns_none(self):
        session = {}
        val = session.pop("flash", None)
        assert val is None

    def test_flash_message_contains_xp_delta(self):
        xp_delta = 12
        flash = {"message": f"🎉 +{xp_delta} XP"}
        assert "+12 XP" in flash["message"]
