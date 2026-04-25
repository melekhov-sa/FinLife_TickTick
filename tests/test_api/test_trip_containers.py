"""
Tests for trip containers (SharedList with list_type='trip').

Covers:
- Creating a trip list with budget_amount and period
- Plan items CRUD and summary.plan_total == sum of items
- tasks linked to list_id counted in summary
- transactions linked to list_id counted as fact_amount
- effective_budget logic: plan_items > 0 → plan_total; else budget_amount
- period filtering for fact_amount
- account scoping (another user cannot access)
"""
import pytest
from decimal import Decimal
from datetime import date, datetime, timezone

from app.application.shared_lists import SharedListService
from app.application.tasks_usecases import CreateTaskUseCase, CompleteTaskUseCase
from app.infrastructure.db.models import (
    SharedList, ListPlanItem, TaskModel, TransactionFeed, WalletBalance, CategoryInfo
)


ACCT = 1
OTHER_ACCT = 99


# ── Helpers ──────────────────────────────────────────────────────────────────

def _make_wallet(db, account_id=ACCT):
    """Create a minimal WalletBalance row for transaction tests."""
    wallet = WalletBalance(
        account_id=account_id,
        title="Test Wallet",
        currency="RUB",
        wallet_type="REGULAR",
        balance=Decimal("100000"),
        is_archived=False,
    )
    db.add(wallet)
    db.flush()
    return wallet


def _make_txn(db, account_id, list_id, amount, occurred_at=None):
    """Insert a TransactionFeed row directly (bypasses event sourcing)."""
    if occurred_at is None:
        occurred_at = datetime.now(timezone.utc)
    tx = TransactionFeed(
        transaction_id=db.query(TransactionFeed).count() + 1000 + id(amount),
        account_id=account_id,
        operation_type="EXPENSE",
        amount=Decimal(str(amount)),
        currency="RUB",
        description="test",
        occurred_at=occurred_at,
        list_id=list_id,
    )
    db.add(tx)
    db.flush()
    return tx


# ── Create trip list ──────────────────────────────────────────────────────────

class TestTripListCreate:
    def test_create_trip_list_minimal(self, db_session):
        svc = SharedListService(db_session)
        result = svc.create_list(ACCT, "Japan Trip", "trip")
        assert result["list_type"] == "trip"
        assert result["budget_amount"] is None
        assert result["period_from"] is None
        assert result["period_to"] is None

    def test_create_trip_list_with_budget_and_period(self, db_session):
        svc = SharedListService(db_session)
        result = svc.create_list(
            ACCT, "Italy 2026", "trip",
            budget_amount=Decimal("150000"),
            period_from=date(2026, 7, 1),
            period_to=date(2026, 7, 14),
        )
        assert result["list_type"] == "trip"
        assert Decimal(result["budget_amount"]) == Decimal("150000")
        assert result["period_from"] == "2026-07-01"
        assert result["period_to"] == "2026-07-14"

    def test_update_trip_list_period(self, db_session):
        svc = SharedListService(db_session)
        lst = svc.create_list(ACCT, "Trip", "trip")
        result = svc.update_list(
            ACCT, lst["id"],
            budget_amount=Decimal("80000"),
            period_from=date(2026, 8, 1),
            period_to=date(2026, 8, 10),
        )
        assert Decimal(result["budget_amount"]) == Decimal("80000")
        assert result["period_from"] == "2026-08-01"
        assert result["period_to"] == "2026-08-10"


# ── Plan items ────────────────────────────────────────────────────────────────

