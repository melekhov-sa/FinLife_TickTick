"""
Tests for discipline metrics and reschedule tracking (_build_discipline_metrics).
Uses TaskDueChangeLog for reschedule counts + TaskRescheduleReason for reason stats.
"""
import pytest
from datetime import date, datetime, timedelta, timezone

from app.infrastructure.db.models import TaskModel, TaskDueChangeLog, TaskRescheduleReason
from app.api.v1.pages import _build_discipline_metrics


def _utc(d: date, hour: int = 12) -> datetime:
    return datetime(d.year, d.month, d.day, hour, 0, 0, tzinfo=timezone.utc)


class TestCompletedOnTimeAndLate:
    """completed_on_time_7 / completed_late_7 computation."""

    def test_on_time_when_completed_before_due(self, db_session, sample_account_id):
        today = date.today()
        db_session.add(TaskModel(
            account_id=sample_account_id, title="T1",
            due_date=today, status="DONE",
            created_at=_utc(today - timedelta(days=1)),
            completed_at=_utc(today),  # completed on due_date
        ))
        db_session.flush()

        r = _build_discipline_metrics(db_session, sample_account_id, today)
        assert r["completed_on_time_7"] == 1
        assert r["completed_late_7"] == 0

    def test_late_when_completed_after_due(self, db_session, sample_account_id):
        today = date.today()
        due = today - timedelta(days=2)
        db_session.add(TaskModel(
            account_id=sample_account_id, title="T2",
            due_date=due, status="DONE",
            created_at=_utc(due - timedelta(days=1)),
            completed_at=_utc(today),  # completed 2 days after due
        ))
        db_session.flush()

        r = _build_discipline_metrics(db_session, sample_account_id, today)
        assert r["completed_on_time_7"] == 0
        assert r["completed_late_7"] == 1

    def test_no_due_date_excluded(self, db_session, sample_account_id):
        today = date.today()
        db_session.add(TaskModel(
            account_id=sample_account_id, title="NoDue",
            due_date=None, status="DONE",
            created_at=_utc(today),
            completed_at=_utc(today),
        ))
        db_session.flush()

        r = _build_discipline_metrics(db_session, sample_account_id, today)
        assert r["completed_on_time_7"] == 0
        assert r["completed_late_7"] == 0


class TestOverdueNow:
    """overdue_now computation."""

    def test_active_past_due_is_overdue(self, db_session, sample_account_id):
        today = date.today()
        db_session.add(TaskModel(
            account_id=sample_account_id, title="Overdue",
            due_date=today - timedelta(days=1), status="ACTIVE",
            created_at=_utc(today - timedelta(days=3)),
        ))
        db_session.flush()

        r = _build_discipline_metrics(db_session, sample_account_id, today)
        assert r["overdue_now"] == 1

    def test_done_past_due_not_overdue(self, db_session, sample_account_id):
        today = date.today()
        db_session.add(TaskModel(
            account_id=sample_account_id, title="Done",
            due_date=today - timedelta(days=1), status="DONE",
            created_at=_utc(today - timedelta(days=3)),
            completed_at=_utc(today),
        ))
        db_session.flush()

        r = _build_discipline_metrics(db_session, sample_account_id, today)
        assert r["overdue_now"] == 0

    def test_due_today_not_overdue(self, db_session, sample_account_id):
        today = date.today()
        db_session.add(TaskModel(
            account_id=sample_account_id, title="Today",
            due_date=today, status="ACTIVE",
            created_at=_utc(today),
        ))
        db_session.flush()

        r = _build_discipline_metrics(db_session, sample_account_id, today)
        assert r["overdue_now"] == 0


