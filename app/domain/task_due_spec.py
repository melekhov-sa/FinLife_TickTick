"""
Task DueSpec and ReminderSpec domain validation.

DueSpec modes:
  NONE     - no deadline
  DATE     - date-only deadline
  DATETIME - date + time deadline
  WINDOW   - date + start_time..end_time window

ReminderSpec rules:
  - Only allowed when due_kind in (DATETIME, WINDOW)
  - offset_minutes must be <= 0 (at or before due time)
  - Max 5 reminders per task
"""
from typing import Any

VALID_DUE_KINDS = {"NONE", "DATE", "DATETIME", "WINDOW"}
MAX_REMINDERS_PER_TASK = 5


class DueSpecValidationError(ValueError):
    pass


class ReminderSpecValidationError(ValueError):
    pass


def validate_due_spec(
    due_kind: str,
    due_date: str | None,
    due_time: str | None,
    due_start_time: str | None,
    due_end_time: str | None,
) -> None:
    """Validate DueSpec invariants. Raises DueSpecValidationError on failure."""
    if due_kind not in VALID_DUE_KINDS:
        raise DueSpecValidationError(f"Неверный тип срока: {due_kind}")

    if due_kind == "NONE":
        if any([due_date, due_time, due_start_time, due_end_time]):
            raise DueSpecValidationError("Для типа NONE все поля срока должны быть пустыми")

    elif due_kind == "DATE":
        if not due_date:
            raise DueSpecValidationError("Для типа DATE обязательна дата")
        if any([due_time, due_start_time, due_end_time]):
            raise DueSpecValidationError("Для типа DATE время должно быть пустым")

    elif due_kind == "DATETIME":
        if not due_date:
            raise DueSpecValidationError("Для типа DATETIME обязательна дата")
        if not due_time:
            raise DueSpecValidationError("Для типа DATETIME обязательно время")
        if any([due_start_time, due_end_time]):
            raise DueSpecValidationError("Для типа DATETIME окно времени должно быть пустым")

    elif due_kind == "WINDOW":
        if not due_date:
            raise DueSpecValidationError("Для типа WINDOW обязательна дата")
        if not due_start_time:
            raise DueSpecValidationError("Для типа WINDOW обязательно время начала")
        if not due_end_time:
            raise DueSpecValidationError("Для типа WINDOW обязательно время конца")
        if due_time:
            raise DueSpecValidationError("Для типа WINDOW поле due_time должно быть пустым")
        if due_start_time >= due_end_time:
            raise DueSpecValidationError("Время начала окна должно быть раньше времени конца")


def validate_reminders(
    due_kind: str,
    reminders: list[dict[str, Any]],
) -> None:
    """Validate ReminderSpec invariants."""
    if reminders and due_kind not in ("DATETIME", "WINDOW"):
        raise ReminderSpecValidationError(
            "Напоминания доступны только для типов DATETIME и WINDOW"
        )

    if len(reminders) > MAX_REMINDERS_PER_TASK:
        raise ReminderSpecValidationError(
            f"Максимум {MAX_REMINDERS_PER_TASK} напоминаний на задачу"
        )

    seen_offsets = set()
    for rem in reminders:
        offset = rem.get("offset_minutes")
        if offset is None:
            raise ReminderSpecValidationError("offset_minutes обязателен")
        if not isinstance(offset, int):
            raise ReminderSpecValidationError("offset_minutes должен быть целым числом")
        if offset > 0:
            raise ReminderSpecValidationError(
                "offset_minutes должен быть <= 0 (в момент срока или до него)"
            )
        if offset in seen_offsets:
            raise ReminderSpecValidationError(
                f"Дублирующий offset_minutes: {offset}"
            )
        seen_offsets.add(offset)
