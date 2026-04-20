"""Tests for PATCH /api/v2/planned-ops/occurrences/{id} — reschedule occurrence."""
import pytest
from datetime import date, datetime
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, JSON
from sqlalchemy.orm import sessionmaker
from sqlalchemy.dialects.postgresql import JSONB
from unittest.mock import patch

from app.main import app
from app.infrastructure.db.session import Base, get_db
from app.infrastructure.db.models import (
    WalletBalance, CategoryInfo, OperationTemplateModel, OperationOccurrence,
    RecurrenceRuleModel,
)

ACCT = 1
OTHER_ACCT = 2
_NOW = datetime(2026, 1, 1)


@pytest.fixture(scope="module")
def engine():
    eng = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
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


def _make_wallet(db, account_id: int, wallet_id: int) -> WalletBalance:
    w = WalletBalance(
        wallet_id=wallet_id, account_id=account_id,
        title="Кошелёк", currency="RUB", wallet_type="REGULAR",
        balance=10000, is_archived=False, created_at=_NOW,
    )
    db.add(w)
    db.flush()
    return w


def _make_category(db, account_id: int, category_id: int) -> CategoryInfo:
    c = CategoryInfo(
        category_id=category_id, account_id=account_id,
        title="Еда", category_type="EXPENSE",
        is_system=False, is_archived=False, created_at=_NOW,
    )
    db.add(c)
    db.flush()
    return c


def _make_rule(db, account_id: int) -> RecurrenceRuleModel:
    r = RecurrenceRuleModel(
        account_id=account_id, freq="MONTHLY", interval=1,
        start_date=date(2026, 1, 1),
    )
    db.add(r)
    db.flush()
    return r


def _make_template(db, account_id: int, wallet_id: int, category_id: int) -> OperationTemplateModel:
    rule = _make_rule(db, account_id)
    t = OperationTemplateModel(
        account_id=account_id, title="Аренда", kind="EXPENSE",
        amount=Decimal("5000"), wallet_id=wallet_id, category_id=category_id,
        rule_id=rule.rule_id, active_from=date(2026, 1, 1), is_archived=False,
    )
    db.add(t)
    db.flush()
    return t


def _make_occurrence(db, account_id: int, template_id: int, sched_date: date, status: str = "ACTIVE") -> OperationOccurrence:
    occ = OperationOccurrence(
        account_id=account_id, template_id=template_id,
        scheduled_date=sched_date, status=status,
    )
    db.add(occ)
    db.flush()
    return occ


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_reschedule_occurrence_happy_path(db, client):
    """PATCH updates scheduled_date of an ACTIVE occurrence."""
    w = _make_wallet(db, ACCT, wallet_id=100)
    c = _make_category(db, ACCT, category_id=100)
    tmpl = _make_template(db, ACCT, w.wallet_id, c.category_id)
    occ = _make_occurrence(db, ACCT, tmpl.template_id, date(2026, 4, 20))
    db.commit()

    resp = client.patch(
        f"/api/v2/planned-ops/occurrences/{occ.id}",
        json={"scheduled_date": "2026-04-25"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}

    db.expire_all()
    updated = db.get(OperationOccurrence, occ.id)
    assert updated.scheduled_date == date(2026, 4, 25)


def test_reschedule_bad_date_format_returns_400(db, client):
    """Invalid date string returns 400."""
    w = _make_wallet(db, ACCT, wallet_id=101)
    c = _make_category(db, ACCT, category_id=101)
    tmpl = _make_template(db, ACCT, w.wallet_id, c.category_id)
    occ = _make_occurrence(db, ACCT, tmpl.template_id, date(2026, 4, 20))
    db.commit()

    resp = client.patch(
        f"/api/v2/planned-ops/occurrences/{occ.id}",
        json={"scheduled_date": "not-a-date"},
    )
    assert resp.status_code == 400
    assert "дата" in resp.json()["detail"].lower()


def test_reschedule_non_active_occurrence_returns_400(db, client):
    """SKIPPED occurrence cannot be rescheduled."""
    w = _make_wallet(db, ACCT, wallet_id=102)
    c = _make_category(db, ACCT, category_id=102)
    tmpl = _make_template(db, ACCT, w.wallet_id, c.category_id)
    occ = _make_occurrence(db, ACCT, tmpl.template_id, date(2026, 4, 20), status="SKIPPED")
    db.commit()

    resp = client.patch(
        f"/api/v2/planned-ops/occurrences/{occ.id}",
        json={"scheduled_date": "2026-04-25"},
    )
    assert resp.status_code == 400
    assert "активн" in resp.json()["detail"].lower()


def test_reschedule_other_user_occurrence_returns_404(db, client):
    """Occurrence belonging to another account returns 404."""
    w = _make_wallet(db, OTHER_ACCT, wallet_id=103)
    c = _make_category(db, OTHER_ACCT, category_id=103)
    tmpl = _make_template(db, OTHER_ACCT, w.wallet_id, c.category_id)
    occ = _make_occurrence(db, OTHER_ACCT, tmpl.template_id, date(2026, 4, 20))
    db.commit()

    resp = client.patch(
        f"/api/v2/planned-ops/occurrences/{occ.id}",
        json={"scheduled_date": "2026-04-25"},
    )
    assert resp.status_code == 404
