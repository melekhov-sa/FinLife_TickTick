"""
Tests for ProjectAnalyticsService — discipline, velocity, cycle-time.
"""
import pytest
from datetime import datetime, date, timedelta, timezone

from app.infrastructure.db.models import ProjectModel, TaskModel, EventLog
from app.application.project_analytics import ProjectAnalyticsService, _month_range


ACCT = 1
_tz = timezone.utc


def _project(db, title="Test Project"):
    p = ProjectModel(account_id=ACCT, title=title)
    db.add(p)
    db.flush()
    return p


def _task(db, project, title="task", *, due_date=None, status="ACTIVE",
          completed_at=None, created_at=None, task_id=None):
    tid = task_id or (db.query(TaskModel).count() + 1)
    t = TaskModel(
        task_id=tid,
        account_id=ACCT,
        title=title,
        status=status,
        project_id=project.id,
        board_status="backlog",
        due_date=due_date,
        completed_at=completed_at,
        created_at=created_at or datetime(2026, 2, 1, 10, 0, 0, tzinfo=_tz),
    )
    db.add(t)
    db.flush()
    return t


def _event(db, task_id, event_type, payload, occurred_at):
    ev = EventLog(
        account_id=ACCT,
        event_type=event_type,
        payload_json=payload,
        occurred_at=occurred_at,
    )
    db.add(ev)
    db.flush()
    return ev


# ── month_range helper ──

class TestMonthRange:
    def test_regular_month(self):
        s, e = _month_range(2026, 2)
        assert s == date(2026, 2, 1)
        assert e == date(2026, 3, 1)

    def test_december(self):
        s, e = _month_range(2025, 12)
        assert s == date(2025, 12, 1)
        assert e == date(2026, 1, 1)


# ── Discipline ──

class TestDiscipline:
    def test_all_on_time(self, db_session):
        proj = _project(db_session)
        _task(db_session, proj, due_date=date(2026, 2, 10), status="DONE",
              completed_at=datetime(2026, 2, 9, 18, 0, tzinfo=_tz))
        _task(db_session, proj, due_date=date(2026, 2, 15), status="DONE",
              completed_at=datetime(2026, 2, 15, 12, 0, tzinfo=_tz))

        svc = ProjectAnalyticsService(db_session)
        r = svc.compute(proj.id, ACCT, 2026, 2)
        assert r["tasks_completed_on_time"] == 2
        assert r["tasks_completed_late"] == 0
        assert r["discipline_percent"] == 100.0

    def test_all_late(self, db_session):
        proj = _project(db_session)
        _task(db_session, proj, due_date=date(2026, 2, 5), status="DONE",
              completed_at=datetime(2026, 2, 8, 10, 0, tzinfo=_tz))

        svc = ProjectAnalyticsService(db_session)
        r = svc.compute(proj.id, ACCT, 2026, 2)
        assert r["tasks_completed_on_time"] == 0
        assert r["tasks_completed_late"] == 1
        assert r["discipline_percent"] == 0.0

    def test_mixed(self, db_session):
        proj = _project(db_session)
        # on time
        _task(db_session, proj, due_date=date(2026, 2, 10), status="DONE",
              completed_at=datetime(2026, 2, 10, 12, 0, tzinfo=_tz))
        # late
        _task(db_session, proj, due_date=date(2026, 2, 5), status="DONE",
              completed_at=datetime(2026, 2, 8, 10, 0, tzinfo=_tz))
        # late
        _task(db_session, proj, due_date=date(2026, 2, 12), status="DONE",
              completed_at=datetime(2026, 2, 14, 10, 0, tzinfo=_tz))

        svc = ProjectAnalyticsService(db_session)
        r = svc.compute(proj.id, ACCT, 2026, 2)
        assert r["tasks_completed_on_time"] == 1
        assert r["tasks_completed_late"] == 2
        assert abs(r["discipline_percent"] - 33.33) < 0.01

    def test_no_due_date_excluded_from_discipline(self, db_session):
        proj = _project(db_session)
        # no due_date — should not count in on_time/late
        _task(db_session, proj, due_date=None, status="DONE",
              completed_at=datetime(2026, 2, 10, 12, 0, tzinfo=_tz))

        svc = ProjectAnalyticsService(db_session)
        r = svc.compute(proj.id, ACCT, 2026, 2)
        assert r["tasks_completed_total"] == 1
        assert r["tasks_completed_on_time"] == 0
        assert r["tasks_completed_late"] == 0
        assert r["discipline_percent"] == 0

    def test_no_tasks_returns_zero(self, db_session):
        proj = _project(db_session)
        svc = ProjectAnalyticsService(db_session)
        r = svc.compute(proj.id, ACCT, 2026, 2)
        assert r["discipline_percent"] == 0
        assert r["tasks_completed_total"] == 0


