"""
События с ручным закрытием не должны теряться.

Регрессия из жизни: событие «Сериал Айда» (completion_mode=manual) перенесли
с 13 на 14 ноября, оно не было отмечено выполненным — и пропало из плана,
когда 14-е стало прошлым. Активная вкладка отбирала события только по
попаданию в диапазон дат, просрочки у них не было вовсе, а вкладка
«Выполненные» показывала любое прошедшее событие как закрытое.
"""
from datetime import date, datetime, timedelta, timezone

import pytest

from app.application.plan import _event_is_overdue, _query_event_occurrences
from app.infrastructure.db.models import CalendarEventModel, EventOccurrenceModel

ACCT = 1
TODAY = date(2026, 11, 16)
_NOW = datetime(2026, 11, 1, tzinfo=timezone.utc)


def _event(db, *, event_id=107, title="Сериал Айда", mode="manual", active=True):
    ev = CalendarEventModel(
        event_id=event_id, account_id=ACCT, title=title, category_id=1,
        completion_mode=mode, is_active=active, created_at=_NOW,
    )
    db.add(ev)
    db.flush()
    return ev


def _occ(db, ev, *, start, completed=False, cancelled=False, source="rule", oid=None):
    occ = EventOccurrenceModel(
        id=oid, account_id=ACCT, event_id=ev.event_id, start_date=start,
        is_completed=completed, is_cancelled=cancelled, source=source,
        created_at=_NOW, updated_at=_NOW,
    )
    db.add(occ)
    db.flush()
    return occ


def _active(db):
    return _query_event_occurrences(
        db, ACCT, TODAY, "active",
        date_from=TODAY, date_to=TODAY + timedelta(days=14), wc_map={},
    )


def _done(db):
    return _query_event_occurrences(
        db, ACCT, TODAY, "done",
        date_from=TODAY, date_to=TODAY + timedelta(days=14), wc_map={},
    )


class TestIsOverdue:
    def test_manual_uncompleted_in_the_past_is_overdue(self, db_session):
        ev = _event(db_session)
        occ = _occ(db_session, ev, start=date(2026, 11, 14))
        assert _event_is_overdue(occ, ev, TODAY) is True

    def test_completed_is_not_overdue(self, db_session):
        ev = _event(db_session)
        occ = _occ(db_session, ev, start=date(2026, 11, 14), completed=True)
        assert _event_is_overdue(occ, ev, TODAY) is False

    def test_cancelled_is_not_overdue(self, db_session):
        ev = _event(db_session)
        occ = _occ(db_session, ev, start=date(2026, 11, 13), cancelled=True)
        assert _event_is_overdue(occ, ev, TODAY) is False

    def test_future_is_not_overdue(self, db_session):
        ev = _event(db_session)
        occ = _occ(db_session, ev, start=date(2026, 11, 20))
        assert _event_is_overdue(occ, ev, TODAY) is False

    @pytest.mark.parametrize("mode", ["end_of_day", "at_event_end"])
    def test_auto_closing_modes_are_never_overdue(self, db_session, mode):
        """Такие события считаются состоявшимися сами — напоминать не о чем."""
        ev = _event(db_session, mode=mode)
        occ = _occ(db_session, ev, start=date(2026, 11, 14))
        assert _event_is_overdue(occ, ev, TODAY) is False


class TestPlanVisibility:
    def test_the_aida_case(self, db_session):
        """13-е отменено переносом, 14-е живое и не отмечено — должно быть видно."""
        ev = _event(db_session)
        _occ(db_session, ev, start=date(2026, 11, 13), cancelled=True, oid=281)
        _occ(db_session, ev, start=date(2026, 11, 14), source="manual", oid=288)
        _occ(db_session, ev, start=date(2026, 11, 20), oid=282)

        ids = {i["id"] for i in _active(db_session)}

        assert 288 in ids, "перенесённое событие пропало из плана"
        assert 282 in ids, "будущее событие должно остаться"
        assert 281 not in ids, "отменённое показывать не надо"

    def test_carried_over_entry_is_marked_overdue(self, db_session):
        ev = _event(db_session)
        _occ(db_session, ev, start=date(2026, 11, 14), oid=288)

        item = next(i for i in _active(db_session) if i["id"] == 288)

        assert item["is_overdue"] is True
        assert item["is_done"] is False

    def test_no_duplicate_when_date_is_inside_the_window(self, db_session):
        ev = _event(db_session)
        _occ(db_session, ev, start=TODAY, oid=300)

        ids = [i["id"] for i in _active(db_session)]

        assert ids.count(300) == 1

    def test_unmarked_manual_event_is_not_reported_as_done(self, db_session):
        ev = _event(db_session)
        _occ(db_session, ev, start=date(2026, 11, 14), oid=288)

        assert 288 not in {i["id"] for i in _done(db_session)}

    def test_marked_manual_event_lands_in_done(self, db_session):
        ev = _event(db_session)
        _occ(db_session, ev, start=date(2026, 11, 14), completed=True, oid=288)

        assert 288 in {i["id"] for i in _done(db_session)}

    def test_past_auto_event_still_counts_as_done(self, db_session):
        ev = _event(db_session, mode="end_of_day")
        _occ(db_session, ev, start=date(2026, 11, 14), oid=288)

        assert 288 in {i["id"] for i in _done(db_session)}
        assert 288 not in {i["id"] for i in _active(db_session)}

    def test_archived_event_does_not_come_back(self, db_session):
        ev = _event(db_session, active=False)
        _occ(db_session, ev, start=date(2026, 11, 14), oid=288)

        assert 288 not in {i["id"] for i in _active(db_session)}
