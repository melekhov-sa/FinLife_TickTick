"""CRUD накопительных планов: /api/v2/goals/saving-plans.

Расчёт взноса проверяется отдельно (test_application/test_goal_saving_plans).
Здесь — что ручки не пускают чужое и бессмысленное, а предпросмотр считает,
ничего не записывая.
"""
from datetime import datetime
from decimal import Decimal
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
    # Каждый роутер импортирует get_user_id к себе, поэтому патчить надо
    # оба: разбивка живёт в goals, снятие ручной суммы — в budget.
    with patch("app.api.v2.goals.get_user_id", return_value=ACCT),          patch("app.api.v2.budget.get_user_id", return_value=ACCT):
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


class TestPreviewComparison:
    """Помесячное «сейчас → станет» — чтобы эффект плана был виден до сохранения."""

    def test_no_rows_without_goal(self, client, goals):
        body = _body()
        body.pop("goal_id")
        assert client.post("/api/v2/goals/saving-plans/preview", json=body).json()["rows"] == []

    def test_rows_cover_the_window(self, client, goals):
        r = client.post("/api/v2/goals/saving-plans/preview", json=_body()).json()
        assert [x["month"] for x in r["rows"]] == [f"2026-{m:02d}" for m in range(1, 12)]
        assert all(x["current"] == "0" for x in r["rows"])
        # Все месяцы кроме последнего — ровный взнос, последний добирает
        # остаток, и в сумме выходит ровно целевая сумма.
        assert all(x["next"] == r["monthly_amount"] for x in r["rows"][:-1])
        assert sum(Decimal(x["next"]) for x in r["rows"]) == Decimal("30000")

    def test_adds_to_another_plan_of_the_same_goal(self, client, db, goals):
        """Два плана на одну цель складываются — это видно заранее."""
        db.add(GoalSavingPlan(
            account_id=ACCT, goal_id=GOAL, target_amount=1100,
            start_month="2026-01", target_month="2026-12",
            save_in_target_month=False, repeat_yearly=False, is_active=True,
            created_at=_NOW, updated_at=_NOW,
        ))
        db.flush()
        r = client.post("/api/v2/goals/saving-plans/preview", json=_body()).json()
        row = r["rows"][0]
        assert row["current"] == "100.00"
        assert row["next"] == "2827.27"

    def test_editing_compares_with_the_saved_version(self, client, db, goals):
        """При правке «сейчас» — это сохранённая версия плана, а не ноль:
        иначе сравнивать не с чем, в таблице-то она уже стоит."""
        created = client.post("/api/v2/goals/saving-plans", json=_body()).json()
        body = _body(target_amount="60000")
        body["plan_id"] = created["id"]
        r = client.post("/api/v2/goals/saving-plans/preview", json=body).json()
        row = r["rows"][0]
        assert row["current"] == created["schedule"]["monthly_amount"]  # 30 000 / 11
        assert row["next"] == r["monthly_amount"]                       # 60 000 / 11
        # Старая версия заменяется черновиком, а не складывается с ним
        assert float(row["next"]) == pytest.approx(float(row["current"]) * 2, abs=0.02)

    def test_manual_month_is_marked_and_unchanged(self, client, db, goals):
        """Вписанное руками главнее расчёта — месяц помечен и не меняется."""
        from app.infrastructure.db.models import BudgetGoalPlan, BudgetMonth

        bm = BudgetMonth(account_id=ACCT, year=2026, month=3, created_at=_NOW)
        db.add(bm)
        db.flush()
        db.add(BudgetGoalPlan(
            budget_month_id=bm.id, account_id=ACCT, goal_id=GOAL,
            plan_amount=5000, created_at=_NOW,
        ))
        db.flush()

        rows = client.post("/api/v2/goals/saving-plans/preview", json=_body()).json()["rows"]
        march = next(x for x in rows if x["month"] == "2026-03")
        assert march["manual"] is True
        assert march["current"] == "5000.00"
        assert march["next"] == "5000.00"

        april = next(x for x in rows if x["month"] == "2026-04")
        assert april["manual"] is False


