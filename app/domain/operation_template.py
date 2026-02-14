"""OperationTemplate domain entity - generates events for planned operation templates"""
from datetime import datetime
from typing import Dict, Any


class OperationTemplate:
    @staticmethod
    def create(
        account_id: int,
        template_id: int,
        title: str,
        rule_id: int,
        active_from: str,
        kind: str,
        amount: str,
        wallet_id: int | None = None,
        category_id: int | None = None,
        from_wallet_id: int | None = None,
        to_wallet_id: int | None = None,
        note: str | None = None,
        active_until: str | None = None,
        work_category_id: int | None = None,
    ) -> Dict[str, Any]:
        return {
            "template_id": template_id,
            "account_id": account_id,
            "title": title,
            "rule_id": rule_id,
            "active_from": active_from,
            "active_until": active_until,
            "kind": kind,
            "amount": amount,
            "note": note,
            "wallet_id": wallet_id,
            "category_id": category_id,
            "from_wallet_id": from_wallet_id,
            "to_wallet_id": to_wallet_id,
            "work_category_id": work_category_id,
            "created_at": datetime.utcnow().isoformat()
        }

    @staticmethod
    def update(template_id: int, **changes) -> Dict[str, Any]:
        payload: Dict[str, Any] = {"template_id": template_id, "updated_at": datetime.utcnow().isoformat()}
        allowed = ("title", "active_until", "kind", "amount", "note",
                    "wallet_id", "category_id", "from_wallet_id", "to_wallet_id",
                    "work_category_id", "is_archived")
        for key in allowed:
            if key in changes:
                payload[key] = changes[key]
        return payload

    @staticmethod
    def archive(template_id: int) -> Dict[str, Any]:
        return {"template_id": template_id, "is_archived": True, "archived_at": datetime.utcnow().isoformat()}