# ── Overdue open ──

class TestOverdueOpen:
    def test_overdue_active_tasks(self, db_session):
        proj = _project(db_session)
        _task(db_session, proj, due_date=date(2026, 2, 1), status="ACTIVE")
        _task(db_session, proj, due_date=date(2026, 2, 20), status="ACTIVE")
        # completed — should not count
        _task(db_session, proj, due_date=date(2026, 2, 1), status="DONE",
              completed_at=datetime(2026, 2, 5, 10, 0, tzinfo=_tz))
        # no due_date — should not count
        _task(db_session, proj, status="ACTIVE")

        svc = ProjectAnalyticsService(db_session)
        r = svc.compute(proj.id, ACCT, 2026, 2)
        assert r["overdue_open_count"] == 2


# ── Velocity ──

class TestVelocity:
    def test_velocity_by_weeks(self, db_session):
        proj = _project(db_session)
        # Week 1 (1-7): 2 tasks
        _task(db_session, proj, status="DONE",
              completed_at=datetime(2026, 2, 3, 10, 0, tzinfo=_tz))
        _task(db_session, proj, status="DONE",
              completed_at=datetime(2026, 2, 7, 10, 0, tzinfo=_tz))
        # Week 2 (8-14): 1 task
        _task(db_session, proj, status="DONE",
              completed_at=datetime(2026, 2, 10, 10, 0, tzinfo=_tz))
        # Week 3 (15-21): 0 tasks
        # Week 4 (22-28): 3 tasks
        _task(db_session, proj, status="DONE",
              completed_at=datetime(2026, 2, 22, 10, 0, tzinfo=_tz))
        _task(db_session, proj, status="DONE",
              completed_at=datetime(2026, 2, 25, 10, 0, tzinfo=_tz))
        _task(db_session, proj, status="DONE",
              completed_at=datetime(2026, 2, 28, 10, 0, tzinfo=_tz))

        svc = ProjectAnalyticsService(db_session)
        r = svc.compute(proj.id, ACCT, 2026, 2)
        assert r["velocity_week1"] == 2
        assert r["velocity_week2"] == 1
        assert r["velocity_week3"] == 0
        assert r["velocity_week4"] == 3
        assert r["velocity_week5"] == 0
        assert r["velocity_total"] == 6

    def test_velocity_week5(self, db_session):
        """Tasks on days 29-31 go to week 5."""
        proj = _project(db_session)
        _task(db_session, proj, status="DONE",
              completed_at=datetime(2026, 1, 29, 10, 0, tzinfo=_tz))
        _task(db_session, proj, status="DONE",
              completed_at=datetime(2026, 1, 31, 10, 0, tzinfo=_tz))

        svc = ProjectAnalyticsService(db_session)
        r = svc.compute(proj.id, ACCT, 2026, 1)
        assert r["velocity_week5"] == 2

    def test_no_due_date_counted_in_velocity(self, db_session):
        """Tasks without due_date still count in velocity (total completed)."""
        proj = _project(db_session)
        _task(db_session, proj, due_date=None, status="DONE",
              completed_at=datetime(2026, 2, 5, 10, 0, tzinfo=_tz))

        svc = ProjectAnalyticsService(db_session)
        r = svc.compute(proj.id, ACCT, 2026, 2)
        assert r["velocity_total"] == 1
        assert r["tasks_completed_total"] == 1


# ── Cycle time ──

