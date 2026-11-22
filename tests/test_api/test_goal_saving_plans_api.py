"""CRUD накопительных планов: /api/v2/goals/saving-plans.

Расчёт взноса проверяется отдельно (test_application/test_goal_saving_plans).
Здесь — что ручки не пускают чужое и бессмысленное, а предпросмотр считает,
ничего не записывая.
"""
from datetime import datetime
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import JSON, create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.infrastructure.db.models import GoalInfo, GoalSavingPlan
from app.infrastructure.db.session import Base, get_db
from app.main import app

ACCT = 1
OTHER = 2
_NOW = datetime(2026, 1, 1)

GOAL = 10
GOAL_ARCHIVED = 11
GOAL_FOREIGN = 12


@pytest.fixture()
def engine():
    # StaticPool — одно соединение на весь движок. Иначе ручка делает
    # commit, соединение уходит в пул, а следующий запрос получает другое
    # и вместе с ним другую пустую базу в памяти.
    #
    # Движок на каждый тест, а не на модуль: ручки коммитят, и rollback
    # в teardown сессии уже ничего не откатит — данные протекали бы
    # между тестами.
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
    with patch("app.api.v2.goals.get_user_id", return_value=ACCT):
        yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture()
def goals(db):
    rows = [
        GoalInfo(goal_id=GOAL, account_id=ACCT, title="Страховка", currency="RUB",
                 is_system=False, is_archived=False, created_at=_NOW),
        GoalInfo(goal_id=GOAL_ARCHIVED, account_id=ACCT, title="Старое", currency="RUB",
                 is_system=False, is_archived=True, created_at=_NOW),
        GoalInfo(goal_id=GOAL_FOREIGN, account_id=OTHER, title="Чужое", currency="RUB",
                 is_system=False, is_archived=False, created_at=_NOW),
    ]
    db.add_all(rows)
    db.flush()
    return rows


def _body(**over):
    body = {
        "goal_id": GOAL,
        "target_amount": "30000",
        "start_month": "2026-01",
        "target_month": "2026-12",
        "save_in_target_month": False,
        "repeat_yearly": False,
    }
    body.update(over)
    return body


class TestCreate:
    def test_creates_and_computes_schedule(self, client, goals):
        r = client.post("/api/v2/goals/saving-plans", json=_body())
        assert r.status_code == 200, r.text
        data = r.json()
        # Январь–ноябрь: в целевом месяце не копим
        assert data["schedule"]["months"] == 11
        assert data["schedule"]["first_month"] == "2026-01"
        assert data["schedule"]["last_month"] == "2026-11"
        assert data["is_active"] is True
        assert data["is_finished"] is False

    def test_rejects_empty_window(self, client, goals):
        """Начало и цель в одном месяце, а в целевом копить нельзя."""
        r = client.post(
            "/api/v2/goals/saving-plans",
            json=_body(start_month="2026-05", target_month="2026-05"),
        )
        assert r.status_code == 400
        assert "Копить негде" in r.json()["detail"]

    def test_rejects_target_before_start(self, client, goals):
        r = client.post(
            "/api/v2/goals/saving-plans",
            json=_body(start_month="2026-06", target_month="2026-03"),
        )
        assert r.status_code == 400
        assert "раньше" in r.json()["detail"]

    def test_rejects_bad_month(self, client, goals):
        r = client.post("/api/v2/goals/saving-plans", json=_body(target_month="2026-13"))
        assert r.status_code == 400
        assert "ГГГГ-ММ" in r.json()["detail"]

    def test_rejects_zero_amount(self, client, goals):
        r = client.post("/api/v2/goals/saving-plans", json=_body(target_amount="0"))
        assert r.status_code == 400
        assert "больше нуля" in r.json()["detail"]

    def test_rejects_non_numeric_amount(self, client, goals):
        r = client.post("/api/v2/goals/saving-plans", json=_body(target_amount="много"))
        assert r.status_code == 400

    def test_rejects_foreign_goal(self, client, goals):
        r = client.post("/api/v2/goals/saving-plans", json=_body(goal_id=GOAL_FOREIGN))
        assert r.status_code == 404

    def test_rejects_archived_goal(self, client, goals):
        r = client.post("/api/v2/goals/saving-plans", json=_body(goal_id=GOAL_ARCHIVED))
        assert r.status_code == 400
        assert "архив" in r.json()["detail"]


