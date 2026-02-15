"""CalendarEvent domain entity - generates events for calendar event operations"""
from datetime import datetime
from typing import Dict, Any


class CalendarEvent:
    @staticmethod
    def create(
        account_id: int,
        event_id: int,
        title: str,
        category_id: int,
        description: str | None = None,
        repeat_rule_id: int | None = None,
    ) -> Dict[str, Any]:
        return {
            "event_id": event_id,
            "account_id": account_id,
            "title": title,
            "description": description,
            "category_id": category_id,
            "repeat_rule_id": repeat_rule_id,
            "created_at": datetime.utcnow().isoformat(),
        }

    @staticmethod
    def update(event_id: int, **changes) -> Dict[str, Any]:
        payload: Dict[str, Any] = {"event_id": event_id, "updated_at": datetime.utcnow().isoformat()}
        for key in ("title", "description", "category_id", "is_active", "repeat_rule_id"):
            if key in changes:
                payload[key] = changes[key]
        return payload

    @staticmethod
    def deactivate(event_id: int) -> Dict[str, Any]:
        return {
            "event_id": event_id,
            "is_active": False,
            "deactivated_at": datetime.utcnow().isoformat(),
        }

    @staticmethod
    def reactivate(event_id: int) -> Dict[str, Any]:
        return {
            "event_id": event_id,
            "is_active": True,
            "reactivated_at": datetime.utcnow().isoformat(),
        }
