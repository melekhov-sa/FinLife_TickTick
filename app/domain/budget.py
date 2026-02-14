"""
Budget domain entity (Event Sourcing)

Generates event payloads for budget plan management.
Fact is computed from TransactionFeed — no domain events needed for fact.
"""
from datetime import datetime
from typing import Dict, Any


class Budget:

    @staticmethod
    def create_month(
        account_id: int,
        budget_month_id: int,
        year: int,
        month: int,
    ) -> Dict[str, Any]:
        """
        Create budget_month_created event payload.
        """
        return {
            "budget_month_id": budget_month_id,
            "account_id": account_id,
            "year": year,
            "month": month,
            "created_at": datetime.utcnow().isoformat(),
        }

    @staticmethod
    def set_plan(
        budget_month_id: int,
        line_id: int,
        category_id: int,
        kind: str,
        plan_amount: str,
        note: str | None = None,
    ) -> Dict[str, Any]:
        """
        Create budget_line_set event payload.

        Uses upsert semantics — setting the same category+kind again updates the amount.
        """
        return {
            "budget_month_id": budget_month_id,
            "line_id": line_id,
            "category_id": category_id,
            "kind": kind,
            "plan_amount": plan_amount,
            "note": note,
            "updated_at": datetime.utcnow().isoformat(),
        }