class TestList:
    def test_lists_only_own(self, client, db, goals):
        client.post("/api/v2/goals/saving-plans", json=_body())
        db.add(GoalSavingPlan(
            account_id=OTHER, goal_id=GOAL_FOREIGN, target_amount=5000,
            start_month="2026-01", target_month="2026-06",
            save_in_target_month=False, repeat_yearly=False, is_active=True,
            created_at=_NOW, updated_at=_NOW,
        ))
        db.flush()

        rows = client.get("/api/v2/goals/saving-plans").json()
        assert [r["goal_id"] for r in rows] == [GOAL]

    def test_filters_by_goal(self, client, goals):
        client.post("/api/v2/goals/saving-plans", json=_body())
        assert client.get(f"/api/v2/goals/saving-plans?goal_id={GOAL}").json() != []
        assert client.get("/api/v2/goals/saving-plans?goal_id=999").json() == []

    def test_marks_past_one_off_as_finished(self, client, db, goals):
        """Разовый план с прошедшим сроком — не действующий."""
        db.add(GoalSavingPlan(
            account_id=ACCT, goal_id=GOAL, target_amount=1000,
            start_month="2020-01", target_month="2020-06",
            save_in_target_month=False, repeat_yearly=False, is_active=True,
            created_at=_NOW, updated_at=_NOW,
        ))
        db.flush()
        row = client.get(f"/api/v2/goals/saving-plans?goal_id={GOAL}").json()[0]
        assert row["is_finished"] is True

    def test_yearly_plan_is_never_finished(self, client, db, goals):
        db.add(GoalSavingPlan(
            account_id=ACCT, goal_id=GOAL, target_amount=1000,
            start_month="2020-01", target_month="2020-06",
            save_in_target_month=False, repeat_yearly=True, is_active=True,
            created_at=_NOW, updated_at=_NOW,
        ))
        db.flush()
        row = client.get(f"/api/v2/goals/saving-plans?goal_id={GOAL}").json()[0]
        assert row["is_finished"] is False


class TestUpdate:
    def test_shifting_target_recomputes(self, client, goals):
        plan_id = client.post("/api/v2/goals/saving-plans", json=_body()).json()["id"]
        r = client.patch(
            f"/api/v2/goals/saving-plans/{plan_id}",
            json={"target_month": "2027-01"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["schedule"]["months"] == 12

    def test_can_switch_off(self, client, goals):
        plan_id = client.post("/api/v2/goals/saving-plans", json=_body()).json()["id"]
        r = client.patch(f"/api/v2/goals/saving-plans/{plan_id}", json={"is_active": False})
        assert r.json()["is_active"] is False

    def test_invalid_window_changes_nothing(self, client, db, goals):
        """Отказ не должен оставить объект наполовину поправленным."""
        plan_id = client.post("/api/v2/goals/saving-plans", json=_body()).json()["id"]
        r = client.patch(
            f"/api/v2/goals/saving-plans/{plan_id}",
            json={"target_amount": "99999", "target_month": "2025-01"},
        )
        assert r.status_code == 400

        db.expire_all()
        plan = db.query(GoalSavingPlan).filter(GoalSavingPlan.id == plan_id).one()
        assert str(plan.target_amount) in ("30000.00", "30000")
        assert plan.target_month == "2026-12"

    def test_rejects_foreign_plan(self, client, db, goals):
        foreign = GoalSavingPlan(
            account_id=OTHER, goal_id=GOAL_FOREIGN, target_amount=5000,
            start_month="2026-01", target_month="2026-06",
            save_in_target_month=False, repeat_yearly=False, is_active=True,
            created_at=_NOW, updated_at=_NOW,
        )
        db.add(foreign)
        db.flush()
        r = client.patch(f"/api/v2/goals/saving-plans/{foreign.id}", json={"is_active": False})
        assert r.status_code == 404


class TestDelete:
    def test_deletes_own(self, client, db, goals):
        plan_id = client.post("/api/v2/goals/saving-plans", json=_body()).json()["id"]
        assert client.delete(f"/api/v2/goals/saving-plans/{plan_id}").status_code == 200
        assert db.query(GoalSavingPlan).filter(GoalSavingPlan.id == plan_id).first() is None

    def test_rejects_foreign(self, client, db, goals):
        foreign = GoalSavingPlan(
            account_id=OTHER, goal_id=GOAL_FOREIGN, target_amount=5000,
            start_month="2026-01", target_month="2026-06",
            save_in_target_month=False, repeat_yearly=False, is_active=True,
            created_at=_NOW, updated_at=_NOW,
        )
        db.add(foreign)
        db.flush()
        assert client.delete(f"/api/v2/goals/saving-plans/{foreign.id}").status_code == 404
        db.expire_all()
        assert db.query(GoalSavingPlan).filter(GoalSavingPlan.id == foreign.id).first() is not None


class TestPreview:
    def test_computes_without_saving(self, client, db, goals):
        body = _body()
        body.pop("goal_id")
        r = client.post("/api/v2/goals/saving-plans/preview", json=body)
        assert r.status_code == 200, r.text
        assert r.json()["months"] == 11
        assert db.query(GoalSavingPlan).count() == 0

    def test_reports_bad_window(self, client, goals):
        body = _body(start_month="2026-05", target_month="2026-05")
        body.pop("goal_id")
        r = client.post("/api/v2/goals/saving-plans/preview", json=body)
        assert r.status_code == 400

    def test_saving_in_target_month_adds_a_month(self, client, goals):
        body = _body(save_in_target_month=True)
        body.pop("goal_id")
        r = client.post("/api/v2/goals/saving-plans/preview", json=body)
        assert r.json()["months"] == 12
