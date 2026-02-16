"""OperationTemplatesProjector - builds operation_templates read model from events"""
from datetime import date, datetime
from decimal import Decimal
from app.readmodels.projectors.base import BaseProjector
from app.infrastructure.db.models import OperationTemplateModel, OperationOccurrence, EventLog


class OperationTemplatesProjector(BaseProjector):
    def __init__(self, db):
        super().__init__(db, projector_name="operation_templates")

    def handle_event(self, event: EventLog) -> None:
        if event.event_type == "operation_template_created":
            self._handle_created(event)
        elif event.event_type == "operation_template_updated":
            self._handle_updated(event)
        elif event.event_type == "operation_template_archived":
            self._handle_archived(event)
        elif event.event_type == "operation_template_unarchived":
            self._handle_unarchived(event)
        elif event.event_type == "operation_template_closed":
            self._handle_closed(event)
        elif event.event_type in ("operation_occurrence_confirmed", "operation_occurrence_skipped"):
            self._handle_occurrence_status(event)

    def _handle_created(self, event: EventLog) -> None:
        payload = event.payload_json
        self.db.flush()
        existing = self.db.query(OperationTemplateModel).filter(
            OperationTemplateModel.template_id == payload["template_id"]
        ).first()
        if existing:
            return
        tmpl = OperationTemplateModel(
            template_id=payload["template_id"],
            account_id=payload["account_id"],
            title=payload["title"],
            rule_id=payload["rule_id"],
            active_from=date.fromisoformat(payload["active_from"]),
            active_until=date.fromisoformat(payload["active_until"]) if payload.get("active_until") else None,
            is_archived=False,
            kind=payload["kind"],
            amount=Decimal(str(payload["amount"])),
            note=payload.get("note"),
            wallet_id=payload.get("wallet_id"),
            destination_wallet_id=payload.get("destination_wallet_id"),
            category_id=payload.get("category_id"),
            work_category_id=payload.get("work_category_id"),
        )
        self.db.add(tmpl)
        self.db.flush()

    def _handle_updated(self, event: EventLog) -> None:
        payload = event.payload_json
        tmpl = self.db.query(OperationTemplateModel).filter(
            OperationTemplateModel.template_id == payload["template_id"]
        ).first()
        if not tmpl:
            return
        for key in ("title", "note", "kind", "wallet_id", "destination_wallet_id",
                     "category_id", "work_category_id", "is_archived"):
            if key in payload:
                setattr(tmpl, key, payload[key])
        if "amount" in payload:
            tmpl.amount = Decimal(str(payload["amount"]))
        if "active_until" in payload:
            tmpl.active_until = date.fromisoformat(payload["active_until"]) if payload["active_until"] else None

    def _handle_archived(self, event: EventLog) -> None:
        payload = event.payload_json
        tmpl = self.db.query(OperationTemplateModel).filter(
            OperationTemplateModel.template_id == payload["template_id"]
        ).first()
        if tmpl:
            tmpl.is_archived = True

    def _handle_unarchived(self, event: EventLog) -> None:
        payload = event.payload_json
        tmpl = self.db.query(OperationTemplateModel).filter(
            OperationTemplateModel.template_id == payload["template_id"]
        ).first()
        if tmpl:
            tmpl.is_archived = False

    def _handle_closed(self, event: EventLog) -> None:
        payload = event.payload_json
        tmpl = self.db.query(OperationTemplateModel).filter(
            OperationTemplateModel.template_id == payload["template_id"]
        ).first()
        if tmpl:
            tmpl.active_until = date.fromisoformat(payload["active_until"]) if payload.get("active_until") else None

    def _handle_occurrence_status(self, event: EventLog) -> None:
        payload = event.payload_json
        occ = self.db.query(OperationOccurrence).filter(
            OperationOccurrence.id == payload["occurrence_id"]
        ).first()
        if occ:
            occ.status = payload["status"]
            if payload["status"] == "DONE":
                occ.completed_at = datetime.fromisoformat(payload["completed_at"]) if payload.get("completed_at") else datetime.utcnow()
                occ.transaction_id = payload.get("transaction_id")
            elif payload["status"] == "SKIPPED":
                occ.completed_at = None
                occ.transaction_id = None

    def reset(self, account_id: int) -> None:
        self.db.query(OperationOccurrence).filter(OperationOccurrence.account_id == account_id).delete()
        self.db.query(OperationTemplateModel).filter(OperationTemplateModel.account_id == account_id).delete()
        super().reset(account_id)
