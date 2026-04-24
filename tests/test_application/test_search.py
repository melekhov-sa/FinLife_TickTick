"""
Tests for SearchService — global search across tasks, events, operation templates
and transactions. Runs on SQLite in-memory (ILIKE fallback).
"""
import pytest
from datetime import date, datetime, time, timezone
from decimal import Decimal

from app.infrastructure.db.models import (
    ArticleModel,
    CalendarEventModel,
    ContactModel,
    EventOccurrenceModel,
    GoalInfo,
    HabitModel,
    OperationOccurrence,
    OperationTemplateModel,
    RecurrenceRuleModel,
    SubscriptionModel,
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


def _habit(db, *, title="habit", note=None, is_archived=False, account_id=ACCT,
           reminder_time=None):
    hid = db.query(HabitModel).count() + 1
    rule = _rule(db, account_id=account_id)
    h = HabitModel(
        habit_id=hid,
        account_id=account_id,
        title=title,
        note=note,
        rule_id=rule.rule_id,
        active_from=date(2026, 1, 1),
        is_archived=is_archived,
        reminder_time=reminder_time,
    )
    db.add(h)
    db.flush()
    return h


def _goal(db, *, title="goal", target_amount=None, currency="RUB",
          is_archived=False, is_system=False, account_id=ACCT):
    gid = db.query(GoalInfo).count() + 1
    g = GoalInfo(
        goal_id=gid,
        account_id=account_id,
        title=title,
        currency=currency,
        target_amount=target_amount,
        is_archived=is_archived,
        is_system=is_system,
        created_at=_NOW,
        updated_at=_NOW,
    )
    db.add(g)
    db.flush()
    return g


def _subscription(db, *, name="sub", is_archived=False, paid_until_self=None,
                  account_id=ACCT):
    sid = db.query(SubscriptionModel).count() + 1
    s = SubscriptionModel(
        id=sid,
        account_id=account_id,
        name=name,
        expense_category_id=1,
        income_category_id=2,
        is_archived=is_archived,
        paid_until_self=paid_until_self,
    )
    db.add(s)
    db.flush()
    return s


def _contact(db, *, name="contact", note=None, is_archived=False, account_id=ACCT):
    cid = db.query(ContactModel).count() + 1
    c = ContactModel(
        id=cid,
        account_id=account_id,
        name=name,
        note=note,
        is_archived=is_archived,
    )
    db.add(c)
    db.flush()
    return c


def _article(db, *, title="article", content_md="", status="draft",
             article_type="note", account_id=ACCT):
    aid = db.query(ArticleModel).count() + 1
    a = ArticleModel(
        id=aid,
        account_id=account_id,
        title=title,
        content_md=content_md,
        type=article_type,
        status=status,
        created_at=_NOW,
        updated_at=_NOW,
    )
    db.add(a)
    db.flush()
    return a


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
    e_active = _event(db_session, title="Активный матч Зенит")
    _occ_event(db_session, e_active.event_id)
    _event(db_session, title="Архивный матч Зенит", is_active=False)
    result = svc(db_session).search(ACCT, "зенит", 30)
    assert len(result["events"]) == 1
    assert "Активный" in result["events"][0]["title"]
    assert result["events"][0]["is_archived"] is False


def test_search_active_event_without_occurrence_treated_as_archive(db_session):
    # Active event that has no live EventOccurrence is a dead record — it
    # must be hidden from the primary pass and only surface via the archive
    # fallback with is_archived=True.
    _event(db_session, title="Зенит пустое событие")
    result = svc(db_session).search(ACCT, "зенит пустое", 30)
    assert len(result["events"]) == 1
    assert result["events"][0]["is_archived"] is True


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


# ── habits ───────────────────────────────────────────────────────────────────

def test_search_habit_by_title(db_session):
    _habit(db_session, title="Утренняя зарядка")
    _habit(db_session, title="Чтение книг")
    result = svc(db_session).search(ACCT, "зарядка", 90)
    assert len(result["habits"]) == 1
    assert result["habits"][0]["title"] == "Утренняя зарядка"


def test_search_habit_by_note(db_session):
    _habit(db_session, title="Привычка", note="медитация каждое утро")
    result = svc(db_session).search(ACCT, "медитация", 90)
    assert len(result["habits"]) == 1


def test_search_habit_archived_hidden_when_active_exists(db_session):
    _habit(db_session, title="Активный бег")
    _habit(db_session, title="Архивный бег", is_archived=True)
    result = svc(db_session).search(ACCT, "бег", 90)
    assert len(result["habits"]) == 1
    assert "Активный" in result["habits"][0]["title"]
    assert result["habits"][0]["is_archived"] is False


def test_search_habit_archive_fallback_when_no_active(db_session):
    _habit(db_session, title="Только архив бег", is_archived=True)
    result = svc(db_session).search(ACCT, "бег", 90)
    assert len(result["habits"]) == 1
    assert result["habits"][0]["is_archived"] is True


def test_search_habit_not_return_other_account(db_session):
    _habit(db_session, title="Чужая зарядка", account_id=OTHER_ACCT)
    result = svc(db_session).search(ACCT, "зарядка", 90)
    assert result["habits"] == []


def test_search_habit_subtitle_with_reminder_time(db_session):
    _habit(db_session, title="Медитация утром", reminder_time=time(7, 30))
    result = svc(db_session).search(ACCT, "медитация утром", 90)
    assert result["habits"][0]["subtitle"] == "07:30"


def test_search_habit_subtitle_without_reminder_time(db_session):
    _habit(db_session, title="Прогулка вечером")
    result = svc(db_session).search(ACCT, "прогулка вечером", 90)
    assert result["habits"][0]["subtitle"] == "Привычка"


def test_search_habit_url_format(db_session):
    h = _habit(db_session, title="URL привычка тест")
    result = svc(db_session).search(ACCT, "URL привычка", 90)
    assert result["habits"][0]["url"] == f"/habits?id={h.habit_id}"


# ── goals ─────────────────────────────────────────────────────────────────────

def test_search_goal_by_title(db_session):
    _goal(db_session, title="Накопить на машину")
    _goal(db_session, title="Другая цель")
    result = svc(db_session).search(ACCT, "машину", 90)
    assert len(result["goals"]) == 1
    assert result["goals"][0]["title"] == "Накопить на машину"


def test_search_goal_archived_hidden_when_active_exists(db_session):
    _goal(db_session, title="Активная цель квартира")
    _goal(db_session, title="Архивная цель квартира", is_archived=True)
    result = svc(db_session).search(ACCT, "квартира", 90)
    assert len(result["goals"]) == 1
    assert "Активная" in result["goals"][0]["title"]
    assert result["goals"][0]["is_archived"] is False


def test_search_goal_archive_fallback_when_no_active(db_session):
    _goal(db_session, title="Только архив квартира", is_archived=True)
    result = svc(db_session).search(ACCT, "квартира", 90)
    assert len(result["goals"]) == 1
    assert result["goals"][0]["is_archived"] is True


def test_search_goal_not_return_other_account(db_session):
    _goal(db_session, title="Чужая цель машина", account_id=OTHER_ACCT)
    result = svc(db_session).search(ACCT, "машина", 90)
    assert result["goals"] == []


def test_search_goal_system_excluded(db_session):
    _goal(db_session, title="Системная цель резерв", is_system=True)
    result = svc(db_session).search(ACCT, "резерв", 90)
    assert result["goals"] == []


def test_search_goal_subtitle_with_target_amount(db_session):
    _goal(db_session, title="Цель с суммой", target_amount=Decimal("100000.00"), currency="RUB")
    result = svc(db_session).search(ACCT, "с суммой", 90)
    subtitle = result["goals"][0]["subtitle"]
    assert "100000" in subtitle
    assert "RUB" in subtitle


def test_search_goal_subtitle_without_target_amount(db_session):
    _goal(db_session, title="Цель без суммы", target_amount=None)
    result = svc(db_session).search(ACCT, "без суммы", 90)
    assert result["goals"][0]["subtitle"] == "Цель"


def test_search_goal_url_format(db_session):
    g = _goal(db_session, title="URL цель тест")
    result = svc(db_session).search(ACCT, "URL цель", 90)
    assert result["goals"][0]["url"] == f"/goals?id={g.goal_id}"


# ── subscriptions ─────────────────────────────────────────────────────────────

def test_search_subscription_by_name(db_session):
    _subscription(db_session, name="Яндекс Плюс")
    _subscription(db_session, name="Другая подписка")
    result = svc(db_session).search(ACCT, "Яндекс", 90)
    assert len(result["subscriptions"]) == 1
    assert result["subscriptions"][0]["title"] == "Яндекс Плюс"


def test_search_subscription_archived_hidden_when_active_exists(db_session):
    _subscription(db_session, name="Активный Нетфликс")
    _subscription(db_session, name="Архивный Нетфликс", is_archived=True)
    result = svc(db_session).search(ACCT, "Нетфликс", 90)
    assert len(result["subscriptions"]) == 1
    assert "Активный" in result["subscriptions"][0]["title"]
    assert result["subscriptions"][0]["is_archived"] is False


def test_search_subscription_archive_fallback_when_no_active(db_session):
    _subscription(db_session, name="Только архив Нетфликс", is_archived=True)
    result = svc(db_session).search(ACCT, "Нетфликс", 90)
    assert len(result["subscriptions"]) == 1
    assert result["subscriptions"][0]["is_archived"] is True


def test_search_subscription_not_return_other_account(db_session):
    _subscription(db_session, name="Чужой Спотифай", account_id=OTHER_ACCT)
    result = svc(db_session).search(ACCT, "Спотифай", 90)
    assert result["subscriptions"] == []


def test_search_subscription_subtitle_with_paid_until(db_session):
    _subscription(db_session, name="Спотифай", paid_until_self=date(2026, 6, 30))
    result = svc(db_session).search(ACCT, "Спотифай", 90)
    assert result["subscriptions"][0]["subtitle"] == "Оплачено до 30.06.2026"


def test_search_subscription_subtitle_without_paid_until(db_session):
    _subscription(db_session, name="Апл Мьюзик", paid_until_self=None)
    result = svc(db_session).search(ACCT, "Апл Мьюзик", 90)
    assert result["subscriptions"][0]["subtitle"] == "Подписка"


def test_search_subscription_url_format(db_session):
    s = _subscription(db_session, name="URL подписка тест")
    result = svc(db_session).search(ACCT, "URL подписка", 90)
    assert result["subscriptions"][0]["url"] == f"/subscriptions?id={s.id}"


# ── contacts ──────────────────────────────────────────────────────────────────

def test_search_contact_by_name(db_session):
    _contact(db_session, name="Иван Иванов")
    _contact(db_session, name="Петр Петров")
    result = svc(db_session).search(ACCT, "Иванов", 90)
    assert len(result["contacts"]) == 1
    assert result["contacts"][0]["title"] == "Иван Иванов"


def test_search_contact_by_note(db_session):
    _contact(db_session, name="Контакт", note="коллега по работе бухгалтер")
    result = svc(db_session).search(ACCT, "бухгалтер", 90)
    assert len(result["contacts"]) == 1


def test_search_contact_archived_hidden_when_active_exists(db_session):
    _contact(db_session, name="Активный Сидоров")
    _contact(db_session, name="Архивный Сидоров", is_archived=True)
    result = svc(db_session).search(ACCT, "Сидоров", 90)
    assert len(result["contacts"]) == 1
    assert "Активный" in result["contacts"][0]["title"]
    assert result["contacts"][0]["is_archived"] is False


def test_search_contact_archive_fallback_when_no_active(db_session):
    _contact(db_session, name="Только архив Сидоров", is_archived=True)
    result = svc(db_session).search(ACCT, "Сидоров", 90)
    assert len(result["contacts"]) == 1
    assert result["contacts"][0]["is_archived"] is True


def test_search_contact_not_return_other_account(db_session):
    _contact(db_session, name="Чужой Козлов", account_id=OTHER_ACCT)
    result = svc(db_session).search(ACCT, "Козлов", 90)
    assert result["contacts"] == []


def test_search_contact_subtitle_with_note(db_session):
    _contact(db_session, name="Контакт с заметкой", note="Директор компании Ромашка")
    result = svc(db_session).search(ACCT, "с заметкой", 90)
    assert "Директор" in result["contacts"][0]["subtitle"]


def test_search_contact_subtitle_without_note(db_session):
    _contact(db_session, name="Контакт без заметки")
    result = svc(db_session).search(ACCT, "без заметки", 90)
    assert result["contacts"][0]["subtitle"] == "Контакт"


def test_search_contact_url_format(db_session):
    c = _contact(db_session, name="URL контакт тест")
    result = svc(db_session).search(ACCT, "URL контакт", 90)
    assert result["contacts"][0]["url"] == f"/contacts?id={c.id}"


# ── articles ──────────────────────────────────────────────────────────────────

def test_search_article_by_title(db_session):
    _article(db_session, title="Инструкция по Docker", status="published")
    _article(db_session, title="Другая заметка", status="draft")
    result = svc(db_session).search(ACCT, "Docker", 90)
    assert len(result["articles"]) == 1
    assert result["articles"][0]["title"] == "Инструкция по Docker"


def test_search_article_by_content_md(db_session):
    _article(db_session, title="Заметка", content_md="Fastapi туториал по роутерам", status="draft")
    result = svc(db_session).search(ACCT, "туториал", 90)
    assert len(result["articles"]) == 1


def test_search_article_archived_hidden_when_active_exists(db_session):
    _article(db_session, title="Активная Python заметка", status="published")
    _article(db_session, title="Архивная Python заметка", status="archived")
    result = svc(db_session).search(ACCT, "Python заметка", 90)
    assert len(result["articles"]) == 1
    assert "Активная" in result["articles"][0]["title"]
    assert result["articles"][0]["is_archived"] is False


def test_search_article_archive_fallback_when_no_active(db_session):
    _article(db_session, title="Только архив Python", status="archived")
    result = svc(db_session).search(ACCT, "архив Python", 90)
    assert len(result["articles"]) == 1
    assert result["articles"][0]["is_archived"] is True


def test_search_article_not_return_other_account(db_session):
    _article(db_session, title="Чужая заметка Python", account_id=OTHER_ACCT, status="published")
    result = svc(db_session).search(ACCT, "Python", 90)
    assert result["articles"] == []


def test_search_article_status_draft_is_active(db_session):
    _article(db_session, title="Черновик заметка", status="draft")
    result = svc(db_session).search(ACCT, "черновик заметка", 90)
    assert len(result["articles"]) == 1
    assert result["articles"][0]["is_archived"] is False


def test_search_article_subtitle_note_type(db_session):
    _article(db_session, title="Типовая заметка", article_type="note", status="draft")
    result = svc(db_session).search(ACCT, "типовая заметка", 90)
    assert result["articles"][0]["subtitle"] == "Заметка"


def test_search_article_subtitle_project_type(db_session):
    _article(db_session, title="Проектная запись", article_type="project", status="draft")
    result = svc(db_session).search(ACCT, "проектная запись", 90)
    assert result["articles"][0]["subtitle"] == "Проект"


def test_search_article_subtitle_unknown_type(db_session):
    _article(db_session, title="Неизвестный тип wiki", article_type="wiki", status="draft")
    result = svc(db_session).search(ACCT, "неизвестный тип", 90)
    assert result["articles"][0]["subtitle"] == "Запись"


def test_search_article_url_format(db_session):
    a = _article(db_session, title="URL статья тест", status="published")
    result = svc(db_session).search(ACCT, "URL статья", 90)
    assert result["articles"][0]["url"] == f"/knowledge/{a.id}"


# ── cross-entity ──────────────────────────────────────────────────────────────

def test_search_total_is_sum(db_session):
    _task(db_session, title="Тотал тест задача")
    e = _event(db_session, title="Тотал тест событие")
    _occ_event(db_session, e.event_id)
    _tx(db_session, description="Тотал тест транзакция")

    result = svc(db_session).search(ACCT, "тотал тест", 90)
    assert result["total"] == (
        len(result["tasks"]) + len(result["events"]) + len(result["operations"])
        + len(result["transactions"]) + len(result["habits"]) + len(result["goals"])
        + len(result["subscriptions"]) + len(result["contacts"]) + len(result["articles"])
    )
    assert result["total"] >= 3


def test_search_returns_all_nine_keys(db_session):
    result = svc(db_session).search(ACCT, "нечто уникальное xyz123", 30)
    for key in ("tasks", "events", "operations", "transactions",
                "habits", "goals", "subscriptions", "contacts", "articles", "total"):
        assert key in result
