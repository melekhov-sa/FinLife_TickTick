"""Habit domain entity - generates events for habit operations"""
from datetime import datetime
from typing import Dict, Any


class Habit:
    @staticmethod
    def create(
        account_id: int,
        habit_id: int,
        title: str,
        rule_id: int,
        active_from: str,
        note: str | None = None,
        active_until: str | None = None,
        category_id: int | None = None,
        level: int = 1,
    ) -> Dict[str, Any]:
        return {
            "habit_id": habit_id,
            "account_id": account_id,
            "title": title,
            "note": note,
            "rule_id": rule_id,
            "category_id": category_id,
            "level": level,
            "active_from": active_from,
            "active_until": active_until,
            "created_at": datetime.utcnow().isoformat()
        }

    @staticmethod
    def update(habit_id: int, **changes) -> Dict[str, Any]:
        payload: Dict[str, Any] = {"habit_id": habit_id, "updated_at": datetime.utcnow().isoformat()}
        for key in ("title", "note", "active_until", "category_id", "is_archived", "level"):
            if key in changes:
                payload[key] = changes[key]
        return payload

    @staticmethod
    def archive(habit_id: int) -> Dict[str, Any]:
        return {"habit_id": habit_id, "is_archived": True, "archived_at": datetime.utcnow().isoformat()}

    @staticmethod
    def unarchive(habit_id: int) -> Dict[str, Any]:
        return {"habit_id": habit_id, "is_archived": False, "unarchived_at": datetime.utcnow().isoformat()}
