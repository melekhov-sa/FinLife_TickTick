"""
Tests for OccurrenceGenerator race-condition / IntegrityError handling.
"""
import pytest
from datetime import date
from unittest.mock import MagicMock, patch
from sqlalchemy.exc import IntegrityError

from app.application.occurrence_generator import OccurrenceGenerator


class TestOccurrenceGeneratorIntegrityError:
    """Ensure the generator silently skips rows when a UNIQUE constraint fires."""

    def test_habit_occurrences_skips_on_integrity_error(self, db_session):
        """
        If begin_nested + flush raises IntegrityError (simulated race), the generator
        must not re-raise and must return 0 new rows.
        """
        from app.infrastructure.db.models import (
            HabitModel, RecurrenceRuleModel
        )

        rule = RecurrenceRuleModel(
            rule_id=1,
            account_id=1,
            freq="daily",
            interval=1,
            start_date=date(2026, 4, 1),
            until_date=None,
            count=None,
            by_weekday=None,
            by_monthday=None,
            by_month=None,
        )
        db_session.add(rule)

        habit = HabitModel(
            habit_id=1,
            account_id=1,
            rule_id=1,
            title="Test habit",
            active_from=date(2026, 4, 1),
            active_until=None,
            is_archived=False,
        )
        db_session.add(habit)
        db_session.flush()

        gen = OccurrenceGenerator(db_session)

        with patch.object(db_session, "begin_nested") as mock_nested:
            cm = MagicMock()
            cm.__enter__ = MagicMock(return_value=None)
            cm.__exit__ = MagicMock(side_effect=IntegrityError(
                "UNIQUE constraint failed", params=None, orig=Exception()
            ))
            mock_nested.return_value = cm

            result = gen.generate_habit_occurrences(account_id=1)

        # All rows skipped due to IntegrityError → count = 0
        assert result == 0

    def test_operation_occurrences_skips_on_integrity_error(self, db_session):
        """Same contract for generate_operation_occurrences."""
        from app.infrastructure.db.models import (
            OperationTemplateModel, RecurrenceRuleModel
        )
        from decimal import Decimal

        rule = RecurrenceRuleModel(
            rule_id=2,
            account_id=1,
            freq="daily",
            interval=1,
            start_date=date(2026, 4, 1),
            until_date=None,
            count=None,
            by_weekday=None,
            by_monthday=None,
            by_month=None,
        )
        db_session.add(rule)

        tmpl = OperationTemplateModel(
            template_id=1,
            account_id=1,
            title="Rent",
            rule_id=2,
            active_from=date(2026, 4, 1),
            active_until=None,
            is_archived=False,
            kind="EXPENSE",
            amount=Decimal("1000.00"),
        )
        db_session.add(tmpl)
        db_session.flush()

        gen = OccurrenceGenerator(db_session)

        with patch.object(db_session, "begin_nested") as mock_nested:
            cm = MagicMock()
            cm.__enter__ = MagicMock(return_value=None)
            cm.__exit__ = MagicMock(side_effect=IntegrityError(
                "UNIQUE constraint failed", params=None, orig=Exception()
            ))
            mock_nested.return_value = cm

            result = gen.generate_operation_occurrences(account_id=1)

        assert result == 0
