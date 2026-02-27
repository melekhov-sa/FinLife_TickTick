"""
Tests for EfficiencyService — Efficiency Score 1.0 transparent productivity dashboard.

Covers:
  - Pure normalisation helpers (_s_ratio, _s_penalty)
  - M1 on-time rate calculation
  - M2 overdue open count
  - M5 WIP score tiers
  - M6 velocity calculation and score
  - Composite score formula
  - Weight normalisation in save_settings
  - Snapshot items persistence
  - Empty account defaults
"""
import pytest
from datetime import datetime, date, timedelta, timezone
from decimal import Decimal

from app.infrastructure.db.models import (
    TaskModel,
    TaskDueChangeLog,
    EfficiencySettings,
    EfficiencySnapshot,
    EfficiencySnapshotItem,
)
from app.application.efficiency import (
    EfficiencyService,
    _s_ratio,
    _s_penalty,
)


ACCT = 1
_tz = timezone.utc
TODAY = date(2026, 2, 27)


# ── Helpers ─────────────────────────────────────────────────────────────────


def _task(
    db,
    *,
    due_date=None,
    status="ACTIVE",
    board_status="backlog",
    completed_at=None,
    archived_at=None,
    account_id=ACCT,
):
    tid = db.query(TaskModel).count() + 1
    t = TaskModel(
        task_id=tid,
        account_id=account_id,
        title=f"task-{tid}",
        status=status,
        board_status=board_status,
        due_date=due_date,
        completed_at=completed_at,
        archived_at=archived_at,
        created_at=datetime(2026, 1, 1, tzinfo=_tz),
    )
    db.add(t)
    db.flush()
    return t


def _svc(db) -> EfficiencyService:
    return EfficiencyService(db)


# ── Pure helper tests ────────────────────────────────────────────────────────


def test_s_ratio_green():
    assert _s_ratio(90, 85, 70) == 100.0


def test_s_ratio_yellow():
    assert _s_ratio(75, 85, 70) == 70.0


def test_s_ratio_red():
    assert _s_ratio(60, 85, 70) == 40.0


def test_s_penalty_green():
    assert _s_penalty(2, 3, 7) == 100.0


def test_s_penalty_yellow():
    assert _s_penalty(5, 3, 7) == 70.0


def test_s_penalty_red():
    assert _s_penalty(9, 3, 7) == 40.0


# ── M1: On-time rate ────────────────────────────────────────────────────────


def test_ontime_rate_all_on_time(db_session):
    """All tasks completed on or before due_date → 100% on-time → s_ontime=100."""
    for i in range(4):
        _task(
            db_session,
            due_date=date(2026, 2, 20),
            status="DONE",
            completed_at=datetime(2026, 2, 19 + i % 2, tzinfo=_tz),
        )
    data = _svc(db_session).calculate(ACCT, TODAY)
    assert data["ontime_rate"] == 100.0
    assert data["s_ontime"] == 100.0


def test_ontime_rate_some_late(db_session):
    """2 of 4 tasks late → 50% on-time → s_ontime=40 (below yellow threshold 70)."""
    # On-time tasks
    for _ in range(2):
        _task(
            db_session,
            due_date=date(2026, 2, 20),
            status="DONE",
            completed_at=datetime(2026, 2, 18, tzinfo=_tz),
        )
    # Late tasks
    for _ in range(2):
        _task(
            db_session,
            due_date=date(2026, 2, 10),
            status="DONE",
            completed_at=datetime(2026, 2, 20, tzinfo=_tz),
        )
    data = _svc(db_session).calculate(ACCT, TODAY)
    assert data["ontime_rate"] == pytest.approx(50.0)
    assert data["s_ontime"] == 40.0  # 50% < yellow(70%) → red


def test_ontime_rate_no_tasks(db_session):
    """No completed tasks with due_date → rate=0 → s_ontime=40 (zero is below yellow)."""
    data = _svc(db_session).calculate(ACCT, TODAY)
    assert data["ontime_rate"] == 0.0
    assert data["s_ontime"] == 40.0


# ── M2: Overdue open ────────────────────────────────────────────────────────


def test_overdue_under_green(db_session):
    """2 overdue tasks, green threshold=3 → s_overdue=100."""
    for _ in range(2):
        _task(db_session, due_date=date(2026, 2, 1), status="ACTIVE")
    data = _svc(db_session).calculate(ACCT, TODAY)
    assert data["overdue_open"] == 2
    assert data["s_overdue"] == 100.0


def test_overdue_above_yellow(db_session):
    """8 overdue tasks, yellow threshold=7 → s_overdue=40."""
    for _ in range(8):
        _task(db_session, due_date=date(2026, 2, 1), status="ACTIVE")
    data = _svc(db_session).calculate(ACCT, TODAY)
    assert data["overdue_open"] == 8
    assert data["s_overdue"] == 40.0


# ── M5: WIP score tiers ──────────────────────────────────────────────────────


def test_wip_score_under_green(db_session):
    """4 in_progress tasks, green threshold=5 → s_wip=100."""
    for _ in range(4):
        _task(db_session, board_status="in_progress", status="ACTIVE")
    data = _svc(db_session).calculate(ACCT, TODAY)
    assert data["wip_count"] == 4
    assert data["s_wip"] == 100.0