class TestReschedules:
    """Reschedule counting from task_due_change_log."""

    def _add_reschedule(self, db_session, user_id, task_id, old_due, new_due, changed_at, reason_id=None):
        db_session.add(TaskDueChangeLog(
            task_id=task_id, user_id=user_id,
            old_due_date=old_due, new_due_date=new_due,
            reason_id=reason_id, changed_at=changed_at,
        ))
        db_session.flush()

    def test_reschedule_counted(self, db_session, sample_account_id):
        today = date.today()
        self._add_reschedule(
            db_session, sample_account_id, task_id=10,
            old_due=today, new_due=today + timedelta(days=3),
            changed_at=_utc(today),
        )

        r = _build_discipline_metrics(db_session, sample_account_id, today)
        assert r["reschedules_7"] == 1
        assert r["reschedules_30"] == 1

    def test_no_reschedules_zero(self, db_session, sample_account_id):
        today = date.today()
        r = _build_discipline_metrics(db_session, sample_account_id, today)
        assert r["reschedules_7"] == 0
        assert r["reschedules_30"] == 0

    def test_reschedule_7_vs_30(self, db_session, sample_account_id):
        today = date.today()
        # 1 reschedule 3 days ago (in 7d window)
        self._add_reschedule(
            db_session, sample_account_id, task_id=10,
            old_due=today, new_due=today + timedelta(days=5),
            changed_at=_utc(today - timedelta(days=3)),
        )
        # 1 reschedule 20 days ago (in 30d window only)
        self._add_reschedule(
            db_session, sample_account_id, task_id=10,
            old_due=today - timedelta(days=20), new_due=today - timedelta(days=10),
            changed_at=_utc(today - timedelta(days=20)),
        )

        r = _build_discipline_metrics(db_session, sample_account_id, today)
        assert r["reschedules_7"] == 1
        assert r["reschedules_30"] == 2

    def test_other_user_not_counted(self, db_session, sample_account_id):
        today = date.today()
        other_user_id = 999
        self._add_reschedule(
            db_session, other_user_id, task_id=10,
            old_due=today, new_due=today + timedelta(days=1),
            changed_at=_utc(today),
        )

        r = _build_discipline_metrics(db_session, sample_account_id, today)
        assert r["reschedules_7"] == 0

    def test_top_tasks_sorted_by_count(self, db_session, sample_account_id):
        today = date.today()
        # Task 10: 3 reschedules
        for i in range(3):
            self._add_reschedule(
                db_session, sample_account_id, task_id=10,
                old_due=today + timedelta(days=i),
                new_due=today + timedelta(days=i + 1),
                changed_at=_utc(today - timedelta(days=i)),
            )
        # Task 20: 1 reschedule
        self._add_reschedule(
            db_session, sample_account_id, task_id=20,
            old_due=today, new_due=today + timedelta(days=5),
            changed_at=_utc(today),
        )
        # Need actual task rows for title lookup
        db_session.add(TaskModel(
            task_id=10, account_id=sample_account_id, title="Частая задача",
            created_at=_utc(today), status="ACTIVE",
        ))
        db_session.add(TaskModel(
            task_id=20, account_id=sample_account_id, title="Редкая задача",
            created_at=_utc(today), status="ACTIVE",
        ))
        db_session.flush()

        r = _build_discipline_metrics(db_session, sample_account_id, today)
        top = r["reschedule_top_30"]
        assert len(top) == 2
        assert top[0]["title"] == "Частая задача"
        assert top[0]["count"] == 3
        assert top[1]["title"] == "Редкая задача"
        assert top[1]["count"] == 1


class TestReasonStats:
    """reason_top_30: aggregation of reschedule reasons for 30 days."""

    def test_reason_stats_aggregated(self, db_session, sample_account_id):
        today = date.today()
        r1 = TaskRescheduleReason(user_id=sample_account_id, name="Нет времени")
        r2 = TaskRescheduleReason(user_id=sample_account_id, name="Устал")
        db_session.add_all([r1, r2])
        db_session.flush()

        # 3 reschedules with reason "Нет времени"
        for i in range(3):
            db_session.add(TaskDueChangeLog(
                task_id=10, user_id=sample_account_id,
                old_due_date=today, new_due_date=today + timedelta(days=1),
                reason_id=r1.id, changed_at=_utc(today - timedelta(days=i)),
            ))
        # 1 reschedule with reason "Устал"
        db_session.add(TaskDueChangeLog(
            task_id=20, user_id=sample_account_id,
            old_due_date=today, new_due_date=today + timedelta(days=2),
            reason_id=r2.id, changed_at=_utc(today),
        ))
        db_session.flush()

        r = _build_discipline_metrics(db_session, sample_account_id, today)
        reasons = r["reason_top_30"]
        assert len(reasons) == 2
        assert reasons[0]["name"] == "Нет времени"
        assert reasons[0]["count"] == 3
        assert reasons[1]["name"] == "Устал"
        assert reasons[1]["count"] == 1

    def test_reason_stats_empty_when_no_reasons(self, db_session, sample_account_id):
        today = date.today()
        # Reschedule without reason_id
        db_session.add(TaskDueChangeLog(
            task_id=10, user_id=sample_account_id,
            old_due_date=today, new_due_date=today + timedelta(days=1),
            reason_id=None, changed_at=_utc(today),
        ))
        db_session.flush()

        r = _build_discipline_metrics(db_session, sample_account_id, today)
        assert r["reason_top_30"] == []

    def test_reason_stats_excludes_old(self, db_session, sample_account_id):
        today = date.today()
        reason = TaskRescheduleReason(user_id=sample_account_id, name="Причина")
        db_session.add(reason)
        db_session.flush()

        # Reschedule 40 days ago — outside 30d window
        db_session.add(TaskDueChangeLog(
            task_id=10, user_id=sample_account_id,
            old_due_date=today - timedelta(days=40),
            new_due_date=today - timedelta(days=35),
            reason_id=reason.id, changed_at=_utc(today - timedelta(days=40)),
        ))
        db_session.flush()

        r = _build_discipline_metrics(db_session, sample_account_id, today)
        assert r["reason_top_30"] == []