class TestGoalTitle:
    def test_list_carries_goal_title(self, client, goals):
        """Общий список идёт по всем целям — без названия строки неразличимы."""
        client.post("/api/v2/goals/saving-plans", json=_body())
        assert client.get("/api/v2/goals/saving-plans").json()[0]["goal_title"] == "Страховка"

    def test_create_and_update_carry_it_too(self, client, goals):
        created = client.post("/api/v2/goals/saving-plans", json=_body()).json()
        assert created["goal_title"] == "Страховка"
        updated = client.patch(
            f"/api/v2/goals/saving-plans/{created['id']}", json={"is_active": False}
        ).json()
        assert updated["goal_title"] == "Страховка"


class TestBreakdown:
    """Из чего складывается клетка «Отложить» за месяц."""

    @staticmethod
    def _plan(db, title, amount, target, start="2026-12", in_target=False):
        p = GoalSavingPlan(
            account_id=ACCT, goal_id=GOAL, title=title, target_amount=amount,
            start_month=start, target_month=target,
            save_in_target_month=in_target, repeat_yearly=False, is_active=True,
            created_at=_NOW, updated_at=_NOW,
        )
        db.add(p)
        db.flush()
        return p

    def _get(self, client, year=2027, month=1):
        r = client.get(
            f"/api/v2/goals/saving-plans/breakdown?goal_id={GOAL}&year={year}&month={month}"
        )
        assert r.status_code == 200, r.text
        return r.json()

    def test_splits_two_plans_by_title(self, client, db, goals):
        """5 000 к маю и 10 000 к июню, оба с декабря — видно, что есть что."""
        self._plan(db, "На др брата", 5000, "2027-05")
        self._plan(db, "На др Пете", 10000, "2027-06")

        data = self._get(client)
        assert [(p["title"], p["amount"]) for p in data["plans"]] == [
            ("На др брата", "1000.00"),
            ("На др Пете", "1666.67"),
        ]
        assert data["computed_total"] == "2666.67"
        assert data["manual"] is None
        assert data["effective"] == "2666.67"

    def test_finished_plan_drops_out(self, client, db, goals):
        """В мае план «к маю» уже не копится — его в разбивке нет."""
        self._plan(db, "На др брата", 5000, "2027-05")
        self._plan(db, "На др Пете", 10000, "2027-06")

        data = self._get(client, month=5)
        assert [p["title"] for p in data["plans"]] == ["На др Пете"]
        # Май — последний месяц окна, он добирает остаток округления
        assert data["effective"] == "1666.65"

    def test_manual_overrides_but_split_still_visible(self, client, db, goals):
        """Ручная сумма главнее, но из чего был бы расчёт — всё равно видно."""
        from app.infrastructure.db.models import BudgetGoalPlan, BudgetMonth

        self._plan(db, "На др брата", 5000, "2027-05")
        bm = BudgetMonth(account_id=ACCT, year=2027, month=1, created_at=_NOW)
        db.add(bm)
        db.flush()
        db.add(BudgetGoalPlan(
            budget_month_id=bm.id, account_id=ACCT, goal_id=GOAL,
            plan_amount=9000, note="подарок дороже", created_at=_NOW,
        ))
        db.flush()

        data = self._get(client)
        assert data["manual"] == "9000.00"
        assert data["note"] == "подарок дороже"
        assert data["computed_total"] == "1000.00"
        assert data["effective"] == "9000.00"

    def test_empty_month(self, client, goals):
        data = self._get(client, year=2030, month=3)
        assert data["plans"] == []
        assert data["effective"] == "0"

    def test_inactive_plan_excluded(self, client, db, goals):
        p = self._plan(db, "Выключенный", 5000, "2027-05")
        p.is_active = False
        db.flush()
        assert self._get(client)["plans"] == []

    def test_title_round_trips(self, client, goals):
        body = _body()
        body["title"] = "  На др брата  "
        created = client.post("/api/v2/goals/saving-plans", json=body).json()
        assert created["title"] == "На др брата"
        assert client.get("/api/v2/goals/saving-plans").json()[0]["title"] == "На др брата"
        updated = client.patch(
            f"/api/v2/goals/saving-plans/{created['id']}", json={"title": "На др маме"}
        ).json()
        assert updated["title"] == "На др маме"


