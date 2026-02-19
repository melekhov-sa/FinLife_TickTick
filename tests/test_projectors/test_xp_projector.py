"""
Tests for XpProjector and compute_level helper.
"""
import pytest
from datetime import datetime

from app.readmodels.projectors.xp import XpProjector, compute_level
from app.infrastructure.db.models import EventLog, UserXpState, XpEvent


# ---------------------------------------------------------------------------
# compute_level
# ---------------------------------------------------------------------------

def test_compute_level_zero_xp():
    level, current, to_next = compute_level(0)
    assert level == 1
    assert current == 0
    assert to_next == 100  # 100 * 1² = 100


def test_compute_level_exactly_level2_threshold():
    # Level 1 requires 100 XP (100*1²). At 100 XP, should be level 2.
    level, current, to_next = compute_level(100)
    assert level == 2
    assert current == 0
    assert to_next == 400  # 100 * 2² = 400


def test_compute_level_midway_through_level2():
    # 100 XP for level 1, then 200 more into level 2
    level, current, to_next = compute_level(300)
    assert level == 2
    assert current == 200
    assert to_next == 400


def test_compute_level_exactly_level3_threshold():
    # Level 1: 100, Level 2: 400 → total 500 to reach level 3
    level, current, to_next = compute_level(500)
    assert level == 3
    assert current == 0
    assert to_next == 900  # 100 * 3² = 900


def test_compute_level_high_xp():
    # Sanity check: level 4 requires 100+400+900 = 1400 XP
    level, current, to_next = compute_level(1400)
    assert level == 4
    assert current == 0
    assert to_next == 1600  # 100 * 4² = 1600


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _make_event(db_session, event_id: int, account_id: int, event_type: str) -> EventLog:
    ev = EventLog(
        id=event_id,
        account_id=account_id,
        event_type=event_type,
        payload_json={"event_id": event_id},
        occurred_at=datetime.utcnow(),
    )
    db_session.add(ev)
    db_session.flush()
    return ev


# ---------------------------------------------------------------------------
# XpProjector — basic XP awarding
# ---------------------------------------------------------------------------

def test_xp_awarded_for_task_completed(db_session, sample_account_id):
    _make_event(db_session, 1, sample_account_id, "task_completed")
    db_session.commit()

    count = XpProjector(db_session).run(sample_account_id, event_types=["task_completed"])

    assert count == 1
    state = db_session.query(UserXpState).filter_by(user_id=sample_account_id).first()
    assert state is not None
    assert state.total_xp == 10
    assert state.level == 1


def test_xp_awarded_for_task_occurrence_completed(db_session, sample_account_id):
    _make_event(db_session, 1, sample_account_id, "task_occurrence_completed")
    db_session.commit()

    XpProjector(db_session).run(sample_account_id, event_types=["task_occurrence_completed"])

    state = db_session.query(UserXpState).filter_by(user_id=sample_account_id).first()
    assert state.total_xp == 10


def test_xp_awarded_for_habit_occurrence_completed(db_session, sample_account_id):
    _make_event(db_session, 1, sample_account_id, "habit_occurrence_completed")
    db_session.commit()

    XpProjector(db_session).run(sample_account_id, event_types=["habit_occurrence_completed"])

    state = db_session.query(UserXpState).filter_by(user_id=sample_account_id).first()
    assert state.total_xp == 3


def test_xp_awarded_for_transaction_created(db_session, sample_account_id):
    _make_event(db_session, 1, sample_account_id, "transaction_created")
    db_session.commit()

    XpProjector(db_session).run(sample_account_id, event_types=["transaction_created"])

    state = db_session.query(UserXpState).filter_by(user_id=sample_account_id).first()
    assert state.total_xp == 5


def test_unknown_event_type_is_ignored(db_session, sample_account_id):
    _make_event(db_session, 1, sample_account_id, "wallet_created")
    db_session.commit()

    count = XpProjector(db_session).run(sample_account_id, event_types=["wallet_created"])

    # Event was processed (counted by projector), but no XP awarded
    assert count == 1
    state = db_session.query(UserXpState).filter_by(user_id=sample_account_id).first()
    assert state is None


# ---------------------------------------------------------------------------
# Idempotency
# ---------------------------------------------------------------------------

def test_idempotency_running_projector_twice_does_not_double_award(db_session, sample_account_id):
    _make_event(db_session, 1, sample_account_id, "task_completed")
    db_session.commit()

    projector = XpProjector(db_session)
    projector.run(sample_account_id, event_types=["task_completed"])
    projector.run(sample_account_id, event_types=["task_completed"])  # second run

    state = db_session.query(UserXpState).filter_by(user_id=sample_account_id).first()
    assert state.total_xp == 10  # still just 10, not 20

    xp_event_count = db_session.query(XpEvent).filter_by(user_id=sample_account_id).count()
    assert xp_event_count == 1


def test_idempotency_multiple_events(db_session, sample_account_id):
    _make_event(db_session, 1, sample_account_id, "task_completed")
    _make_event(db_session, 2, sample_account_id, "habit_occurrence_completed")
    db_session.commit()

    projector = XpProjector(db_session)
    projector.run(sample_account_id)
    projector.run(sample_account_id)  # second full run

    state = db_session.query(UserXpState).filter_by(user_id=sample_account_id).first()
    assert state.total_xp == 13  # 10 + 3


# ---------------------------------------------------------------------------
# Level-up
# ---------------------------------------------------------------------------

def test_level_up_after_enough_xp(db_session, sample_account_id):
    # 100 XP needed to reach level 2; task_completed gives 10 XP each
    for i in range(1, 11):
        _make_event(db_session, i, sample_account_id, "task_completed")
    db_session.commit()

    XpProjector(db_session).run(sample_account_id, event_types=["task_completed"])

    state = db_session.query(UserXpState).filter_by(user_id=sample_account_id).first()
    assert state.total_xp == 100
    assert state.level == 2
    assert state.current_level_xp == 0
    assert state.xp_to_next_level == 400


# ---------------------------------------------------------------------------
# Rebuild (reset + rerun)
# ---------------------------------------------------------------------------

def test_rebuild_restores_correct_xp(db_session, sample_account_id):
    _make_event(db_session, 1, sample_account_id, "task_completed")
    _make_event(db_session, 2, sample_account_id, "transaction_created")
    db_session.commit()

    projector = XpProjector(db_session)
    projector.run(sample_account_id)

    state_before = db_session.query(UserXpState).filter_by(user_id=sample_account_id).first()
    assert state_before.total_xp == 15  # 10 + 5

    # Reset and rebuild
    projector.reset(sample_account_id)
    db_session.flush()
    projector.run(sample_account_id)

    state_after = db_session.query(UserXpState).filter_by(user_id=sample_account_id).first()
    assert state_after.total_xp == 15  # same result after rebuild


def test_reset_clears_xp_state(db_session, sample_account_id):
    _make_event(db_session, 1, sample_account_id, "task_completed")
    db_session.commit()

    projector = XpProjector(db_session)
    projector.run(sample_account_id)

    projector.reset(sample_account_id)
    db_session.flush()

    state = db_session.query(UserXpState).filter_by(user_id=sample_account_id).first()
    xp_events = db_session.query(XpEvent).filter_by(user_id=sample_account_id).count()
    assert state is None
    assert xp_events == 0