class TestCycleTime:
    def test_avg_cycle_time(self, db_session):
        proj = _project(db_session)
        # Task 1: created Feb 1, completed Feb 4 → 3 days
        _task(db_session, proj, status="DONE",
              created_at=datetime(2026, 2, 1, 10, 0, tzinfo=_tz),
              completed_at=datetime(2026, 2, 4, 10, 0, tzinfo=_tz))
        # Task 2: created Feb 1, completed Feb 6 → 5 days
        _task(db_session, proj, status="DONE",
              created_at=datetime(2026, 2, 1, 10, 0, tzinfo=_tz),
              completed_at=datetime(2026, 2, 6, 10, 0, tzinfo=_tz))

        svc = ProjectAnalyticsService(db_session)
        r = svc.compute(proj.id, ACCT, 2026, 2)
        assert r["avg_cycle_time_days"] == 4.0

    def test_no_completed_tasks_zero_cycle(self, db_session):
        proj = _project(db_session)
        _task(db_session, proj, status="ACTIVE")

        svc = ProjectAnalyticsService(db_session)
        r = svc.compute(proj.id, ACCT, 2026, 2)
        assert r["avg_cycle_time_days"] == 0


# ── Reschedule count ──

class TestRescheduleCount:
    def test_counts_due_date_changes(self, db_session):
        proj = _project(db_session)
        t = _task(db_session, proj, due_date=date(2026, 2, 10))

        # 2 due_date changes in Feb
        _event(db_session, t.task_id, "task_updated",
               {"task_id": t.task_id, "due_date": "2026-02-15"},
               datetime(2026, 2, 5, 10, 0, tzinfo=_tz))
        _event(db_session, t.task_id, "task_updated",
               {"task_id": t.task_id, "due_date": "2026-02-20"},
               datetime(2026, 2, 12, 10, 0, tzinfo=_tz))
        # title-only change — should not count
        _event(db_session, t.task_id, "task_updated",
               {"task_id": t.task_id, "title": "Renamed"},
               datetime(2026, 2, 13, 10, 0, tzinfo=_tz))

        svc = ProjectAnalyticsService(db_session)
        r = svc.compute(proj.id, ACCT, 2026, 2)
        assert r["reschedule_count"] == 2


# ── Mini summary ──

class TestMiniSummary:
    def test_returns_none_for_empty_project(self, db_session):
        proj = _project(db_session)
        svc = ProjectAnalyticsService(db_session)
        assert svc.get_mini_summary(proj.id, ACCT) is None

    def test_basic_summary(self, db_session):
        proj = _project(db_session)
        today = date.today()
        _task(db_session, proj, due_date=today, status="DONE",
              completed_at=datetime(today.year, today.month, today.day, 10, 0, tzinfo=_tz),
              created_at=datetime(today.year, today.month, 1, 10, 0, tzinfo=_tz))

        svc = ProjectAnalyticsService(db_session)
        r = svc.get_mini_summary(proj.id, ACCT)
        assert r is not None
        assert r["discipline_percent"] == 100.0
        assert r["velocity_total"] == 1
        assert r["overdue_open_count"] == 0
        assert r["avg_cycle_time_days"] > 0


# ── Snapshot upsert ──

class TestSnapshotUpsert:
    def test_creates_and_updates_snapshot(self, db_session):
        from app.infrastructure.db.models import ProjectAnalyticsSnapshot

        proj = _project(db_session)
        _task(db_session, proj, status="DONE",
              completed_at=datetime(2026, 2, 5, 10, 0, tzinfo=_tz))

        svc = ProjectAnalyticsService(db_session)
        svc.compute(proj.id, ACCT, 2026, 2)

        snap = db_session.query(ProjectAnalyticsSnapshot).filter(
            ProjectAnalyticsSnapshot.project_id == proj.id,
            ProjectAnalyticsSnapshot.year == 2026,
            ProjectAnalyticsSnapshot.month == 2,
        ).first()
        assert snap is not None
        assert snap.tasks_completed_total == 1

        # Second compute updates same row
        _task(db_session, proj, status="DONE",
              completed_at=datetime(2026, 2, 10, 10, 0, tzinfo=_tz))
        svc.compute(proj.id, ACCT, 2026, 2)
        db_session.refresh(snap)
        assert snap.tasks_completed_total == 2
