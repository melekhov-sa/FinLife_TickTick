"""
Tests for POST /api/v2/tasks/reorder endpoint
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, JSON
from sqlalchemy.orm import sessionmaker
from sqlalchemy.dialects.postgresql import JSONB
from unittest.mock import patch

from app.main import app
from app.infrastructure.db.session import Base, get_db
from app.infrastructure.db.models import TaskModel

ACCT = 1
OTHER_ACCT = 2


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

    # Patch get_user_id so the endpoint believes user is ACCT
    with patch("app.api.v2.tasks.get_user_id", return_value=ACCT):
        yield TestClient(app)

    app.dependency_overrides.clear()


def _make_task(db, account_id: int, title: str) -> TaskModel:
    t = TaskModel(account_id=account_id, title=title, status="ACTIVE")
    db.add(t)
    db.flush()
    return t


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_reorder_happy_path(db, client):
    """Setting manual_order via reorder endpoint persists correct 0-based indexes."""
    t1 = _make_task(db, ACCT, "Task A")
    t2 = _make_task(db, ACCT, "Task B")
    t3 = _make_task(db, ACCT, "Task C")
    db.commit()

    # Reverse order: C first, then B, then A
    resp = client.post("/api/v2/tasks/reorder", json={"ordered_ids": [t3.task_id, t2.task_id, t1.task_id]})
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}

    db.expire_all()
    assert db.get(TaskModel, t3.task_id).manual_order == 0
    assert db.get(TaskModel, t2.task_id).manual_order == 1
    assert db.get(TaskModel, t1.task_id).manual_order == 2


def test_reorder_empty_list(client):
    """Empty ordered_ids returns ok without error."""
    resp = client.post("/api/v2/tasks/reorder", json={"ordered_ids": []})
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


def test_reorder_foreign_task_returns_404(db, client):
    """A task belonging to a different account must result in 404."""
    foreign = _make_task(db, OTHER_ACCT, "Foreign task")
    own = _make_task(db, ACCT, "Own task")
    db.commit()

    resp = client.post(
        "/api/v2/tasks/reorder",
        json={"ordered_ids": [own.task_id, foreign.task_id]},
    )
    assert resp.status_code == 404
