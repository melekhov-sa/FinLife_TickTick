"""WorkCategory domain entity - generates events for work category operations"""
from datetime import datetime
from typing import Dict, Any


class WorkCategory:
    @staticmethod
    def create(account_id: int, category_id: int, title: str, emoji: str | None = None) -> Dict[str, Any]:
        return {
            "category_id": category_id,
            "account_id": account_id,
            "title": title,
            "emoji": emoji,
            "created_at": datetime.utcnow().isoformat()
        }

    @staticmethod
    def update(category_id: int, **changes) -> Dict[str, Any]:
        payload: Dict[str, Any] = {"category_id": category_id, "updated_at": datetime.utcnow().isoformat()}
        for key in ("title", "emoji"):
            if key in changes:
                payload[key] = changes[key]
        return payload

    @staticmethod
    def archive(category_id: int) -> Dict[str, Any]:
        return {"category_id": category_id, "archived_at": datetime.utcnow().isoformat()}

    @staticmethod
    def unarchive(category_id: int) -> Dict[str, Any]:
        return {"category_id": category_id, "unarchived_at": datetime.utcnow().isoformat()}
