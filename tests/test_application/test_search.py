"""
Tests for SearchService — global search across tasks, events, operation templates
and transactions. Runs on SQLite in-memory (ILIKE fallback).
"""
import pytest
from datetime import date, datetime, timezone
from decimal import Decimal

from app.infrastructure.db.models import (
    CalendarEventModel,
    EventOccurrenceModel,
    OperationOccurrence,
    OperationTemplateModel,
    RecurrenceRuleModel,
    TaskModel,
    TransactionFeed,
    WorkCategory,
)
from app.application.search import SearchService

ACCT = 1
OTHER_ACCT = 99
_tz = timezone.utc
_NOW = datetime(2026, 4, 24, 12, 0, 0, tzinfo=_tz)


# ── helpers ──────────────────────────────────────────────────────────────────

def _task(db, *, title="task", note=None, status="ACTIVE", account_id=ACCT, due_date=None):
    tid = db.query(TaskModel).count() + 1
    t = TaskModel(
        task_id=tid,
        account_id=account_id,
        title=title,
        note=note,
        status=status,
        board_status="backlog",
        created_at=_NOW,
        due_date=due_date,
    )
    db.add(t)
    db.flush()
    return t


def _rule(db, *, account_id=ACCT):
    rid = db.query(RecurrenceRuleModel).count() + 1
    r = RecurrenceRuleModel(
        rule_id=rid,
        account_id=account_id,
        freq="MONTHLY",
        interval=1,
        start_date=date(2026, 1, 1),
    )
    db.add(r)
    db.flush()
    return r


def _category(db, *, account_id=ACCT):
    from app.infrastructure.db.models import WorkCategory
    cid = db.query(WorkCategory).count() + 100
    c = WorkCategory(
        category_id=cid,
        account_id=account_id,
        title=f"Тест-{cid}-{account_id}",
        is_archived=False,
    )
    db.add(c)
    db.flush()
    return c


def _event(db, *, title="event", description=None, account_id=ACCT, is_active=True):
    cat = _category(db, account_id=account_id)
    eid = db.query(CalendarEventModel).count() + 1
    e = CalendarEventModel(
        event_id=eid,
        account_id=account_id,
        title=title,
        description=description,
        category_id=cat.category_id,
        is_active=is_active,
    )
    db.add(e)
    db.flush()
    return e


def _occ_event(db, event_id, *, start_date=date(2026, 5, 1), account_id=ACCT):
    o = EventOccurrenceModel(
        account_id=account_id,
        event_id=event_id,
        start_date=start_date,
        source="manual",
    )
    db.add(o)
    db.flush()
    return o


def _op_template(db, *, title="op", note=None, account_id=ACCT, is_archived=False):
    rule = _rule(db, account_id=account_id)
    tid = db.query(OperationTemplateModel).count() + 1
    t = OperationTemplateModel(
        template_id=tid,
        account_id=account_id,
        title=title,
        note=note,
        rule_id=rule.rule_id,
        active_from=date(2026, 1, 1),
        is_archived=is_archived,
        kind="EXPENSE",
        amount=Decimal("1000.00"),
        created_at=_NOW,
    )
    db.add(t)
    db.flush()
    return t


def _occ_op(db, template_id, *, scheduled_date=date(2026, 5, 1), account_id=ACCT):
    o = OperationOccurrence(
        account_id=account_id,
        template_id=template_id,
        scheduled_date=scheduled_date,
        status="ACTIVE",
    )
    db.add(o)
    db.flush()
    return o


def _tx(db, *, description="transaction", operation_type="EXPENSE",
        amount=Decimal("500.00"), account_id=ACCT):
    tid = db.query(TransactionFeed).count() + 1
    tx = TransactionFeed(
        transaction_id=tid,
        account_id=account_id,
        operation_type=operation_type,
        amount=amount,
        currency="RUB",
        description=description,
        occurred_at=_NOW,
        created_at=_NOW,
    )
    db.add(tx)
    db.flush()
    return tx


def svc(db) -> SearchService:
    return SearchService(db)


# ── empty / short query ──────────────────────────────────────────────────────

def test_empty_query_returns_empty(db_session):
    result = svc(db_session).search(ACCT, "", 30)
    assert result["total"] == 0
    assert result["tasks"] == []


def test_one_char_query_returns_empty(db_session):
    _task(db_session, title="Тест задача")
    result = svc(db_session).search(ACCT, "T", 30)
    assert result["total"] == 0


def test_whitespace_only_returns_empty(db_session):
    result = svc(db_session).search(ACCT, "  ", 30)
    assert result["total"] == 0


# ── tasks ────────────────────────────────────────────────────────────────────

