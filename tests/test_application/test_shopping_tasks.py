"""
Задача «Купить …» из списка покупок.

Защищается: задача заводится один раз (а не каждый день после наступления
даты), пропущенный планировщиком день навёрстывается, и список с планом
не расходятся — отметка идёт в обе стороны.
"""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.application.shopping_tasks import (
    complete_item_for_task,
    complete_task_for_item,
    create_due_purchase_tasks,
)
from app.application.tasks_usecases import CompleteTaskUseCase
from app.infrastructure.db.models import SharedList, SharedListItem, TaskModel

ACCT = 1
TODAY = date(2026, 11, 16)


@pytest.fixture
def shopping_list(db_session):
    lst = SharedList(
        account_id=ACCT, title="Покупки", list_type="shopping",
        slug="shop-test", created_at=datetime.now(timezone.utc),
    )
    db_session.add(lst)
    db_session.flush()
    return lst


def _item(db, lst, *, title="Наушники", want_by=TODAY, price=Decimal("12000"),
          status="open", list_type_override=None):
    it = SharedListItem(
        list_id=lst.id, title=title, want_by=want_by, price=price,
        currency="RUB", status=status, sort_order=0,
        created_at=datetime.now(timezone.utc),
    )
    db.add(it)
    db.flush()
    return it


class TestCreateDuePurchaseTasks:
    def test_creates_task_on_the_wanted_day(self, db_session, shopping_list):
        item = _item(db_session, shopping_list)

        assert create_due_purchase_tasks(db_session, TODAY) == 1

        db_session.refresh(item)
        assert item.task_id is not None
        task = db_session.query(TaskModel).filter(TaskModel.task_id == item.task_id).one()
        assert task.title == "Купить Наушники"
        assert task.due_date == TODAY

    def test_price_goes_into_the_task_as_suggested_amount(self, db_session, shopping_list):
        item = _item(db_session, shopping_list, price=Decimal("3500"))

        create_due_purchase_tasks(db_session, TODAY)

        db_session.refresh(item)
        task = db_session.query(TaskModel).filter(TaskModel.task_id == item.task_id).one()
        assert Decimal(str(task.suggested_amount)) == Decimal("3500")

    def test_not_created_before_the_wanted_day(self, db_session, shopping_list):
        _item(db_session, shopping_list, want_by=TODAY + timedelta(days=3))

        assert create_due_purchase_tasks(db_session, TODAY) == 0

    def test_missed_day_is_caught_up(self, db_session, shopping_list):
        """Планировщик не отработал в нужный день — задача всё равно появится."""
        item = _item(db_session, shopping_list, want_by=TODAY - timedelta(days=5))

        assert create_due_purchase_tasks(db_session, TODAY) == 1

        db_session.refresh(item)
        assert item.task_id is not None

    def test_runs_once_not_every_day(self, db_session, shopping_list):
        _item(db_session, shopping_list, want_by=TODAY - timedelta(days=2))

        assert create_due_purchase_tasks(db_session, TODAY) == 1
        assert create_due_purchase_tasks(db_session, TODAY) == 0
        assert create_due_purchase_tasks(db_session, TODAY + timedelta(days=1)) == 0
        assert db_session.query(TaskModel).count() == 1

    def test_item_without_date_is_ignored(self, db_session, shopping_list):
        _item(db_session, shopping_list, want_by=None)

        assert create_due_purchase_tasks(db_session, TODAY) == 0

    def test_already_bought_item_is_ignored(self, db_session, shopping_list):
        _item(db_session, shopping_list, status="done")

        assert create_due_purchase_tasks(db_session, TODAY) == 0

    def test_other_list_types_are_ignored(self, db_session):
        roadmap = SharedList(
            account_id=ACCT, title="Роадмап", list_type="roadmap",
            slug="road-test", created_at=datetime.now(timezone.utc),
        )
        db_session.add(roadmap)
        db_session.flush()
        _item(db_session, roadmap)

        assert create_due_purchase_tasks(db_session, TODAY) == 0


class TestTwoWaySync:
    def test_completing_the_task_marks_the_item_bought(self, db_session, shopping_list):
        item = _item(db_session, shopping_list)
        create_due_purchase_tasks(db_session, TODAY)
        db_session.refresh(item)

        CompleteTaskUseCase(db_session).execute(task_id=item.task_id, account_id=ACCT)

        db_session.refresh(item)
        assert item.status == "done"
        assert item.completed_at is not None

    def test_marking_the_item_closes_the_task(self, db_session, shopping_list):
        item = _item(db_session, shopping_list)
        create_due_purchase_tasks(db_session, TODAY)
        db_session.refresh(item)

        assert complete_task_for_item(db_session, ACCT, item) is True

        task = db_session.query(TaskModel).filter(TaskModel.task_id == item.task_id).one()
        assert task.status == "DONE"

    def test_item_without_task_is_a_no_op(self, db_session, shopping_list):
        item = _item(db_session, shopping_list, want_by=None)

        assert complete_task_for_item(db_session, ACCT, item) is False

    def test_unknown_task_is_a_no_op(self, db_session, shopping_list):
        assert complete_item_for_task(db_session, ACCT, 999999) is False

    def test_second_completion_changes_nothing(self, db_session, shopping_list):
        item = _item(db_session, shopping_list)
        create_due_purchase_tasks(db_session, TODAY)
        db_session.refresh(item)
        tid = item.task_id

        assert complete_item_for_task(db_session, ACCT, tid) is True
        assert complete_item_for_task(db_session, ACCT, tid) is False

    def test_foreign_account_cannot_close_the_item(self, db_session, shopping_list):
        item = _item(db_session, shopping_list)
        create_due_purchase_tasks(db_session, TODAY)
        db_session.refresh(item)

        assert complete_item_for_task(db_session, ACCT + 999, item.task_id) is False