class TestClearManual:
    """Возврат клетки к расчётной сумме.

    Запись нуля не годится: ноль — это осознанное «в этом месяце не
    откладываю», он так же перебивает план. Нужно именно удаление.
    """

    @staticmethod
    def _manual(db, amount, note=None, year=2027, month=1):
        from app.infrastructure.db.models import BudgetGoalPlan, BudgetMonth

        bm = BudgetMonth(account_id=ACCT, year=year, month=month, created_at=_NOW)
        db.add(bm)
        db.flush()
        db.add(BudgetGoalPlan(
            budget_month_id=bm.id, account_id=ACCT, goal_id=GOAL,
            plan_amount=amount, note=note, created_at=_NOW,
        ))
        db.flush()

    def _breakdown(self, client):
        return client.get(
            f"/api/v2/goals/saving-plans/breakdown?goal_id={GOAL}&year=2027&month=1"
        ).json()

    def test_clears_manual_back_to_computed(self, client, db, goals):
        db.add(GoalSavingPlan(
            account_id=ACCT, goal_id=GOAL, title="На др брата", target_amount=5000,
            start_month="2026-12", target_month="2027-05",
            save_in_target_month=False, repeat_yearly=False, is_active=True,
            created_at=_NOW, updated_at=_NOW,
        ))
        # Ноль с комментарием — осознанное «в этом месяце не откладываю»,
        # он расчёт перебивает (в отличие от пустого нуля).
        self._manual(db, 0, note="январь тяжёлый")
        assert self._breakdown(client)["effective"] == "0.00"

        r = client.delete(
            f"/api/v2/budget/goal-plan?goal_id={GOAL}&year=2027&month=1"
        )
        assert r.status_code == 200, r.text
        assert r.json()["removed"] == 1
        assert self._breakdown(client)["effective"] == "1000.00"

    def test_is_quiet_when_nothing_to_clear(self, client, goals):
        r = client.delete(f"/api/v2/budget/goal-plan?goal_id={GOAL}&year=2030&month=4")
        assert r.status_code == 200
        assert r.json()["removed"] == 0

    def test_does_not_touch_other_accounts(self, client, db, goals):
        from app.infrastructure.db.models import BudgetGoalPlan, BudgetMonth

        bm = BudgetMonth(account_id=OTHER, year=2027, month=1, created_at=_NOW)
        db.add(bm)
        db.flush()
        db.add(BudgetGoalPlan(
            budget_month_id=bm.id, account_id=OTHER, goal_id=GOAL_FOREIGN,
            plan_amount=777, created_at=_NOW,
        ))
        db.flush()

        client.delete(f"/api/v2/budget/goal-plan?goal_id={GOAL_FOREIGN}&year=2027&month=1")
        db.expire_all()
        assert db.query(BudgetGoalPlan).filter(BudgetGoalPlan.account_id == OTHER).count() == 1


