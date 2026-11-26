"""Нумерация id при создании планового шаблона.

У recurrence_rules и operation_templates id выдаётся вручную: номер
кладётся в событие, проектор вставляет строку с явным rule_id. Этот
обработчик раньше вставлял без id и полагался на последовательность
Postgres, которая о явных вставках не знает и отстаёт от максимума.
В проде это выстрелило:

    duplicate key value violates unique constraint "recurrence_rules_pkey"
    DETAIL: Key (rule_id)=(101) already exists

Здесь проверяется, что номер берётся у общего генератора, то есть
заведомо свободен.
"""
from datetime import date, datetime
from decimal import Decimal
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import JSON, create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.infrastructure.db.models import (
    CategoryInfo,
    OperationTemplateModel,
    RecurrenceRuleModel,
    WalletBalance,
)
from app.infrastructure.db.session import Base, get_db
from app.main import app

ACCT = 1
_NOW = datetime(2026, 1, 1)


@pytest.fixture()
def engine():
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    for table in Base.metadata.tables.values():
        for col in table.columns:
            if isinstance(col.type, JSONB):
                col.type = JSON()
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


@pytest.fixture()
def db(engine):
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    yield session
    session.rollback()
    session.close()


@pytest.fixture()
def client(db):
    def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    with patch("app.api.v2.planned_ops.get_user_id", return_value=ACCT):
        yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture()
def refs(db):
    db.add_all([
        WalletBalance(
            wallet_id=1, account_id=ACCT, title="Сбер", currency="RUB",
            wallet_type="REGULAR", balance=1000, is_archived=False, created_at=_NOW,
        ),
        CategoryInfo(
            category_id=1, account_id=ACCT, title="Обслуживание карт",
            category_type="EXPENSE", is_system=False, is_archived=False, created_at=_NOW,
        ),
    ])
    db.flush()


def _body(**over):
    body = {
        "kind": "EXPENSE",
        "title": "Ежегодное обслуживание карт Сбер",
        "amount": "150",
        "freq": "YEARLY",
        "interval": 1,
        "wallet_id": 1,
        "category_id": 1,
        "active_from": "2027-11-15",
    }
    body.update(over)
    return body


def _rule(db, rule_id: int) -> None:
    """Правило с явным id — так его создаёт проектор по событию."""
    db.add(RecurrenceRuleModel(
        rule_id=rule_id, account_id=ACCT, freq="MONTHLY", interval=1,
        start_date=date(2026, 1, 1), created_at=_NOW,
    ))
    db.flush()


class TestPlannedOpIds:
    def test_creates_next_free_rule_id(self, client, db, refs):
        """Правило с id 101 уже есть — новое должно получить 102."""
        _rule(db, 101)

        r = client.post("/api/v2/planned-ops", json=_body())
        assert r.status_code == 201, r.text

        ids = sorted(x.rule_id for x in db.query(RecurrenceRuleModel).all())
        assert ids == [101, 102]

    def test_survives_a_gap_in_numbering(self, client, db, refs):
        """Генератор смотрит на максимум, а не на количество строк."""
        _rule(db, 5)
        _rule(db, 900)

        assert client.post("/api/v2/planned-ops", json=_body()).status_code == 201

        ids = sorted(x.rule_id for x in db.query(RecurrenceRuleModel).all())
        assert ids == [5, 900, 901]

    def test_template_id_is_taken_from_the_generator_too(self, client, db, refs):
        """Вторая такая же мина была рядом — у шаблона операции."""
        db.add(OperationTemplateModel(
            template_id=77, account_id=ACCT, title="Старый", kind="EXPENSE",
            amount=Decimal("1"), rule_id=1, active_from=date(2026, 1, 1),
            is_archived=False, created_at=_NOW,
        ))
        db.flush()

        r = client.post("/api/v2/planned-ops", json=_body())
        assert r.status_code == 201, r.text
        assert r.json()["template_id"] == 78

    def test_two_in_a_row_do_not_collide(self, client, db, refs):
        _rule(db, 101)
        assert client.post("/api/v2/planned-ops", json=_body()).status_code == 201
        assert client.post("/api/v2/planned-ops", json=_body(title="Второй")).status_code == 201

        ids = sorted(x.rule_id for x in db.query(RecurrenceRuleModel).all())
        assert ids == [101, 102, 103]

    def test_takes_the_journal_into_account(self, client, db, refs):
        """Случай, ради которого генератор и нужен.

        В журнале есть событие с rule_id 500, а в таблице максимум 101:
        строку по нему ещё не создали (проектор отстал, read-model
        пересобирали). Автоинкремент выдал бы 102 и занял бы номер,
        который журнал уже раздал, — проектор потом упал бы на ключе.
        """
        from app.infrastructure.db.models import EventLog

        _rule(db, 101)
        db.add(EventLog(
            account_id=ACCT, event_type="recurrence_rule_created",
            payload_json={"rule_id": 500, "account_id": ACCT},
            occurred_at=_NOW, created_at=_NOW,
        ))
        db.flush()

        r = client.post("/api/v2/planned-ops", json=_body())
        assert r.status_code == 201, r.text

        ids = sorted(x.rule_id for x in db.query(RecurrenceRuleModel).all())
        assert ids == [101, 501]
