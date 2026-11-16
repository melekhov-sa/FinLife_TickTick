"""
Перенос вхождения повторяющейся задачи.

Перенос пишется в display_date, а scheduled_date намеренно остаётся прежним
— на нём держится идемпотентность генератора и ключ уникальности. Значит
везде, где дата сравнивается с «сегодня», сравнивать надо эффективную.
Блок «Сегодня» на главной этого не делал вовсе: перенесённая задача
продолжала висеть на старом числе и уезжала в просрочку.
"""
from datetime import date, datetime, timedelta, timezone

import pytest

from app.application.dashboard import DashboardService
from app.application.plan import build_plan_view
from app.infrastructure.db.models import TaskOccurrence, TaskTemplateModel, RecurrenceRuleModel

ACCT = 1
TODAY = date(2026, 11, 16)
MOVED_TO = date(2026, 11, 18)
_NOW = datetime(2026, 11, 1, tzinfo=timezone.utc)


@pytest.fixture
def chained_task(db_session):
    """Задача «создавать следующую через N дней», заведённая на сегодня."""
    db_session.add(RecurrenceRuleModel(
        rule_id=1, account_id=ACCT, freq="DAILY", interval=30,
        start_date=TODAY, monthday_clip_to_last_day=True, anchor="COMPLETION",
    ))
    db_session.add(TaskTemplateModel(
        template_id=1, account_id=ACCT, title="Заменить фильтр",
        rule_id=1, active_from=TODAY, is_archived=False, created_at=_NOW,
    ))
    occ = TaskOccurrence(
        id=500, account_id=ACCT, template_id=1,
        scheduled_date=TODAY, status="ACTIVE",
    )
    db_session.add(occ)
    db_session.commit()
    return occ


def _today_items(db):
    block = DashboardService(db).get_today_block(ACCT, TODAY)
    return block["overdue"] + block["active"]


def _plan_dates(db):
    view = build_plan_view(db, ACCT, TODAY, tab="active", range_days=14)
    return {
        e["id"]: g["date"]
        for g in view["day_groups"] for e in g["entries"] if e["kind"] == "task_occ"
    }


class TestDashboardHonoursReschedule:
    def test_before_reschedule_it_is_today(self, db_session, chained_task):
        ids = {i["id"] for i in _today_items(db_session)}
        assert 500 in ids

    def test_after_reschedule_it_leaves_today(self, db_session, chained_task):
        chained_task.display_date = MOVED_TO
        db_session.commit()

        items = _today_items(db_session)

        assert all(i["id"] != 500 for i in items), \
            "перенесённая задача осталась висеть на сегодня"

    def test_rescheduled_task_is_not_counted_overdue(self, db_session, chained_task):
        """Главная ловушка: без учёта display_date задача уезжала в просрочку."""
        chained_task.display_date = MOVED_TO
        db_session.commit()

        block = DashboardService(db_session).get_today_block(ACCT, TODAY + timedelta(days=1))

        assert all(i["id"] != 500 for i in block["overdue"])

    def test_item_reports_the_new_date(self, db_session, chained_task):
        chained_task.display_date = MOVED_TO
        db_session.commit()

        block = DashboardService(db_session).get_today_block(ACCT, MOVED_TO)
        item = next(i for i in block["active"] if i["id"] == 500)

        assert item["date"] == MOVED_TO


class TestPlanHonoursReschedule:
    def test_entry_moves_to_the_new_day(self, db_session, chained_task):
        chained_task.display_date = MOVED_TO
        db_session.commit()

        assert _plan_dates(db_session).get(500) == MOVED_TO

    def test_overdue_count_follows_the_new_date(self, db_session, chained_task):
        chained_task.display_date = MOVED_TO
        db_session.commit()

        view = build_plan_view(db_session, ACCT, TODAY + timedelta(days=1),
                               tab="active", range_days=14)

        assert view["summary"]["overdue_count"] == 0
