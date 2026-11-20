"""
Правка повторения события.

Раньше это умел только старый интерфейс: карточка события уводила на
/legacy/events/{id}/edit, потому что в v2 ручки не было вовсе — PATCH
умел название, описание и категорию, но не правило повторения.

Главное, что здесь закреплено, — что происходит с уже созданными
вхождениями при смене правила. Удаляются только будущие, порождённые
правилом и не отменённые: прошлое остаётся историей, перенесённые
вручную переживают смену, отменённые не воскресают.
"""
from datetime import date, datetime, timedelta, timezone

import pytest

from app.api.v2.events import RecurrenceInput, build_rule_fields
from app.infrastructure.db.models import (
    CalendarEventModel,
    EventOccurrenceModel,
    RecurrenceRuleModel,
)

ACCT = 1
_NOW = datetime(2026, 11, 1, tzinfo=timezone.utc)


def _inp(**kw):
    return RecurrenceInput(**kw)


class TestBuildRuleFields:
    """Конвертер из терминов формы в поля правила."""

    def test_no_repeat(self):
        assert build_rule_fields(_inp(freq=None))["freq"] is None

    def test_daily(self):
        f = build_rule_fields(_inp(freq="daily", start_date="2026-11-20"))
        assert f["freq"] == "DAILY"
        assert f["start_date"] == "2026-11-20"

    def test_weekly_keeps_weekdays(self):
        f = build_rule_fields(_inp(freq="weekly", rec_weekdays="MO,WE", start_date="2026-11-20"))
        assert f["freq"] == "WEEKLY"
        assert f["by_weekday"] == "MO,WE"

    def test_monthly_keeps_day(self):
        f = build_rule_fields(_inp(freq="monthly", rec_day=15))
        assert f["freq"] == "MONTHLY"
        assert f["by_monthday"] == 15

    def test_yearly_builds_start_from_month_and_day(self):
        f = build_rule_fields(_inp(freq="yearly", rec_month=7, rec_day_yearly=29))
        assert f["freq"] == "YEARLY"
        assert f["by_month"] == 7
        assert f["by_monthday_for_year"] == 29
        assert f["start_date"].endswith("-07-29")

    def test_interval_keeps_step(self):
        f = build_rule_fields(_inp(freq="interval", rec_interval=10, start_date="2026-11-20"))
        assert f["freq"] == "INTERVAL_DAYS"
        assert f["interval"] == 10

    def test_interval_defaults_to_one(self):
        assert build_rule_fields(_inp(freq="interval", start_date="2026-11-20"))["interval"] == 1


class TestRebuildKeepsWhatMatters:
    """Смена правила не должна стирать историю и ручные переносы."""

    @pytest.fixture
    def event(self, db_session):
        db_session.add(RecurrenceRuleModel(
            rule_id=1, account_id=ACCT, freq="WEEKLY", interval=1,
            start_date=date(2026, 11, 1), monthday_clip_to_last_day=True,
        ))
        ev = CalendarEventModel(
            event_id=1, account_id=ACCT, title="Тренировка", category_id=1,
            repeat_rule_id=1, is_active=True, created_at=_NOW,
        )
        db_session.add(ev)
        db_session.flush()
        return ev

    def _occ(self, db, start, source="rule", cancelled=False, oid=None):
        o = EventOccurrenceModel(
            id=oid, account_id=ACCT, event_id=1, start_date=start,
            source=source, is_cancelled=cancelled,
            created_at=_NOW, updated_at=_NOW,
        )
        db.add(o)
        db.flush()
        return o

    def test_rebuild_removes_only_future_rule_occurrences(self, db_session, event):
        from app.application.events import rebuild_event_occurrences
        today = date(2026, 11, 20)

        self._occ(db_session, date(2026, 11, 10), oid=1)                      # прошлое
        self._occ(db_session, date(2026, 11, 25), oid=2)                      # будущее по правилу
        self._occ(db_session, date(2026, 11, 26), source="manual", oid=3)     # перенесённое вручную
        self._occ(db_session, date(2026, 11, 27), cancelled=True, oid=4)      # отменённое
        db_session.commit()

        rebuild_event_occurrences(db_session, 1, ACCT, today)

        left = {o.id for o in db_session.query(EventOccurrenceModel).all()}
        assert 1 in left, "прошлое стёрли — это история"
        assert 3 in left, "ручной перенос не пережил смену правила"
        assert 4 in left, "отменённое воскресло"
        assert 2 not in left, "будущее по старому правилу должно уйти"

    def test_rebuild_reports_how_many_were_dropped(self, db_session, event):
        from app.application.events import rebuild_event_occurrences
        self._occ(db_session, date(2026, 11, 25), oid=10)
        self._occ(db_session, date(2026, 11, 26), oid=11)
        db_session.commit()

        assert rebuild_event_occurrences(db_session, 1, ACCT, date(2026, 11, 20)) == 2
