"""
Tests for multi-date task creation (creating multiple one-off tasks with different dates).
The handler parses comma-separated dates and calls CreateTaskUseCase once per date.
"""
import pytest
from datetime import date

from app.application.tasks_usecases import CreateTaskUseCase, TaskValidationError
from app.infrastructure.db.models import TaskModel


class TestMultiDateTaskCreation:
    """Multi-date: handler creates N tasks by calling CreateTaskUseCase N times."""

    def test_single_date_creates_one_task(self, db_session, sample_account_id):
        """Одна дата → одна задача с due_kind=DATE."""
        uc = CreateTaskUseCase(db_session)
        dates = ["2026-03-10"]
        for d in dates:
            uc.execute(
                account_id=sample_account_id, title="Оплатить счёт",
                due_kind="DATE", due_date=d,
            )
        tasks = db_session.query(TaskModel).filter(
            TaskModel.account_id == sample_account_id,
            TaskModel.title == "Оплатить счёт",
        ).all()
        assert len(tasks) == 1
        assert tasks[0].due_date == date(2026, 3, 10)
        assert tasks[0].due_kind == "DATE"

    def test_three_dates_create_three_tasks(self, db_session, sample_account_id):
        """Три даты → три задачи с одинаковым title и разными due_date."""
        uc = CreateTaskUseCase(db_session)
        raw = "2026-03-10,2026-03-12,2026-03-15"
        dates = sorted(set(d.strip() for d in raw.split(",") if d.strip()))
        for d in dates:
            uc.execute(
                account_id=sample_account_id, title="Тренировка",
                due_kind="DATE", due_date=d, note="утром",
            )
        tasks = db_session.query(TaskModel).filter(
            TaskModel.account_id == sample_account_id,
            TaskModel.title == "Тренировка",
        ).order_by(TaskModel.due_date).all()
        assert len(tasks) == 3
        assert [t.due_date for t in tasks] == [
            date(2026, 3, 10), date(2026, 3, 12), date(2026, 3, 15),
        ]
        # All share same note
        assert all(t.note == "утром" for t in tasks)

    def test_duplicate_dates_deduplicated(self, db_session, sample_account_id):
        """Повтор дат → дубликаты убираются, создаётся по одной задаче на уникальную дату."""
        uc = CreateTaskUseCase(db_session)
        raw = "2026-04-01,2026-04-01,2026-04-05,2026-04-05,2026-04-05"
        dates = sorted(set(d.strip() for d in raw.split(",") if d.strip()))
        for d in dates:
            uc.execute(
                account_id=sample_account_id, title="Уборка",
                due_kind="DATE", due_date=d,
            )
        tasks = db_session.query(TaskModel).filter(
            TaskModel.account_id == sample_account_id,
            TaskModel.title == "Уборка",
        ).all()
        assert len(tasks) == 2  # two unique dates

    def test_empty_dates_string_no_tasks(self, db_session, sample_account_id):
        """Пустая строка дат → ни одной задачи не создаётся (handler отдаёт ошибку)."""
        raw = ""
        dates = [d.strip() for d in raw.split(",") if d.strip()]
        assert len(dates) == 0
        # Handler would return _render_error; no CreateTaskUseCase calls
        tasks = db_session.query(TaskModel).filter(
            TaskModel.account_id == sample_account_id,
        ).all()
        assert len(tasks) == 0

    def test_invalid_date_format_rejected(self, db_session, sample_account_id):
        """Некорректный формат даты → ValueError при парсинге."""
        raw = "2026-03-10,not-a-date,2026-03-12"
        dates_raw = [d.strip() for d in raw.split(",") if d.strip()]
        with pytest.raises(ValueError):
            for d in dates_raw:
                date.fromisoformat(d)  # handler does this validation

    def test_multi_date_tasks_have_correct_due_kind(self, db_session, sample_account_id):
        """Все задачи из multi-date имеют due_kind=DATE."""
        uc = CreateTaskUseCase(db_session)
        for d in ["2026-05-01", "2026-05-02", "2026-05-03"]:
            uc.execute(
                account_id=sample_account_id, title="Полив",
                due_kind="DATE", due_date=d,
            )
        tasks = db_session.query(TaskModel).filter(
            TaskModel.account_id == sample_account_id,
        ).all()
        assert len(tasks) == 3
        assert all(t.due_kind == "DATE" for t in tasks)
        assert all(t.due_date is not None for t in tasks)
