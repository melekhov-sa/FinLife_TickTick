"""
Tests for SkipTaskOccurrenceUseCase and the v2 skip endpoint logic.
"""
import pytest
from datetime import date, timedelta

from app.application.task_templates import (
    CreateTaskTemplateUseCase,
    SkipTaskOccurrenceUseCase,
    TaskTemplateValidationError,
)
from app.infrastructure.db.models import TaskOccurrence, RecurrenceRuleModel, TaskTemplateModel

ACCT = 1
OTHER_ACCT = 2
TODAY = date.today()


def _make_template(db, account_id=ACCT):
    """Create a minimal recurring task template and return (template_id, rule_id)."""
    rule = RecurrenceRuleModel(
        account_id=account_id,
        freq="DAILY",
        interval=1,
        start_date=TODAY - timedelta(days=3),
    )
    db.add(rule)
    db.flush()

    tmpl = TaskTemplateModel(
        account_id=account_id,
        title="Ежедневная задача",
        rule_id=rule.rule_id,
        active_from=TODAY - timedelta(days=3),
        is_archived=False,
    )
    db.add(tmpl)
    db.flush()
    return tmpl.template_id, rule.rule_id


def _make_occurrence(db, template_id, scheduled_date=None, account_id=ACCT):
    """Create an ACTIVE occurrence and return it."""
    occ = TaskOccurrence(
        account_id=account_id,
        template_id=template_id,
        scheduled_date=scheduled_date or TODAY,
        status="ACTIVE",
    )
    db.add(occ)
    db.flush()
    return occ


class TestSkipTaskOccurrenceUseCase:
    def test_happy_path_skips_occurrence(self, db_session):
        """Скип вхождения ставит статус SKIPPED."""
        template_id, _ = _make_template(db_session)
        occ = _make_occurrence(db_session, template_id)
        occ_id = occ.id

        SkipTaskOccurrenceUseCase(db_session).execute(
            occurrence_id=occ_id,
            account_id=ACCT,
            actor_user_id=ACCT,
        )

        refreshed = db_session.query(TaskOccurrence).filter(TaskOccurrence.id == occ_id).first()
        assert refreshed is not None
        assert refreshed.status == "SKIPPED"

    def test_not_found_raises_error(self, db_session):
        """Несуществующее вхождение -> TaskTemplateValidationError."""
        with pytest.raises(TaskTemplateValidationError):
            SkipTaskOccurrenceUseCase(db_session).execute(
                occurrence_id=999999,
                account_id=ACCT,
                actor_user_id=ACCT,
            )

    def test_foreign_occurrence_not_accessible(self, db_session):
        """Вхождение другого аккаунта недоступно -> TaskTemplateValidationError."""
        template_id, _ = _make_template(db_session, account_id=OTHER_ACCT)
        occ = _make_occurrence(db_session, template_id, account_id=OTHER_ACCT)
        occ_id = occ.id

        with pytest.raises(TaskTemplateValidationError):
            SkipTaskOccurrenceUseCase(db_session).execute(
                occurrence_id=occ_id,
                account_id=ACCT,  # wrong account
                actor_user_id=ACCT,
            )