class TestPlanItems:
    def test_create_and_list_plan_items(self, db_session):
        svc = SharedListService(db_session)
        lst = svc.create_list(ACCT, "Trip", "trip")
        list_id = lst["id"]

        svc.create_plan_item(ACCT, list_id, "Авиабилеты", Decimal("30000"))
        svc.create_plan_item(ACCT, list_id, "Отель", Decimal("50000"))
        svc.create_plan_item(ACCT, list_id, "Питание", Decimal("20000"))

        items = svc.get_plan_items(ACCT, list_id)
        assert len(items) == 3
        titles = {i["title"] for i in items}
        assert "Авиабилеты" in titles

    def test_plan_total_in_summary(self, db_session):
        svc = SharedListService(db_session)
        lst = svc.create_list(ACCT, "Trip", "trip", budget_amount=Decimal("200000"))
        list_id = lst["id"]

        svc.create_plan_item(ACCT, list_id, "Авиабилеты", Decimal("30000"))
        svc.create_plan_item(ACCT, list_id, "Отель", Decimal("50000"))
        svc.create_plan_item(ACCT, list_id, "Питание", Decimal("20000"))

        summary = svc.get_summary(ACCT, list_id)
        assert Decimal(summary["plan_total"]) == Decimal("100000")
        assert summary["plan_items_count"] == 3
        # plan_items exist → effective_budget == plan_total, ignoring budget_amount
        assert Decimal(summary["effective_budget"]) == Decimal("100000")

    def test_effective_budget_uses_budget_amount_when_no_plan_items(self, db_session):
        svc = SharedListService(db_session)
        lst = svc.create_list(ACCT, "Trip", "trip", budget_amount=Decimal("99000"))
        list_id = lst["id"]

        summary = svc.get_summary(ACCT, list_id)
        assert summary["plan_items_count"] == 0
        assert Decimal(summary["plan_total"]) == Decimal("0")
        assert Decimal(summary["effective_budget"]) == Decimal("99000")

    def test_effective_budget_none_when_no_budget_and_no_items(self, db_session):
        svc = SharedListService(db_session)
        lst = svc.create_list(ACCT, "Trip", "trip")
        summary = svc.get_summary(ACCT, lst["id"])
        assert summary["effective_budget"] is None

    def test_update_plan_item(self, db_session):
        svc = SharedListService(db_session)
        lst = svc.create_list(ACCT, "Trip", "trip")
        list_id = lst["id"]
        item = svc.create_plan_item(ACCT, list_id, "Отель", Decimal("50000"))

        updated = svc.update_plan_item(ACCT, list_id, item["id"], title="Отель 5*", amount=Decimal("60000"))
        assert updated["title"] == "Отель 5*"
        assert Decimal(updated["amount"]) == Decimal("60000")

    def test_delete_plan_item(self, db_session):
        svc = SharedListService(db_session)
        lst = svc.create_list(ACCT, "Trip", "trip")
        list_id = lst["id"]
        item = svc.create_plan_item(ACCT, list_id, "Авиабилеты", Decimal("30000"))

        assert svc.delete_plan_item(ACCT, list_id, item["id"]) is True
        items = svc.get_plan_items(ACCT, list_id)
        assert len(items) == 0

    def test_get_plan_items_returns_none_for_wrong_owner(self, db_session):
        svc = SharedListService(db_session)
        lst = svc.create_list(ACCT, "Trip", "trip")
        result = svc.get_plan_items(OTHER_ACCT, lst["id"])
        assert result is None


# ── Tasks in summary ──────────────────────────────────────────────────────────

class TestSummaryTasks:
    def test_tasks_counted_in_summary(self, db_session):
        svc = SharedListService(db_session)
        lst = svc.create_list(ACCT, "Trip", "trip")
        list_id = lst["id"]

        # Create 3 tasks linked to this list, 1 done
        uc = CreateTaskUseCase(db_session)
        task1_id = uc.execute(account_id=ACCT, title="Book flights", actor_user_id=ACCT)
        task2_id = uc.execute(account_id=ACCT, title="Pack bags", actor_user_id=ACCT)
        task3_id = uc.execute(account_id=ACCT, title="Get visa", actor_user_id=ACCT)

        # Assign list_id directly
        for tid in (task1_id, task2_id, task3_id):
            t = db_session.query(TaskModel).filter(TaskModel.task_id == tid).first()
            t.list_id = list_id
        db_session.commit()

        # Complete one task
        CompleteTaskUseCase(db_session).execute(task_id=task1_id, account_id=ACCT, actor_user_id=ACCT)

        summary = svc.get_summary(ACCT, list_id)
        assert summary["tasks_total"] == 3
        assert summary["tasks_done"] == 1

    def test_tasks_from_other_list_not_counted(self, db_session):
        svc = SharedListService(db_session)
        lst1 = svc.create_list(ACCT, "Trip A", "trip")
        lst2 = svc.create_list(ACCT, "Trip B", "trip")

        uc = CreateTaskUseCase(db_session)
        task_id = uc.execute(account_id=ACCT, title="Task for B", actor_user_id=ACCT)
        t = db_session.query(TaskModel).filter(TaskModel.task_id == task_id).first()
        t.list_id = lst2["id"]
        db_session.commit()

        summary = svc.get_summary(ACCT, lst1["id"])
        assert summary["tasks_total"] == 0


# ── Transactions in summary ───────────────────────────────────────────────────

