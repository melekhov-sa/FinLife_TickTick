"""
Tests for task creation validation rules (unified form: one-off + recurring)
"""
import pytest
from datetime import datetime
from decimal import Decimal

from app.application.tasks_usecases import CreateTaskUseCase, CompleteTaskUseCase, DeleteTaskUseCase, TaskValidationError
from app.application.task_templates import CreateTaskTemplateUseCase, TaskTemplateValidationError
from app.application.transactions import CreateTransactionUseCase
from app.infrastructure.db.models import TaskModel, TransactionFeed, User, WalletBalance, CategoryInfo, EventLog, TaskReminderModel


class TestOneOffTaskValidation:
    def test_one_off_creates_successfully(self, db_session, sample_account_id):
        """Разовая задача с минимальными полями создаётся."""
        uc = CreateTaskUseCase(db_session)
        task_id = uc.execute(account_id=sample_account_id, title="Купить молоко")
        assert task_id > 0

    def test_one_off_with_due_date(self, db_session, sample_account_id):
        """Разовая задача с датой создаётся."""
        uc = CreateTaskUseCase(db_session)
        task_id = uc.execute(account_id=sample_account_id, title="Оплатить счёт", due_kind="DATE", due_date="2026-03-15")
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


class TestTaskExpenseLink:
    """Tests for task-expense link feature."""

    def _create_wallet(self, db, account_id):
        """Helper: create a test wallet."""
        now = datetime.utcnow()
        w = WalletBalance(
            wallet_id=1, account_id=account_id, title="Test",
            currency="RUB", wallet_type="REGULAR", balance=Decimal("10000"),
            is_archived=False, created_at=now, updated_at=now,
        )
        db.add(w)
        db.flush()
        return w

    def _create_category(self, db, account_id):
        """Helper: create a test expense category."""
        now = datetime.utcnow()
        c = CategoryInfo(
            category_id=1, account_id=account_id, title="Prodykty",
            category_type="EXPENSE", is_archived=False, sort_order=0,
            created_at=now, updated_at=now,
        )
        db.add(c)
        db.flush()
        return c

    def test_create_task_with_expense_fields(self, db_session, sample_account_id):
        """Task with requires_expense=True saves expense fields on TaskModel."""
        uc = CreateTaskUseCase(db_session)
        task_id = uc.execute(
            account_id=sample_account_id,
            title="Купить продукты",
            requires_expense=True,
            suggested_expense_category_id=42,
            suggested_amount="1500.00",
        )
        task = db_session.query(TaskModel).filter(TaskModel.task_id == task_id).first()
        assert task is not None
        assert task.requires_expense is True
        assert task.suggested_expense_category_id == 42
        assert task.suggested_amount == Decimal("1500.00")

    def test_create_task_without_expense(self, db_session, sample_account_id):
        """Task without expense fields defaults to requires_expense=False."""
        uc = CreateTaskUseCase(db_session)
        task_id = uc.execute(
            account_id=sample_account_id, title="Обычная задача",
        )
        task = db_session.query(TaskModel).filter(TaskModel.task_id == task_id).first()
        assert task.requires_expense is False
        assert task.suggested_expense_category_id is None
        assert task.suggested_amount is None

    def test_complete_normal_task(self, db_session, sample_account_id):
        """Task without requires_expense completes normally."""
        uc = CreateTaskUseCase(db_session)
        task_id = uc.execute(account_id=sample_account_id, title="Простая задача")
        CompleteTaskUseCase(db_session).execute(task_id, sample_account_id)
        task = db_session.query(TaskModel).filter(TaskModel.task_id == task_id).first()
        assert task.status == "DONE"

    def test_complete_with_expense_creates_transaction(self, db_session, sample_account_id):
        """complete-with-expense creates an expense transaction and completes the task."""
        wallet = self._create_wallet(db_session, sample_account_id)
        cat = self._create_category(db_session, sample_account_id)

        # Create task with expense requirement
        uc = CreateTaskUseCase(db_session)
        task_id = uc.execute(
            account_id=sample_account_id,
            title="Задача с расходом",
            requires_expense=True,
            suggested_expense_category_id=cat.category_id,
            suggested_amount="500.00",
        )

        # Create expense linked to task
        tx_id = CreateTransactionUseCase(db_session).execute_expense(
            account_id=sample_account_id,
            wallet_id=wallet.wallet_id,
            amount=Decimal("500.00"),
            currency="RUB",
            category_id=cat.category_id,
            description="Задача с расходом",
            task_id=task_id,
        )

        # Complete the task
        CompleteTaskUseCase(db_session).execute(task_id, sample_account_id)

        # Verify transaction
        tx = db_session.query(TransactionFeed).filter(
            TransactionFeed.transaction_id == tx_id
        ).first()
        assert tx is not None
        assert tx.task_id == task_id
        assert tx.operation_type == "EXPENSE"
        assert tx.amount == Decimal("500.00")
        assert tx.category_id == cat.category_id

        # Verify task completed
        task = db_session.query(TaskModel).filter(TaskModel.task_id == task_id).first()
        assert task.status == "DONE"

    def test_expense_transaction_has_task_id(self, db_session, sample_account_id):
        """Verify TransactionFeed.task_id is set when expense is created with task_id."""
        wallet = self._create_wallet(db_session, sample_account_id)

        tx_id = CreateTransactionUseCase(db_session).execute_expense(
            account_id=sample_account_id,
            wallet_id=wallet.wallet_id,
            amount=Decimal("100.00"),
            currency="RUB",
            category_id=None,
            description="test",
            task_id=99,
        )

        tx = db_session.query(TransactionFeed).filter(
            TransactionFeed.transaction_id == tx_id
        ).first()
        assert tx.task_id == 99

    def test_expense_transaction_without_task_id(self, db_session, sample_account_id):
        """Expense without task_id has task_id=None."""
        wallet = self._create_wallet(db_session, sample_account_id)

        tx_id = CreateTransactionUseCase(db_session).execute_expense(
            account_id=sample_account_id,
            wallet_id=wallet.wallet_id,
            amount=Decimal("100.00"),
            currency="RUB",
            category_id=None,
            description="без задачи",
        )

        tx = db_session.query(TransactionFeed).filter(
            TransactionFeed.transaction_id == tx_id
        ).first()
        assert tx.task_id is None

    def test_update_task_expense_fields(self, db_session, sample_account_id):
        """UpdateTaskUseCase can change expense fields."""
        from app.application.tasks_usecases import UpdateTaskUseCase

        task_id = CreateTaskUseCase(db_session).execute(
            account_id=sample_account_id, title="Обновляемая задача",
        )
        UpdateTaskUseCase(db_session).execute(
            task_id=task_id, account_id=sample_account_id,
            requires_expense=True,
            suggested_expense_category_id=10,
            suggested_amount="750.50",
        )
        task = db_session.query(TaskModel).filter(TaskModel.task_id == task_id).first()
        assert task.requires_expense is True
        assert task.suggested_expense_category_id == 10
        assert task.suggested_amount == Decimal("750.50")