def test_search_task_by_title(db_session):
    _task(db_session, title="Купить молоко")
    _task(db_session, title="Другая задача")

    result = svc(db_session).search(ACCT, "молоко", 30)
    assert len(result["tasks"]) == 1
    assert result["tasks"][0]["title"] == "Купить молоко"
    assert result["total"] == 1


def test_search_task_by_note(db_session):
    _task(db_session, title="Задача без ключа", note="важная заметка про ключ")
    _task(db_session, title="Другая задача")

    result = svc(db_session).search(ACCT, "ключ", 30)
    assert len(result["tasks"]) == 1
    assert result["tasks"][0]["title"] == "Задача без ключа"


def test_search_task_url_format(db_session):
    t = _task(db_session, title="Тест URL задача")
    result = svc(db_session).search(ACCT, "URL задача", 30)
    assert result["tasks"][0]["url"] == f"/plan?task={t.task_id}"


def test_search_task_subtitle_with_due_date(db_session):
    _task(db_session, title="Задача с датой", due_date=date(2026, 5, 10))
    result = svc(db_session).search(ACCT, "датой", 30)
    assert result["tasks"][0]["subtitle"] == "10.05.2026"


def test_search_task_subtitle_no_due_date(db_session):
    _task(db_session, title="Задача без даты")
    result = svc(db_session).search(ACCT, "без даты", 30)
    assert result["tasks"][0]["subtitle"] == "Без даты"


def test_search_task_case_insensitive(db_session):
    _task(db_session, title="Купить Хлеб")
    result = svc(db_session).search(ACCT, "хлеб", 30)
    assert len(result["tasks"]) == 1


def test_search_task_archived_hidden_when_active_exists(db_session):
    _task(db_session, title="Активная задача хлеб")
    _task(db_session, title="Архивная задача хлеб", status="ARCHIVED")
    result = svc(db_session).search(ACCT, "хлеб", 30)
    assert len(result["tasks"]) == 1
    assert "Активная" in result["tasks"][0]["title"]
    assert result["tasks"][0]["is_archived"] is False


def test_search_task_archive_fallback_when_no_active(db_session):
    _task(db_session, title="Только архив хлеб", status="ARCHIVED")
    result = svc(db_session).search(ACCT, "хлеб", 30)
    assert len(result["tasks"]) == 1
    assert result["tasks"][0]["is_archived"] is True


def test_search_task_not_return_other_account(db_session):
    _task(db_session, title="Чужая задача молоко", account_id=OTHER_ACCT)
    result = svc(db_session).search(ACCT, "молоко", 30)
    assert result["tasks"] == []


def test_search_task_done_status_included(db_session):
    _task(db_session, title="Выполненная задача молоко", status="DONE")
    result = svc(db_session).search(ACCT, "молоко", 30)
    assert len(result["tasks"]) == 1


# ── events ───────────────────────────────────────────────────────────────────

def test_search_event_by_title(db_session):
    e = _event(db_session, title="День рождения мамы")
    _occ_event(db_session, e.event_id)
    _event(db_session, title="Совещание")

    result = svc(db_session).search(ACCT, "рождения", 30)
    assert len(result["events"]) == 1
    assert result["events"][0]["title"] == "День рождения мамы"


def test_search_event_by_description(db_session):
    e = _event(db_session, title="Событие", description="Поездка на море летом")
    _occ_event(db_session, e.event_id)

    result = svc(db_session).search(ACCT, "море", 30)
    assert len(result["events"]) == 1


def test_search_event_url_format(db_session):
    e = _event(db_session, title="Тест URL события")
    result = svc(db_session).search(ACCT, "URL события", 30)
    assert result["events"][0]["url"] == f"/events?id={e.event_id}"


def test_search_event_not_return_other_account(db_session):
    _event(db_session, title="Чужое событие море", account_id=OTHER_ACCT)
    result = svc(db_session).search(ACCT, "море", 30)
    assert result["events"] == []


def test_search_event_subtitle_with_occurrence(db_session):
    e = _event(db_session, title="Событие с датой")
    _occ_event(db_session, e.event_id, start_date=date(2026, 6, 15))
    result = svc(db_session).search(ACCT, "с датой", 30)
    assert result["events"][0]["subtitle"] == "15.06.2026"


def test_search_event_archived_hidden_when_active_exists(db_session):
    _event(db_session, title="Активный матч Зенит")
    _event(db_session, title="Архивный матч Зенит", is_active=False)
    result = svc(db_session).search(ACCT, "зенит", 30)
    assert len(result["events"]) == 1
    assert "Активный" in result["events"][0]["title"]
    assert result["events"][0]["is_archived"] is False


def test_search_event_archive_fallback_when_no_active(db_session):
    _event(db_session, title="Только архив матч Зенит", is_active=False)
    result = svc(db_session).search(ACCT, "зенит", 30)
    assert len(result["events"]) == 1
    assert result["events"][0]["is_archived"] is True