class TestSummaryTransactions:
    def test_fact_amount_sums_transactions(self, db_session):
        svc = SharedListService(db_session)
        lst = svc.create_list(ACCT, "Trip", "trip")
        list_id = lst["id"]

        _make_txn(db_session, ACCT, list_id, 10000)
        _make_txn(db_session, ACCT, list_id, 25000)
        _make_txn(db_session, ACCT, list_id, 5000)
        db_session.commit()

        summary = svc.get_summary(ACCT, list_id)
        assert Decimal(summary["fact_amount"]) == Decimal("40000")
        assert summary["txn_count"] == 3

    def test_fact_amount_excludes_other_list_transactions(self, db_session):
        svc = SharedListService(db_session)
        lst1 = svc.create_list(ACCT, "Trip A", "trip")
        lst2 = svc.create_list(ACCT, "Trip B", "trip")

        _make_txn(db_session, ACCT, lst1["id"], 10000)
        _make_txn(db_session, ACCT, lst2["id"], 99999)
        db_session.commit()

        summary = svc.get_summary(ACCT, lst1["id"])
        assert Decimal(summary["fact_amount"]) == Decimal("10000")
        assert summary["txn_count"] == 1

    def test_period_filters_transactions(self, db_session):
        svc = SharedListService(db_session)
        lst = svc.create_list(
            ACCT, "Trip", "trip",
            period_from=date(2026, 7, 1),
            period_to=date(2026, 7, 14),
        )
        list_id = lst["id"]

        inside = datetime(2026, 7, 5, 12, 0, tzinfo=timezone.utc)
        outside = datetime(2026, 8, 1, 12, 0, tzinfo=timezone.utc)

        _make_txn(db_session, ACCT, list_id, 15000, occurred_at=inside)
        _make_txn(db_session, ACCT, list_id, 9999, occurred_at=outside)
        db_session.commit()

        summary = svc.get_summary(ACCT, list_id)
        assert Decimal(summary["fact_amount"]) == Decimal("15000")
        assert summary["txn_count"] == 1

    def test_no_period_includes_all_transactions(self, db_session):
        svc = SharedListService(db_session)
        lst = svc.create_list(ACCT, "Trip", "trip")
        list_id = lst["id"]

        _make_txn(db_session, ACCT, list_id, 1000, occurred_at=datetime(2025, 1, 1, tzinfo=timezone.utc))
        _make_txn(db_session, ACCT, list_id, 2000, occurred_at=datetime(2027, 12, 31, tzinfo=timezone.utc))
        db_session.commit()

        summary = svc.get_summary(ACCT, list_id)
        assert Decimal(summary["fact_amount"]) == Decimal("3000")


# ── Account scoping ───────────────────────────────────────────────────────────

class TestAccountScoping:
    def test_other_user_cannot_get_summary(self, db_session):
        svc = SharedListService(db_session)
        lst = svc.create_list(ACCT, "Trip", "trip")
        result = svc.get_summary(OTHER_ACCT, lst["id"])
        assert result is None

    def test_other_user_cannot_add_plan_item(self, db_session):
        svc = SharedListService(db_session)
        lst = svc.create_list(ACCT, "Trip", "trip")
        result = svc.create_plan_item(OTHER_ACCT, lst["id"], "Авиабилеты", Decimal("30000"))
        assert result is None

    def test_other_user_transactions_not_counted(self, db_session):
        svc = SharedListService(db_session)
        lst = svc.create_list(ACCT, "Trip", "trip")
        list_id = lst["id"]

        # Insert transaction for OTHER_ACCT with same list_id
        _make_txn(db_session, OTHER_ACCT, list_id, 50000)
        db_session.commit()

        # ACCT's summary should not count OTHER_ACCT's transaction
        summary = svc.get_summary(ACCT, list_id)
        assert Decimal(summary["fact_amount"]) == Decimal("0")


# ── TaskModel list_id field ───────────────────────────────────────────────────

class TestTaskListIdField:
    def test_task_list_id_default_is_none(self, db_session):
        uc = CreateTaskUseCase(db_session)
        task_id = uc.execute(account_id=ACCT, title="Solo task", actor_user_id=ACCT)
        task = db_session.query(TaskModel).filter(TaskModel.task_id == task_id).first()
        assert task.list_id is None

    def test_task_list_id_can_be_set(self, db_session):
        svc = SharedListService(db_session)
        lst = svc.create_list(ACCT, "Trip", "trip")
        list_id = lst["id"]

        uc = CreateTaskUseCase(db_session)
        task_id = uc.execute(account_id=ACCT, title="Book hotel", actor_user_id=ACCT)
        task = db_session.query(TaskModel).filter(TaskModel.task_id == task_id).first()
        task.list_id = list_id
        db_session.commit()

        task = db_session.query(TaskModel).filter(TaskModel.task_id == task_id).first()
        assert task.list_id == list_id


# ── TransactionFeed list_id field ─────────────────────────────────────────────

class TestTransactionListIdField:
    def test_transaction_list_id_default_is_none(self, db_session):
        tx = TransactionFeed(
            transaction_id=9001,
            account_id=ACCT,
            operation_type="EXPENSE",
            amount=Decimal("1000"),
            currency="RUB",
            description="test",
            occurred_at=datetime.now(timezone.utc),
        )
        db_session.add(tx)
        db_session.flush()
        assert tx.list_id is None

    def test_transaction_list_id_can_be_set(self, db_session):
        svc = SharedListService(db_session)
        lst = svc.create_list(ACCT, "Trip", "trip")

        tx = TransactionFeed(
            transaction_id=9002,
            account_id=ACCT,
            operation_type="EXPENSE",
            amount=Decimal("5000"),
            currency="RUB",
            description="hotel",
            occurred_at=datetime.now(timezone.utc),
            list_id=lst["id"],
        )
        db_session.add(tx)
        db_session.commit()

        fetched = db_session.query(TransactionFeed).filter(TransactionFeed.transaction_id == 9002).first()
        assert fetched.list_id == lst["id"]