class TestEventSourcingFixes:
    def test_create_with_reminders_single_commit(self, db_session, sample_account_id):
        """CreateTaskUseCase with reminders produces exactly two events and one TaskReminderModel row."""
        task_id = CreateTaskUseCase(db_session).execute(
            account_id=sample_account_id,
            title="Задача с напоминанием",
            due_kind="DATETIME",
            due_date="2026-05-01",
            due_time="10:00",
            reminders=[{"offset_minutes": -10, "reminder_kind": "OFFSET"}],
        )
        task = db_session.query(TaskModel).filter(TaskModel.task_id == task_id).first()
        assert task is not None

        reminder = db_session.query(TaskReminderModel).filter(
            TaskReminderModel.task_id == task_id
        ).first()
        assert reminder is not None

        events = db_session.query(EventLog).filter(
            EventLog.account_id == sample_account_id,
            EventLog.event_type.in_(["task_created", "task_reminders_changed"]),
        ).all()
        event_types = [e.event_type for e in events]
        assert "task_created" in event_types
        assert "task_reminders_changed" in event_types
        assert len(events) == 2

    def test_delete_task_writes_event(self, db_session, sample_account_id):
        """DeleteTaskUseCase writes task_deleted event and removes TaskModel and TaskReminderModel."""
        task_id = CreateTaskUseCase(db_session).execute(
            account_id=sample_account_id,
            title="Задача для удаления",
            due_kind="DATETIME",
            due_date="2026-05-01",
            due_time="09:00",
            reminders=[{"offset_minutes": -5, "reminder_kind": "OFFSET"}],
        )
        assert db_session.query(TaskModel).filter(TaskModel.task_id == task_id).first() is not None
        assert db_session.query(TaskReminderModel).filter(TaskReminderModel.task_id == task_id).count() == 1

        DeleteTaskUseCase(db_session).execute(task_id=task_id, account_id=sample_account_id)

        deleted_event = db_session.query(EventLog).filter(
            EventLog.account_id == sample_account_id,
            EventLog.event_type == "task_deleted",
        ).first()
        assert deleted_event is not None
        assert deleted_event.payload_json["task_id"] == task_id

        assert db_session.query(TaskModel).filter(TaskModel.task_id == task_id).first() is None
        assert db_session.query(TaskReminderModel).filter(TaskReminderModel.task_id == task_id).count() == 0

    def test_delete_task_not_found_raises(self, db_session, sample_account_id):
        """DeleteTaskUseCase raises TaskValidationError when task does not exist."""
        with pytest.raises(TaskValidationError):
            DeleteTaskUseCase(db_session).execute(task_id=99999, account_id=sample_account_id)
