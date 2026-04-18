"""
Tests for weekly digest aggregator.
"""
import pytest
from datetime import date, datetime, timezone

from app.infrastructure.db.models import TaskModel, DigestModel
from app.application.digests import (
    iso_week_key, parse_week_key, build_weekly_payload, save_digest,
)

ACCT = 1


def _task(db, *, due_date=None, status='ACTIVE', completed_at=None, account_id=ACCT):
    tid = db.query(TaskModel).count() + 1
    t = TaskModel(
        task_id=tid, account_id=account_id,
        title='task-{}'.format(tid), status=status,
        board_status='backlog', due_date=due_date, completed_at=completed_at,
    )
    db.add(t); db.flush()
    return t


def test_iso_week_key_format():
    assert iso_week_key(date(2026, 4, 18)) == '2026-W16'


def test_parse_week_key_round_trip():
    monday, sunday = parse_week_key('2026-W16')
    assert monday == date(2026, 4, 13)
    assert sunday == date(2026, 4, 19)


def test_build_weekly_payload_has_all_keys(db_session):
    payload = build_weekly_payload(db_session, ACCT, date(2026, 4, 13))
    for key in ['period', 'tasks', 'habits', 'finance', 'efficiency', 'xp', 'highlights']:
        assert key in payload, f'Missing key: {key}'
    assert payload['period']['key'] == '2026-W16'
    assert payload['period']['from'] == '2026-04-13'
    assert payload['period']['to'] == '2026-04-19'


def test_build_weekly_payload_completed_tasks_counted(db_session):
    ts = datetime(2026, 4, 15, 10, 0, tzinfo=timezone.utc)
    _task(db_session, status='DONE', completed_at=ts)
    _task(db_session, status='DONE', completed_at=ts)
    _task(db_session, status='ACTIVE')
    payload = build_weekly_payload(db_session, ACCT, date(2026, 4, 13))
    assert payload['tasks']['completed'] == 2


def test_build_weekly_payload_overdue_counted(db_session):
    _task(db_session, status='ACTIVE', due_date=date(2026, 4, 10))
    payload = build_weekly_payload(db_session, ACCT, date(2026, 4, 13))
    assert payload['tasks']['overdue_open'] >= 1


def test_save_digest_creates_record(db_session):
    payload = {'period': {'key': '2026-W16'}, 'tasks': {'completed': 5}}
    digest_id = save_digest(db_session, ACCT, 'week', '2026-W16', payload)
    assert digest_id > 0
    d = db_session.query(DigestModel).filter_by(id=digest_id).first()
    assert d is not None
    assert d.period_key == '2026-W16'
    assert d.payload['tasks']['completed'] == 5
    assert d.ai_comment is None


def test_save_digest_upsert_updates(db_session):
    save_digest(db_session, ACCT, 'week', '2026-W15', {'tasks': {'completed': 3}})
    save_digest(db_session, ACCT, 'week', '2026-W15', {'tasks': {'completed': 7}})
    count = db_session.query(DigestModel).filter_by(account_id=ACCT, period_key='2026-W15').count()
    assert count == 1
    d = db_session.query(DigestModel).filter_by(account_id=ACCT, period_key='2026-W15').first()
    assert d.payload['tasks']['completed'] == 7


def test_ai_comment_returns_none_without_key(monkeypatch):
    from app.infrastructure.ai import generate_digest_comment
    import app.config as cfg_module
    cfg_module.get_settings.cache_clear()
    monkeypatch.setenv('OPENAI_API_KEY', '')
    result = generate_digest_comment({'tasks': {'completed': 1}})
    assert result is None
    cfg_module.get_settings.cache_clear()


def test_weekly_digest_notification_not_on_weekday(db_session):
    from app.application.notification_engine import _run_weekly_digest
    from app.infrastructure.db.models import NotificationModel
    monday = date(2026, 4, 13)
    _run_weekly_digest(db_session, ACCT, monday, ['inapp'])
    count = db_session.query(NotificationModel).filter_by(rule_code='WEEKLY_DIGEST_READY').count()
    assert count == 0


def test_weekly_digest_notification_on_sunday_with_digest(db_session):
    from app.application.notification_engine import _run_weekly_digest
    from app.infrastructure.db.models import NotificationModel, NotificationRule
    sunday = date(2026, 4, 19)
    week_key = iso_week_key(date(2026, 4, 13))
    rule = NotificationRule(code='WEEKLY_DIGEST_READY', title='Digest', enabled=True, params_json={})
    db_session.add(rule); db_session.flush()
    digest = DigestModel(
        account_id=ACCT, period_type='week', period_key=week_key,
        payload={'tasks': {'completed': 10}, 'habits': {'completion_rate': 0.8}, 'xp': {'gained': 120}},
    )
    db_session.add(digest); db_session.flush()
    _run_weekly_digest(db_session, ACCT, sunday, ['inapp'])
    notif = db_session.query(NotificationModel).filter_by(rule_code='WEEKLY_DIGEST_READY', user_id=ACCT).first()
    assert notif is not None
    assert '2026-W16' in notif.body_inapp