class TestDisciplineScore:
    """Score formula: 100 - penalties."""

    def test_perfect_score_no_issues(self, db_session, sample_account_id):
        today = date.today()
        r = _build_discipline_metrics(db_session, sample_account_id, today)
        assert r["score"] == 100

    def test_overdue_reduces_score(self, db_session, sample_account_id):
        today = date.today()
        # 2 overdue tasks → penalty = 2*10 = 20
        for i in range(2):
            db_session.add(TaskModel(
                account_id=sample_account_id, title=f"O{i}",
                due_date=today - timedelta(days=1), status="ACTIVE",
                created_at=_utc(today - timedelta(days=3)),
            ))
        db_session.flush()

        r = _build_discipline_metrics(db_session, sample_account_id, today)
        assert r["score"] == 80  # 100 - 20

    def test_late_completions_reduce_score(self, db_session, sample_account_id):
        today = date.today()
        due = today - timedelta(days=2)
        # 3 late completions → penalty = 3*5 = 15
        for i in range(3):
            db_session.add(TaskModel(
                account_id=sample_account_id, title=f"L{i}",
                due_date=due, status="DONE",
                created_at=_utc(due - timedelta(days=1)),
                completed_at=_utc(today),
            ))
        db_session.flush()

        r = _build_discipline_metrics(db_session, sample_account_id, today)
        assert r["score"] == 85  # 100 - 15

    def test_combined_penalties(self, db_session, sample_account_id):
        today = date.today()
        # 1 overdue (10) + 1 late (5) = 15
        db_session.add(TaskModel(
            account_id=sample_account_id, title="Overdue",
            due_date=today - timedelta(days=1), status="ACTIVE",
            created_at=_utc(today - timedelta(days=3)),
        ))
        db_session.add(TaskModel(
            account_id=sample_account_id, title="Late",
            due_date=today - timedelta(days=2), status="DONE",
            created_at=_utc(today - timedelta(days=4)),
            completed_at=_utc(today),
        ))
        db_session.flush()

        r = _build_discipline_metrics(db_session, sample_account_id, today)
        assert r["score"] == 85  # 100 - 10 - 5

    def test_score_never_below_zero(self, db_session, sample_account_id):
        today = date.today()
        # 5 overdue → penalty capped at 40
        # 7 late → penalty capped at 30
        for i in range(5):
            db_session.add(TaskModel(
                account_id=sample_account_id, title=f"O{i}",
                due_date=today - timedelta(days=1), status="ACTIVE",
                created_at=_utc(today - timedelta(days=3)),
            ))
        for i in range(7):
            db_session.add(TaskModel(
                account_id=sample_account_id, title=f"L{i}",
                due_date=today - timedelta(days=2), status="DONE",
                created_at=_utc(today - timedelta(days=4)),
                completed_at=_utc(today),
            ))
        db_session.flush()

        r = _build_discipline_metrics(db_session, sample_account_id, today)
        # 100 - 40 - 30 = 30 (both capped)
        assert r["score"] == 30

    def test_maximum_penalty_floors_at_zero(self, db_session, sample_account_id):
        today = date.today()
        # 5 overdue (40) + 7 late (30) + 11 reschedules (30) → 100 - 100 = 0
        for i in range(5):
            db_session.add(TaskModel(
                account_id=sample_account_id, title=f"O{i}",
                due_date=today - timedelta(days=1), status="ACTIVE",
                created_at=_utc(today - timedelta(days=3)),
            ))
        for i in range(7):
            db_session.add(TaskModel(
                account_id=sample_account_id, title=f"L{i}",
                due_date=today - timedelta(days=2), status="DONE",
                created_at=_utc(today - timedelta(days=4)),
                completed_at=_utc(today),
            ))
        for i in range(11):
            db_session.add(TaskDueChangeLog(
                task_id=99, user_id=sample_account_id,
                old_due_date=today + timedelta(days=i),
                new_due_date=today + timedelta(days=i + 10),
                changed_at=_utc(today - timedelta(days=i % 6)),
            ))
        db_session.flush()

        r = _build_discipline_metrics(db_session, sample_account_id, today)
        assert r["score"] == 0

    def test_reschedules_reduce_score(self, db_session, sample_account_id):
        today = date.today()
        # 4 reschedules → penalty = 4*3 = 12
        for i in range(4):
            db_session.add(TaskDueChangeLog(
                task_id=10, user_id=sample_account_id,
                old_due_date=today + timedelta(days=i),
                new_due_date=today + timedelta(days=i + 1),
                changed_at=_utc(today - timedelta(days=i)),
            ))
        db_session.flush()

        r = _build_discipline_metrics(db_session, sample_account_id, today)
        assert r["score"] == 88  # 100 - 12
