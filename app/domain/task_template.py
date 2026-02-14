"""TaskTemplate domain entity - generates events for recurring task template operations"""
from datetime import datetime
from typing import Dict, Any


class TaskTemplate:
    @staticmethod
    def create(
        account_id: int,
        template_id: int,
        title: str,
        rule_id: int,
        active_from: str,
        note: str | None = None,
        active_until: str | None = None,
        category_id: int | None = None,
    ) -> Dict[str, Any]:
        return {
            "template_id": template_id,
            "account_id": account_id,
            "title": title,
            "note": note,
            "rule_id": rule_id,
            "category_id": category_id,
            "active_from": active_from,
            "active_until": active_until,
            "created_at": datetime.utcnow().isoformat()
        }

    @staticmethod
    def update(template_id: int, **changes) -> Dict[str, Any]:
        payload: Dict[str, Any] = {"template_id": template_id, "updated_at": datetime.utcnow().isoformat()}
        for key in ("title", "note", "active_until", "category_id", "is_archived"):
            if key in changes:
                payload[key] = changes[key]
        return payload

    @staticmethod
    def archive(template_id: int) -> Dict[str, Any]:
        return {"template_id": template_id, "is_archived": True, "archived_at": datetime.utcnow().isoformat()}
