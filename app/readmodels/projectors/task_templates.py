"""TaskTemplatesProjector - builds task_templates read model from events"""
from datetime import date, datetime
from app.readmodels.projectors.base import BaseProjector
from app.infrastructure.db.models import TaskTemplateModel, TaskOccurrence, EventLog


class TaskTemplatesProjector(BaseProjector):
    def __init__(self, db):
        super().__init__(db, projector_name="task_templates")

    def handle_event(self, event: EventLog) -> None:
        if event.event_type == "task_template_created":
            self._handle_created(event)
        elif event.event_type == "task_template_updated":
            self._handle_updated(event)
        elif event.event_type == "task_template_archived":
            self._handle_archived(event)
        elif event.event_type in ("task_occurrence_completed", "task_occurrence_skipped",
                                   "task_occurrence_uncompleted"):
            self._handle_occurrence_status(event)

    def _handle_created(self, event: EventLog) -> None:
        payload = event.payload_json
        self.db.flush()
        existing = self.db.query(TaskTemplateModel).filter(
            TaskTemplateModel.template_id == payload["template_id"]
        ).first()
        if existing:
            return
        tmpl = TaskTemplateModel(
            template_id=payload["template_id"],
            account_id=payload["account_id"],
            title=payload["title"],
            note=payload.get("note"),
            rule_id=payload["rule_id"],
            category_id=payload.get("category_id"),
            active_from=date.fromisoformat(payload["active_from"]),
            active_until=date.fromisoformat(payload["active_until"]) if payload.get("active_until") else None,
            is_archived=False,
        )
        self.db.add(tmpl)
        self.db.flush()

    def _handle_updated(self, event: EventLog) -> None:
        payload = event.payload_json
        tmpl = self.db.query(TaskTemplateModel).filter(
            TaskTemplateModel.template_id == payload["template_id"]
        ).first()
        if not tmpl:
            return
        if "title" in payload:
            tmpl.title = payload["title"]
        if "note" in payload:
            tmpl.note = payload["note"]
        if "active_until" in payload:
            tmpl.active_until = date.fromisoformat(payload["active_until"]) if payload["active_until"] else None
        if "category_id" in payload:
            tmpl.category_id = payload["category_id"]
        if "is_archived" in payload:
            tmpl.is_archived = payload["is_archived"]

    def _handle_archived(self, event: EventLog) -> None:
        payload = event.payload_json
        tmpl = self.db.query(TaskTemplateModel).filter(
            TaskTemplateModel.template_id == payload["template_id"]
        ).first()
        if tmpl:
            tmpl.is_archived = True

    def _handle_occurrence_status(self, event: EventLog) -> None:
        payload = event.payload_json
        occ = self.db.query(TaskOccurrence).filter(
            TaskOccurrence.id == payload["occurrence_id"]
        ).first()
        if occ:
            occ.status = payload["status"]
            if payload["status"] == "DONE" and payload.get("completed_at"):
                occ.completed_at = datetime.fromisoformat(payload["completed_at"])
            elif payload["status"] != "DONE":
                occ.completed_at = None

    def reset(self, account_id: int) -> None:
        self.db.query(TaskOccurrence).filter(TaskOccurrence.account_id == account_id).delete()
        self.db.query(TaskTemplateModel).filter(TaskTemplateModel.account_id == account_id).delete()
        super().reset(account_id)