class TestBlankZeroIsNotManual:
    """Нулевая строка без комментария — пустая клетка, а не правка.

    Из-за неё предпросмотр показывал «0 ₽ · вписано руками» в каждом
    месяце, а в бюджете расчёт не появлялся вовсе.
    """

    @staticmethod
    def _zero_row(db, year, month, note=None):
        from app.infrastructure.db.models import BudgetGoalPlan, BudgetMonth

        bm = BudgetMonth(account_id=ACCT, year=year, month=month, created_at=_NOW)
        db.add(bm)
        db.flush()
        db.add(BudgetGoalPlan(
            budget_month_id=bm.id, account_id=ACCT, goal_id=GOAL,
            plan_amount=0, note=note, created_at=_NOW,
        ))
        db.flush()

    def test_preview_ignores_blank_zeros(self, client, db, goals):
        for m in range(1, 13):
            self._zero_row(db, 2026, m)
        body = _body(start_month="2026-01", target_month="2026-12", save_in_target_month=True)
        rows = client.post("/api/v2/goals/saving-plans/preview", json=body).json()["rows"]
        assert all(r["manual"] is False for r in rows)
        assert all(r["next"] == "2500.00" for r in rows)

    def test_preview_respects_zero_with_note(self, client, db, goals):
        self._zero_row(db, 2026, 3, note="март пропускаю")
        body = _body(start_month="2026-01", target_month="2026-12", save_in_target_month=True)
        rows = client.post("/api/v2/goals/saving-plans/preview", json=body).json()["rows"]
        march = next(r for r in rows if r["month"] == "2026-03")
        assert march["manual"] is True
        assert march["next"] == "0.00"

    def test_breakdown_ignores_blank_zero(self, client, db, goals):
        db.add(GoalSavingPlan(
            account_id=ACCT, goal_id=GOAL, title="На др брата", target_amount=5000,
            start_month="2026-12", target_month="2027-05",
            save_in_target_month=False, repeat_yearly=False, is_active=True,
            created_at=_NOW, updated_at=_NOW,
        ))
        self._zero_row(db, 2027, 1)
        data = client.get(
            f"/api/v2/goals/saving-plans/breakdown?goal_id={GOAL}&year=2027&month=1"
        ).json()
        assert data["manual"] is None
        assert data["effective"] == "1000.00"


class TestTargetMonthFields:
    def test_defaults_to_withdrawing(self, client, goals):
        created = client.post("/api/v2/goals/saving-plans", json=_body()).json()
        assert created["withdraw_in_target"] is True
        assert created["expense_category_id"] is None

    def test_can_set_category_and_clear_it(self, client, goals):
        body = _body()
        body["expense_category_id"] = 42
        created = client.post("/api/v2/goals/saving-plans", json=body).json()
        assert created["expense_category_id"] == 42

        cleared = client.patch(
            f"/api/v2/goals/saving-plans/{created['id']}",
            json={"expense_category_id": None},
        ).json()
        assert cleared["expense_category_id"] is None

    def test_untouched_category_survives_other_edits(self, client, goals):
        """Правка суммы не должна молча сбрасывать статью."""
        body = _body()
        body["expense_category_id"] = 42
        created = client.post("/api/v2/goals/saving-plans", json=body).json()
        updated = client.patch(
            f"/api/v2/goals/saving-plans/{created['id']}", json={"target_amount": "20000"}
        ).json()
        assert updated["expense_category_id"] == 42

    def test_withdrawal_can_be_switched_off(self, client, goals):
        body = _body()
        body["withdraw_in_target"] = False
        created = client.post("/api/v2/goals/saving-plans", json=body).json()
        assert created["withdraw_in_target"] is False