def test_search_event_subtitle_no_occurrence(db_session):
    _event(db_session, title="Событие без оккурренса")
    result = svc(db_session).search(ACCT, "без оккурренса", 30)
    assert result["events"][0]["subtitle"] is None


# ── operation templates ──────────────────────────────────────────────────────

def test_search_operation_by_title(db_session):
    _op_template(db_session, title="Аренда квартиры")
    _op_template(db_session, title="Зарплата")

    result = svc(db_session).search(ACCT, "аренда", 30)
    assert len(result["operations"]) == 1
    assert result["operations"][0]["title"] == "Аренда квартиры"


def test_search_operation_by_note(db_session):
    _op_template(db_session, title="Расход", note="оплата интернета ежемесячно")
    result = svc(db_session).search(ACCT, "интернета", 30)
    assert len(result["operations"]) == 1


def test_search_operation_archived_hidden_when_active_exists(db_session):
    _op_template(db_session, title="Активная аренда")
    _op_template(db_session, title="Архивная аренда", is_archived=True)
    result = svc(db_session).search(ACCT, "аренда", 30)
    assert len(result["operations"]) == 1
    assert "Активная" in result["operations"][0]["title"]
    assert result["operations"][0]["is_archived"] is False


def test_search_operation_archive_fallback_when_no_active(db_session):
    _op_template(db_session, title="Только архив аренда", is_archived=True)
    result = svc(db_session).search(ACCT, "аренда", 30)
    assert len(result["operations"]) == 1
    assert result["operations"][0]["is_archived"] is True


def test_search_operation_not_return_other_account(db_session):
    _op_template(db_session, title="Чужая аренда", account_id=OTHER_ACCT)
    result = svc(db_session).search(ACCT, "аренда", 30)
    assert result["operations"] == []


def test_search_operation_url_format(db_session):
    t = _op_template(db_session, title="Тест URL операции")
    result = svc(db_session).search(ACCT, "URL операции", 30)
    assert result["operations"][0]["url"] == f"/planned-ops?id={t.template_id}"


def test_search_operation_subtitle_with_occurrence(db_session):
    t = _op_template(db_session, title="Плановая операция")
    _occ_op(db_session, t.template_id, scheduled_date=date(2026, 7, 1))
    result = svc(db_session).search(ACCT, "плановая", 30)
    assert "01.07.2026" in result["operations"][0]["subtitle"]


def test_search_operation_subtitle_no_occurrence(db_session):
    _op_template(db_session, title="Операция без дат")
    result = svc(db_session).search(ACCT, "без дат", 30)
    assert result["operations"][0]["subtitle"] == "EXPENSE"


# ── transactions ─────────────────────────────────────────────────────────────

def test_search_transaction_by_description(db_session):
    _tx(db_session, description="Оплата кофе в Starbucks")
    _tx(db_session, description="Перевод другу")

    result = svc(db_session).search(ACCT, "кофе", 30)
    assert len(result["transactions"]) == 1
    assert "кофе" in result["transactions"][0]["title"].lower()


def test_search_transaction_not_return_other_account(db_session):
    _tx(db_session, description="Чужой кофе", account_id=OTHER_ACCT)
    result = svc(db_session).search(ACCT, "кофе", 30)
    assert result["transactions"] == []


def test_search_transaction_url_format(db_session):
    tx = _tx(db_session, description="URL транзакция кофе")
    result = svc(db_session).search(ACCT, "URL транзакция", 30)
    assert result["transactions"][0]["url"] == f"/money?id={tx.transaction_id}"


def test_search_transaction_subtitle_format(db_session):
    _tx(db_session, description="Покупка кофе", operation_type="EXPENSE", amount=Decimal("250.00"))
    result = svc(db_session).search(ACCT, "покупка кофе", 30)
    subtitle = result["transactions"][0]["subtitle"]
    assert "EXPENSE" in subtitle
    assert "250" in subtitle


# ── cross-entity ──────────────────────────────────────────────────────────────

def test_search_total_is_sum(db_session):
    _task(db_session, title="Тотал тест задача")
    e = _event(db_session, title="Тотал тест событие")
    _occ_event(db_session, e.event_id)
    _tx(db_session, description="Тотал тест транзакция")

    result = svc(db_session).search(ACCT, "тотал тест", 30)
    assert result["total"] == len(result["tasks"]) + len(result["events"]) + len(result["operations"]) + len(result["transactions"])
    assert result["total"] >= 3


def test_search_returns_all_four_keys(db_session):
    result = svc(db_session).search(ACCT, "нечто уникальное xyz123", 30)
    assert "tasks" in result
    assert "events" in result
    assert "operations" in result
    assert "transactions" in result
    assert "total" in result
