"""
Цепочечные повторения: следующая задача через N после выполнения предыдущей.

Главное, что здесь защищается: вхождения вперёд НЕ генерируются (иначе снова
копилась бы просрочка) и цепочка не обрывается молча.
"""
from datetime import date, datetime, timedelta, timezone

import pytest

from app.application.chained_recurrence import (
    ANCHOR_COMPLETION,
    ensure_next_after_completion,
    seed_first_occurrence,
)
from app.application.occurrence_generator import OccurrenceGenerator
from app.infrastructure.db.models import (
    RecurrenceRuleModel,
    TaskOccurrence,
    TaskTemplateModel,
)

ACCT = 1


def _make_template(db, *, freq="MONTHLY", interval=1, anchor=ANCHOR_COMPLETION,
                   start=date(2026, 1, 15), until=None, active_until=None,
                   archived=False, rule_id=1, template_id=1):
    db.add(RecurrenceRuleModel(
        rule_id=rule_id, account_id=ACCT, freq=freq, interval=interval,
        start_date=start, until_date=until, monthday_clip_to_last_day=True,
        anchor=anchor,
    ))
    db.add(TaskTemplateModel(
        template_id=template_id, account_id=ACCT, title="Подорожник",
        rule_id=rule_id, active_from=start, active_until=active_until,
        is_archived=archived, created_at=datetime.now(timezone.utc),
    ))
    db.flush()
    return template_id


def _complete(db, occ, when: date):
    occ.status = "DONE"
    occ.completed_at = datetime(when.year, when.month, when.day, 12, 0, tzinfo=timezone.utc)
    db.flush()


@pytest.mark.unit
def test_seed_creates_the_single_first_occurrence(db_session):
    tid = _make_template(db_session)

    seed_first_occurrence(db_session, ACCT, tid, date(2026, 1, 15))

    rows = db_session.query(TaskOccurrence).all()
    assert len(rows) == 1
    assert rows[0].scheduled_date == date(2026, 1, 15)
    assert rows[0].status == "ACTIVE"


@pytest.mark.unit
def test_seed_is_idempotent(db_session):
    tid = _make_template(db_session)
    seed_first_occurrence(db_session, ACCT, tid, date(2026, 1, 15))
    seed_first_occurrence(db_session, ACCT, tid, date(2026, 1, 15))

    assert db_session.query(TaskOccurrence).count() == 1


@pytest.mark.unit
def test_next_is_measured_from_completion_not_schedule(db_session):
    """Суть режима: просрочил на месяц — следующая всё равно через месяц от факта."""
    tid = _make_template(db_session, freq="MONTHLY", interval=1)
    occ = seed_first_occurrence(db_session, ACCT, tid, date(2026, 1, 15))

    _complete(db_session, occ, date(2026, 2, 10))   # закрыл с опозданием
    nxt = ensure_next_after_completion(db_session, ACCT, occ.id)

    assert nxt is not None
    assert nxt.scheduled_date == date(2026, 3, 10)  # не 15 февраля
    assert nxt.status == "ACTIVE"


@pytest.mark.unit
def test_only_one_active_occurrence_at_a_time(db_session):
    tid = _make_template(db_session)
    occ = seed_first_occurrence(db_session, ACCT, tid, date(2026, 1, 15))
    _complete(db_session, occ, date(2026, 1, 15))
    ensure_next_after_completion(db_session, ACCT, occ.id)

    active = db_session.query(TaskOccurrence).filter(TaskOccurrence.status == "ACTIVE").all()
    assert len(active) == 1


@pytest.mark.unit
def test_repeat_call_does_not_duplicate(db_session):
    tid = _make_template(db_session)
    occ = seed_first_occurrence(db_session, ACCT, tid, date(2026, 1, 15))
    _complete(db_session, occ, date(2026, 1, 15))

    first = ensure_next_after_completion(db_session, ACCT, occ.id)
    second = ensure_next_after_completion(db_session, ACCT, occ.id)

    assert first is not None
    assert second is None
    assert db_session.query(TaskOccurrence).count() == 2