def test_wip_score_above_yellow(db_session):
    """11 in_progress tasks, yellow threshold=10 → s_wip=40."""
    for _ in range(11):
        _task(db_session, board_status="in_progress", status="ACTIVE")
    data = _svc(db_session).calculate(ACCT, TODAY)
    assert data["wip_count"] == 11
    assert data["s_wip"] == 40.0


# ── M6: Velocity ─────────────────────────────────────────────────────────────


def test_velocity_7d_calculation(db_session):
    """14 tasks done in last 7 days → velocity = 14/7 = 2.0/day."""
    for i in range(14):
        _task(
            db_session,
            status="DONE",
            completed_at=datetime(2026, 2, 21 + i % 6, tzinfo=_tz),
        )
    data = _svc(db_session).calculate(ACCT, TODAY)
    assert data["velocity_7d"] == pytest.approx(2.0)


def test_velocity_score_below_yellow(db_session):
    """7 tasks done in 7 days → velocity=1.0/day, yellow=2.0 → s_velocity=40."""
    for _ in range(7):
        _task(
            db_session,
            status="DONE",
            completed_at=datetime(2026, 2, 22, tzinfo=_tz),
        )
    data = _svc(db_session).calculate(ACCT, TODAY)
    assert data["velocity_7d"] == pytest.approx(1.0)
    assert data["s_velocity"] == 40.0


# ── Composite score formula ───────────────────────────────────────────────────


def test_composite_score_formula(db_session):
    """
    Verify composite score = Σ(weight × sub-score) regardless of individual values.
    """
    # 10 on-time tasks → s_ontime=100; 0 other events → s_overdue/reschedule/churn/wip=100
    # velocity = 10/7 ≈ 1.43/day, below yellow(2.0) → s_velocity=40
    for _ in range(10):
        _task(
            db_session,
            due_date=date(2026, 2, 20),
            status="DONE",
            completed_at=datetime(2026, 2, 18, tzinfo=_tz),
        )
    data = _svc(db_session).calculate(ACCT, TODAY)
    assert data["s_ontime"] == 100.0
    assert data["s_overdue"] == 100.0
    assert data["s_reschedule"] == 100.0
    assert data["s_churn"] == 100.0
    assert data["s_wip"] == 100.0
    assert data["s_velocity"] == 40.0  # 1.43/day < yellow(2.0/day)

    # Verify the formula produces the stored score
    expected = (
        data["w_ontime"] * data["s_ontime"]
        + data["w_overdue"] * data["s_overdue"]
        + data["w_reschedule"] * data["s_reschedule"]
        + data["w_churn"] * data["s_churn"]
        + data["w_wip"] * data["s_wip"]
        + data["w_velocity"] * data["s_velocity"]
    )
    assert data["efficiency_score"] == pytest.approx(expected, abs=0.1)


# ── Weight normalisation ──────────────────────────────────────────────────────


def test_weight_normalisation(db_session):
    """save_settings normalises arbitrary weight inputs so they sum to ~1.0."""
    svc = _svc(db_session)
    svc.save_settings(ACCT, {
        "w_ontime": "10",
        "w_overdue": "10",
        "w_reschedule": "10",
        "w_churn": "10",
        "w_wip": "10",
        "w_velocity": "10",
    })
    s = svc.get_or_create_settings(ACCT)
    total = (
        float(s.w_ontime) + float(s.w_overdue) + float(s.w_reschedule)
        + float(s.w_churn) + float(s.w_wip) + float(s.w_velocity)
    )
    assert abs(total - 1.0) < 0.01  # small rounding tolerance


# ── Snapshot items stored ─────────────────────────────────────────────────────


def test_snapshot_items_stored_for_late_tasks(db_session):
    """Late tasks should be stored as 'ontime' metric items in the snapshot."""
    # 1 on-time + 2 late
    _task(
        db_session,
        due_date=date(2026, 2, 20),
        status="DONE",
        completed_at=datetime(2026, 2, 18, tzinfo=_tz),
    )
    for _ in range(2):
        _task(
            db_session,
            due_date=date(2026, 2, 5),
            status="DONE",
            completed_at=datetime(2026, 2, 20, tzinfo=_tz),
        )
    data = _svc(db_session).calculate(ACCT, TODAY)
    snap_id = data["snapshot_id"]
    items = db_session.query(EfficiencySnapshotItem).filter_by(
        snapshot_id=snap_id, metric_key="ontime"
    ).all()
    assert len(items) == 2  # only late tasks become items


# ── Empty account defaults ────────────────────────────────────────────────────


def test_empty_account_returns_defaults(db_session):
    """New account with no tasks → all raw values zero, efficiency_score >= 0."""
    data = _svc(db_session).calculate(ACCT, TODAY)
    assert data["ontime_rate"] == 0.0
    assert data["overdue_open"] == 0
    assert data["reschedule_count"] == 0
    assert data["churn_count"] == 0
    assert data["wip_count"] == 0
    assert data["velocity_7d"] == 0.0
    assert data["efficiency_score"] >= 0
