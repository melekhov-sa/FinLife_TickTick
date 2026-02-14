"""Task domain entity - generates events for one-off task operations"""
from datetime import datetime
from typing import Dict, Any


class Task:
    @staticmethod
    def create(
        account_id: int,
        task_id: int,
        title: str,
        note: str | None = None,
        due_date: str | None = None,
        category_id: int | None = None,
    ) -> Dict[str, Any]:
        return {
            "task_id": task_id,
            "account_id": account_id,
            "title": title,
            "note": note,
            "due_date": due_date,
            "category_id": category_id,
            "created_at": datetime.utcnow().isoformat()
        }

    @staticmethod
    def complete(task_id: int) -> Dict[str, Any]:
        return {"task_id": task_id, "completed_at": datetime.utcnow().isoformat()}

    @staticmethod
    def archive(task_id: int) -> Dict[str, Any]:
        return {"task_id": task_id, "archived_at": datetime.utcnow().isoformat()}
