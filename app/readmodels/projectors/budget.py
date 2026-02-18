"""
Budget Projector — builds BudgetMonth + BudgetLine read models from events.
"""
from datetime import datetime
from decimal import Decimal
from sqlalchemy.orm import Session

from app.infrastructure.db.models import EventLog, BudgetMonth, BudgetLine
from app.readmodels.projectors.base import BaseProjector


class BudgetProjector(BaseProjector):

    def __init__(self, db: Session):
        super().__init__(db, projector_name="budget")

    def handle_event(self, event: EventLog) -> None:
        if event.event_type == "budget_month_created":
            self._handle_month_created(event)
        elif event.event_type == "budget_line_set":
            self._handle_line_set(event)

    def _handle_month_created(self, event: EventLog) -> None:
        p = event.payload_json
        budget_month_id = p["budget_month_id"]

        existing = self.db.query(BudgetMonth).filter(
            BudgetMonth.id == budget_month_id
        ).first()
        if existing:
            return

        self.db.add(BudgetMonth(
            id=budget_month_id,
            account_id=p["account_id"],
            budget_variant_id=p.get("budget_variant_id"),
            year=p["year"],
            month=p["month"],
            is_locked=False,
            created_at=datetime.fromisoformat(p["created_at"]),
        ))
        self.db.flush()

    def _handle_line_set(self, event: EventLog) -> None:
        p = event.payload_json
        budget_month_id = p["budget_month_id"]
        category_id = p["category_id"]
        kind = p["kind"]

        existing = self.db.query(BudgetLine).filter(
            BudgetLine.budget_month_id == budget_month_id,
            BudgetLine.category_id == category_id,
            BudgetLine.kind == kind,
        ).first()

        if existing:
            existing.plan_amount = Decimal(p["plan_amount"])
            existing.note = p.get("note")
        else:
            # Determine account_id from parent BudgetMonth
            bm = self.db.query(BudgetMonth).filter(BudgetMonth.id == budget_month_id).first()
            account_id = bm.account_id if bm else 0

            self.db.add(BudgetLine(
                id=p["line_id"],
                budget_month_id=budget_month_id,
                account_id=account_id,
                category_id=category_id,
                kind=kind,
                plan_amount=Decimal(p["plan_amount"]),
                note=p.get("note"),
            ))
        self.db.flush()
