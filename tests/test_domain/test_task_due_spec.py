"""Tests for DueSpec and ReminderSpec domain validation"""
import pytest
from app.domain.task_due_spec import (
    validate_due_spec, validate_reminders,
    DueSpecValidationError, ReminderSpecValidationError,
)


class TestDueSpecNone:
    def test_none_valid(self):
        validate_due_spec("NONE", None, None, None, None)

    def test_none_rejects_date(self):
        with pytest.raises(DueSpecValidationError):
            validate_due_spec("NONE", "2026-03-15", None, None, None)

    def test_none_rejects_time(self):
        with pytest.raises(DueSpecValidationError):
            validate_due_spec("NONE", None, "14:00", None, None)

    def test_none_rejects_window(self):
        with pytest.raises(DueSpecValidationError):
            validate_due_spec("NONE", None, None, "10:00", "18:00")


class TestDueSpecDate:
    def test_date_valid(self):
        validate_due_spec("DATE", "2026-03-15", None, None, None)

    def test_date_requires_date(self):
        with pytest.raises(DueSpecValidationError):
            validate_due_spec("DATE", None, None, None, None)

    def test_date_rejects_time(self):
        with pytest.raises(DueSpecValidationError):
            validate_due_spec("DATE", "2026-03-15", "14:00", None, None)

    def test_date_rejects_window_times(self):
        with pytest.raises(DueSpecValidationError):
            validate_due_spec("DATE", "2026-03-15", None, "10:00", "18:00")


class TestDueSpecDatetime:
    def test_datetime_valid(self):
        validate_due_spec("DATETIME", "2026-03-15", "14:00", None, None)

    def test_datetime_requires_date(self):
        with pytest.raises(DueSpecValidationError):
            validate_due_spec("DATETIME", None, "14:00", None, None)

    def test_datetime_requires_time(self):
        with pytest.raises(DueSpecValidationError):
            validate_due_spec("DATETIME", "2026-03-15", None, None, None)

    def test_datetime_rejects_window_times(self):
        with pytest.raises(DueSpecValidationError):
            validate_due_spec("DATETIME", "2026-03-15", "14:00", "10:00", "18:00")


class TestDueSpecWindow:
    def test_window_valid(self):
        validate_due_spec("WINDOW", "2026-03-15", None, "10:00", "18:00")

    def test_window_requires_date(self):
        with pytest.raises(DueSpecValidationError):
            validate_due_spec("WINDOW", None, None, "10:00", "18:00")

    def test_window_requires_start_time(self):
        with pytest.raises(DueSpecValidationError):
            validate_due_spec("WINDOW", "2026-03-15", None, None, "18:00")

    def test_window_requires_end_time(self):
        with pytest.raises(DueSpecValidationError):
            validate_due_spec("WINDOW", "2026-03-15", None, "10:00", None)

    def test_window_rejects_due_time(self):
        with pytest.raises(DueSpecValidationError):
            validate_due_spec("WINDOW", "2026-03-15", "14:00", "10:00", "18:00")

    def test_window_start_must_be_before_end(self):
        with pytest.raises(DueSpecValidationError):
            validate_due_spec("WINDOW", "2026-03-15", None, "18:00", "10:00")

    def test_window_equal_times_rejected(self):
        with pytest.raises(DueSpecValidationError):
            validate_due_spec("WINDOW", "2026-03-15", None, "14:00", "14:00")


class TestInvalidDueKind:
    def test_unknown_kind(self):
        with pytest.raises(DueSpecValidationError):
            validate_due_spec("WEEKLY", "2026-03-15", None, None, None)


class TestReminderSpec:
    def test_valid_reminders_datetime(self):
        validate_reminders("DATETIME", [{"offset_minutes": 0}, {"offset_minutes": -15}])

    def test_valid_reminders_window(self):
        validate_reminders("WINDOW", [{"offset_minutes": -60}])

    def test_empty_reminders_any_kind(self):
        validate_reminders("NONE", [])
        validate_reminders("DATE", [])

    def test_rejects_reminders_for_none(self):
        with pytest.raises(ReminderSpecValidationError):
            validate_reminders("NONE", [{"offset_minutes": 0}])

    def test_rejects_reminders_for_date(self):
        with pytest.raises(ReminderSpecValidationError):
            validate_reminders("DATE", [{"offset_minutes": 0}])

    def test_rejects_positive_offset(self):
        with pytest.raises(ReminderSpecValidationError):
            validate_reminders("DATETIME", [{"offset_minutes": 15}])

    def test_rejects_more_than_5(self):
        with pytest.raises(ReminderSpecValidationError):
            validate_reminders("DATETIME", [
                {"offset_minutes": 0}, {"offset_minutes": -5},
                {"offset_minutes": -15}, {"offset_minutes": -30},
                {"offset_minutes": -60}, {"offset_minutes": -120},
            ])

    def test_rejects_duplicates(self):
        with pytest.raises(ReminderSpecValidationError):
            validate_reminders("DATETIME", [
                {"offset_minutes": -15}, {"offset_minutes": -15},
            ])

    def test_rejects_missing_offset(self):
        with pytest.raises(ReminderSpecValidationError):
            validate_reminders("DATETIME", [{}])