@pytest.mark.unit
@pytest.mark.parametrize("freq,interval,done,expected", [
    ("DAILY",   10, date(2026, 1, 15), date(2026, 1, 25)),
    ("WEEKLY",   2, date(2026, 1, 15), date(2026, 1, 29)),
    ("MONTHLY",  2, date(2026, 1, 15), date(2026, 3, 15)),
    ("YEARLY",   1, date(2026, 1, 15), date(2027, 1, 15)),
    # календарный месяц, а не 30 дней: 31-е прижимается к последнему дню
    ("MONTHLY",  1, date(2026, 1, 31), date(2026, 2, 28)),
])
def test_all_four_units(db_session, freq, interval, done, expected):
    tid = _make_template(db_session, freq=freq, interval=interval)
    occ = seed_first_occurrence(db_session, ACCT, tid, done)
    _complete(db_session, occ, done)

    nxt = ensure_next_after_completion(db_session, ACCT, occ.id)

    assert nxt is not None and nxt.scheduled_date == expected


@pytest.mark.unit
def test_leftover_active_pile_blocks_until_cleared(db_session):
    """Режим включили у задачи с хвостом просрочки — цепочка ждёт, пока разгребут."""
    tid = _make_template(db_session)
    for d in (date(2025, 9, 15), date(2025, 10, 15), date(2025, 11, 15)):
        db_session.add(TaskOccurrence(
            account_id=ACCT, template_id=tid, scheduled_date=d, status="ACTIVE"
        ))
    db_session.flush()
    stale = db_session.query(TaskOccurrence).filter(
        TaskOccurrence.scheduled_date == date(2025, 9, 15)
    ).one()
    _complete(db_session, stale, date(2026, 1, 15))

    assert ensure_next_after_completion(db_session, ACCT, stale.id) is None
    assert db_session.query(TaskOccurrence).count() == 3


@pytest.mark.unit
def test_calendar_mode_is_untouched(db_session):
    tid = _make_template(db_session, anchor="SCHEDULE")
    occ = seed_first_occurrence(db_session, ACCT, tid, date(2026, 1, 15))
    _complete(db_session, occ, date(2026, 1, 15))

    assert ensure_next_after_completion(db_session, ACCT, occ.id) is None


@pytest.mark.unit
def test_generator_does_not_pregenerate_chained_templates(db_session):
    """Ради этого всё и затевалось: вперёд ничего не копится."""
    _make_template(db_session, freq="DAILY", interval=1,
                   start=date.today() - timedelta(days=10))
    db_session.commit()

    created = OccurrenceGenerator(db_session).generate_task_occurrences(ACCT)

    assert created == 0
    assert db_session.query(TaskOccurrence).count() == 0


@pytest.mark.unit
def test_generator_still_fills_calendar_templates(db_session):
    _make_template(db_session, anchor="SCHEDULE", freq="DAILY", interval=1,
                   start=date.today() - timedelta(days=3))
    db_session.commit()

    created = OccurrenceGenerator(db_session).generate_task_occurrences(ACCT)

    assert created > 0


@pytest.mark.unit
def test_until_date_stops_the_chain(db_session):
    tid = _make_template(db_session, until=date(2026, 2, 1))
    occ = seed_first_occurrence(db_session, ACCT, tid, date(2026, 1, 15))
    _complete(db_session, occ, date(2026, 1, 15))

    assert ensure_next_after_completion(db_session, ACCT, occ.id) is None


@pytest.mark.unit
def test_archived_template_stops_the_chain(db_session):
    tid = _make_template(db_session, archived=True)
    occ = seed_first_occurrence(db_session, ACCT, tid, date(2026, 1, 15))
    _complete(db_session, occ, date(2026, 1, 15))

    assert ensure_next_after_completion(db_session, ACCT, occ.id) is None


@pytest.mark.unit
def test_occupied_date_shifts_forward_instead_of_dying(db_session):
    """Дата занята прошлой жизнью шаблона — берём ближайшую свободную."""
    tid = _make_template(db_session)
    occ = seed_first_occurrence(db_session, ACCT, tid, date(2026, 1, 15))
    db_session.add(TaskOccurrence(
        account_id=ACCT, template_id=tid, scheduled_date=date(2026, 2, 15), status="DONE"
    ))
    db_session.flush()
    _complete(db_session, occ, date(2026, 1, 15))

    nxt = ensure_next_after_completion(db_session, ACCT, occ.id)

    assert nxt is not None
    assert nxt.scheduled_date == date(2026, 2, 16)
