"""Task domain entity - generates events for one-off task operations"""
from datetime import datetime
from typing import Dict, Any

from app.domain.task_due_spec import validate_due_spec, validate_reminders


class Task:
    @staticmethod
    def create(
        account_id: int,
        task_id: int,
        title: str,
        note: str | None = None,
        due_kind: str = "NONE",
        due_date: str | None = None,
        due_time: str | None = None,
        due_start_time: str | None = None,
        due_end_time: str | None = None,
        category_id: int | None = None,
        requires_expense: bool = False,
        suggested_expense_category_id: int | None = None,
        suggested_amount: str | None = None,
    ) -> Dict[str, Any]:
        validate_due_spec(due_kind, due_date, due_time, due_start_time, due_end_time)
        return {
            "task_id": task_id,
            "account_id": account_id,
            "title": title,
            "note": note,
            "due_kind": due_kind,
            "due_date": due_date,
            "due_time": due_time,
            "due_start_time": due_start_time,
            "due_end_time": due_end_time,
            "category_id": category_id,
            "requires_expense": requires_expense,
            "suggested_expense_category_id": suggested_expense_category_id,
            "suggested_amount": suggested_amount,
            "created_at": datetime.utcnow().isoformat(),
        }

    @staticmethod
    def update(task_id: int, **changes) -> Dict[str, Any]:
        """Generate task_updated event payload (sparse update, only changed fields)."""
        payload: Dict[str, Any] = {
            "task_id": task_id,
            "updated_at": datetime.utcnow().isoformat(),
        }
        allowed_fields = (
            "title", "note", "due_kind", "due_date", "due_time",
            "due_start_time", "due_end_time", "category_id",
            "requires_expense", "suggested_expense_category_id", "suggested_amount",
        )
        for key in allowed_fields:
            if key in changes:
                payload[key] = changes[key]
        return payload

    @staticmethod
    def set_reminders(task_id: int, reminders: list[dict], due_kind: str) -> Dict[str, Any]:
        """Generate task_reminders_changed event payload."""
        validate_reminders(due_kind, reminders)
        return {
            "task_id": task_id,
            "reminders": reminders,
            "changed_at": datetime.utcnow().isoformat(),
        }

    @staticmethod
    def complete(task_id: int) -> Dict[str, Any]:
        return {"task_id": task_id, "completed_at": datetime.utcnow().isoformat()}

    @staticmethod
    def uncomplete(task_id: int) -> Dict[str, Any]:
        return {"task_id": task_id, "uncompleted_at": datetime.utcnow().isoformat()}

    @staticmethod
    def archive(task_id: int) -> Dict[str, Any]:
        return {"task_id": task_id, "archived_at": datetime.utcnow().isoformat()}
