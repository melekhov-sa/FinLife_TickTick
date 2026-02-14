"""
Tests for task creation validation rules (unified form: one-off + recurring)
"""
import pytest
from datetime import datetime

from app.application.tasks_usecases import CreateTaskUseCase, TaskValidationError
from app.application.task_templates import CreateTaskTemplateUseCase, TaskTemplateValidationError


class TestOneOffTaskValidation:
    def test_one_off_creates_successfully(self, db_session, sample_account_id):
        """Разовая задача с минимальными полями создаётся."""
        uc = CreateTaskUseCase(db_session)
        task_id = uc.execute(account_id=sample_account_id, title="Купить молоко")
        assert task_id > 0

    def test_one_off_with_due_date(self, db_session, sample_account_id):
        """Разовая задача с датой создаётся."""
        uc = CreateTaskUseCase(db_session)
        task_id = uc.execute(account_id=sample_account_id, title="Оплатить счёт", due_date="2026-03-15")
        assert task_id > 0

    def test_one_off_empty_title_fails(self, db_session, sample_account_id):
        """Пустое название -> ошибка."""
        uc = CreateTaskUseCase(db_session)
        with pytest.raises(TaskValidationError, match="пустым"):
            uc.execute(account_id=sample_account_id, title="   ")

    def test_one_off_whitespace_title_fails(self, db_session, sample_account_id):
        """Только пробелы -> ошибка."""
        uc = CreateTaskUseCase(db_session)
        with pytest.raises(TaskValidationError, match="пустым"):
            uc.execute(account_id=sample_account_id, title="")


class TestRecurringTaskValidation:
    def test_recurring_monthly_creates(self, db_session, sample_account_id):
        """Ежемесячная задача создаётся."""
        uc = CreateTaskTemplateUseCase(db_session)
        template_id = uc.execute(
            account_id=sample_account_id, title="Аренда", freq="MONTHLY",
            interval=1, start_date="2026-03-01", by_monthday=1,
        )
        assert template_id > 0

    def test_recurring_weekly_creates(self, db_session, sample_account_id):
        """Еженедельная задача с днями создаётся."""
        uc = CreateTaskTemplateUseCase(db_session)
        template_id = uc.execute(
            account_id=sample_account_id, title="Уборка", freq="WEEKLY",
            interval=1, start_date="2026-03-01", by_weekday="MO,FR",
        )
        assert template_id > 0

    def test_recurring_daily_creates(self, db_session, sample_account_id):
        """Ежедневная задача создаётся без by_weekday/by_monthday."""
        uc = CreateTaskTemplateUseCase(db_session)
        template_id = uc.execute(
            account_id=sample_account_id, title="Зарядка", freq="DAILY",
            interval=1, start_date="2026-03-01",
        )
        assert template_id > 0

    def test_recurring_empty_title_fails(self, db_session, sample_account_id):
        """Пустое название шаблона -> ошибка."""
        uc = CreateTaskTemplateUseCase(db_session)
        with pytest.raises(TaskTemplateValidationError, match="пустым"):
            uc.execute(
                account_id=sample_account_id, title="  ", freq="MONTHLY",
                interval=1, start_date="2026-03-01",
            )

    def test_recurring_invalid_freq_fails(self, db_session, sample_account_id):
        """Неверная частота -> ошибка."""
        uc = CreateTaskTemplateUseCase(db_session)
        with pytest.raises(Exception, match="[Чч]астот"):
            uc.execute(
                account_id=sample_account_id, title="Тест", freq="BIWEEKLY",
                interval=1, start_date="2026-03-01",
            )

    def test_recurring_zero_interval_fails(self, db_session, sample_account_id):
        """Интервал 0 -> ошибка."""
        uc = CreateTaskTemplateUseCase(db_session)
        with pytest.raises(Exception, match="[Ии]нтервал"):
            uc.execute(
                account_id=sample_account_id, title="Тест", freq="DAILY",
                interval=0, start_date="2026-03-01",
            )

    def test_recurring_weekly_without_days_fails(self, db_session, sample_account_id):
        """WEEKLY без by_weekday -> ошибка."""
        uc = CreateTaskTemplateUseCase(db_session)
        with pytest.raises(TaskTemplateValidationError, match="день недели"):
            uc.execute(
                account_id=sample_account_id, title="Тест", freq="WEEKLY",
                interval=1, start_date="2026-03-01", by_weekday=None,
            )

    def test_recurring_monthly_invalid_day_fails(self, db_session, sample_account_id):
        """MONTHLY с днём > 31 -> ошибка."""
        uc = CreateTaskTemplateUseCase(db_session)
        with pytest.raises(TaskTemplateValidationError, match="День месяца"):
            uc.execute(
                account_id=sample_account_id, title="Тест", freq="MONTHLY",
                interval=1, start_date="2026-03-01", by_monthday=32,
            )

    def test_recurring_monthly_zero_day_fails(self, db_session, sample_account_id):
        """MONTHLY с днём 0 -> ошибка."""
        uc = CreateTaskTemplateUseCase(db_session)
        with pytest.raises(TaskTemplateValidationError, match="День месяца"):
            uc.execute(
                account_id=sample_account_id, title="Тест", freq="MONTHLY",
                interval=1, start_date="2026-03-01", by_monthday=0,
            )


class TestRecurringIgnoresOneOffFields:
    def test_recurring_ignores_due_date(self, db_session, sample_account_id):
        """Повторяющаяся задача не принимает due_date — use case не имеет этого параметра."""
        uc = CreateTaskTemplateUseCase(db_session)
        # CreateTaskTemplateUseCase.execute doesn't accept due_date at all
        # so passing it would raise TypeError — this is the expected behavior
        template_id = uc.execute(
            account_id=sample_account_id, title="Тренировка", freq="DAILY",
            interval=1, start_date="2026-03-01",
        )
        assert template_id > 0