class TestContinue:
    """Следующий цикл покупки, которая дорожает."""

    def _finished(self, client, amount="10000"):
        body = _body(target_amount=amount, start_month="2026-01", target_month="2026-12")
        body["title"] = "Зимняя куртка"
        body["expense_category_id"] = 42
        return client.post("/api/v2/goals/saving-plans", json=body).json()

    def test_creates_next_cycle_with_new_amount(self, client, goals):
        old = self._finished(client)
        r = client.post(
            f"/api/v2/goals/saving-plans/{old['id']}/continue",
            json={"target_amount": "12000", "start_month": "2027-01", "target_month": "2027-12"},
        )
        assert r.status_code == 200, r.text
        fresh = r.json()
        assert fresh["target_amount"] == "12000.00"
        assert fresh["target_month"] == "2027-12"
        assert fresh["id"] != old["id"]

    def test_inherits_settings(self, client, goals):
        old = self._finished(client)
        fresh = client.post(
            f"/api/v2/goals/saving-plans/{old['id']}/continue",
            json={"target_amount": "12000", "start_month": "2027-01", "target_month": "2027-12"},
        ).json()
        assert fresh["title"] == "Зимняя куртка"
        assert fresh["expense_category_id"] == 42
        assert fresh["goal_id"] == GOAL

    def test_old_plan_stays_as_history(self, client, goals):
        old = self._finished(client)
        client.post(
            f"/api/v2/goals/saving-plans/{old['id']}/continue",
            json={"target_amount": "12000", "start_month": "2027-01", "target_month": "2027-12"},
        )
        rows = {p["id"]: p for p in client.get("/api/v2/goals/saving-plans").json()}
        assert rows[old["id"]]["is_active"] is False
        assert len(rows) == 2

    def test_rejects_bad_window(self, client, goals):
        old = self._finished(client)
        r = client.post(
            f"/api/v2/goals/saving-plans/{old['id']}/continue",
            json={"target_amount": "12000", "start_month": "2027-06", "target_month": "2027-01"},
        )
        assert r.status_code == 400

    def test_rejects_foreign_plan(self, client, db, goals):
        foreign = GoalSavingPlan(
            account_id=OTHER, goal_id=GOAL_FOREIGN, target_amount=5000,
            start_month="2026-01", target_month="2026-06",
            save_in_target_month=False, repeat_yearly=False, is_active=True,
            created_at=_NOW, updated_at=_NOW,
        )
        db.add(foreign)
        db.flush()
        r = client.post(
            f"/api/v2/goals/saving-plans/{foreign.id}/continue",
            json={"target_amount": "1", "start_month": "2027-01", "target_month": "2027-12"},
        )
        assert r.status_code == 404


class TestPriceHistory:
    """Цепочка циклов одной покупки видна в списке планов.

    Фронт строит её по (goal_id, title) и target_month, поэтому «Продолжить»
    обязан сохранять название и отдавать оба плана в общем списке.
    """

    def test_continue_keeps_both_cycles_with_same_title(self, client, goals):
        body = _body(target_amount="10000", start_month="2026-01", target_month="2026-12")
        body["title"] = "Зимняя куртка"
        old = client.post("/api/v2/goals/saving-plans", json=body).json()

        client.post(
            f"/api/v2/goals/saving-plans/{old['id']}/continue",
            json={"target_amount": "12000", "start_month": "2027-01", "target_month": "2027-12"},
        )

        rows = client.get("/api/v2/goals/saving-plans").json()
        chain = sorted(
            [r for r in rows if r["title"] == "Зимняя куртка"],
            key=lambda r: r["target_month"],
        )
        assert [(r["target_month"], r["target_amount"]) for r in chain] == [
            ("2026-12", "10000.00"),
            ("2027-12", "12000.00"),
        ]
        # Старый остаётся историей, новый — действующим
        assert [r["is_active"] for r in chain] == [False, True]

    def test_renaming_on_continue_starts_a_new_chain(self, client, goals):
        """Переименование — осознанный разрыв цепочки, а не ошибка."""
        body = _body(target_amount="10000", start_month="2026-01", target_month="2026-12")
        body["title"] = "Зимняя куртка"
        old = client.post("/api/v2/goals/saving-plans", json=body).json()

        fresh = client.post(
            f"/api/v2/goals/saving-plans/{old['id']}/continue",
            json={
                "target_amount": "12000", "start_month": "2027-01",
                "target_month": "2027-12", "title": "Пуховик",
            },
        ).json()
        assert fresh["title"] == "Пуховик"
