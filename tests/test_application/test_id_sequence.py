"""
Выдача id для сущностей с ручной нумерацией.

Живая авария: создание шаблона плановой операции падало с
«duplicate key value violates unique constraint "recurrence_rules_pkey",
Key (rule_id)=(99) already exists» — и так на каждой попытке.

Причина: правило для плановой операции создаётся напрямую в таблице
(app/api/v2/planned_ops.py), без события, а CreateRecurrenceRuleUseCase
считал следующий номер только по журналу событий. Журнал отставал от
таблицы и сам себя догнать не мог.
"""
from datetime import date, datetime, timezone

import pytest

from app.application.id_sequence import next_entity_id
from app.infrastructure.db.models import EventLog, RecurrenceRuleModel

ACCT = 1
_NOW = datetime(2026, 11, 18, tzinfo=timezone.utc)

KW = dict(
    event_type="recurrence_rule_created",
    payload_key="rule_id",
)


def _rule(db, rule_id):
    db.add(RecurrenceRuleModel(
        rule_id=rule_id, account_id=ACCT, freq="MONTHLY", interval=1,
        start_date=date(2026, 1, 1), monthday_clip_to_last_day=True,
    ))
    db.flush()


def _event(db, rule_id, eid):
    db.add(EventLog(
        id=eid, account_id=ACCT, event_type="recurrence_rule_created",
        payload_json={"rule_id": rule_id}, occurred_at=_NOW,
    ))
    db.flush()


def _next(db):
    return next_entity_id(db, column=RecurrenceRuleModel.rule_id, **KW)


@pytest.mark.unit
def test_empty_starts_at_one(db_session):
    assert _next(db_session) == 1


@pytest.mark.unit
def test_follows_the_event_log(db_session):
    _rule(db_session, 5)
    _event(db_session, 5, 1)

    assert _next(db_session) == 6


@pytest.mark.unit
def test_row_without_event_does_not_cause_a_collision(db_session):
    """Та самая авария: строка 99 есть, события на неё нет."""
    _rule(db_session, 98)
    _event(db_session, 98, 1)
    _rule(db_session, 99)  # создано в обход журнала

    assert _next(db_session) == 100, "выдан занятый номер — вставка упадёт"


@pytest.mark.unit
def test_event_without_row_is_respected(db_session):
    """Строку могли удалить, но номер переиспользовать нельзя."""
    _event(db_session, 42, 1)

    assert _next(db_session) == 43


@pytest.mark.unit
def test_repeated_calls_are_stable_until_something_is_written(db_session):
    _rule(db_session, 7)

    assert _next(db_session) == 8
    assert _next(db_session) == 8


@pytest.mark.unit
def test_generated_id_is_actually_free(db_session):
    _rule(db_session, 98)
    _event(db_session, 98, 1)
    _rule(db_session, 99)

    new_id = _next(db_session)
    _rule(db_session, new_id)          # не должно упасть на уникальном ключе

    assert db_session.query(RecurrenceRuleModel).count() == 3
