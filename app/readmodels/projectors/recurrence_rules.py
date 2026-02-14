"""RecurrenceRulesProjector - builds recurrence_rules read model from events"""
from datetime import date, datetime
from app.readmodels.projectors.base import BaseProjector
from app.infrastructure.db.models import RecurrenceRuleModel, EventLog


class RecurrenceRulesProjector(BaseProjector):
    def __init__(self, db):
        super().__init__(db, projector_name="recurrence_rules")

    def handle_event(self, event: EventLog) -> None:
        if event.event_type == "recurrence_rule_created":
            self._handle_created(event)
        elif event.event_type == "recurrence_rule_updated":
            self._handle_updated(event)

    def _handle_created(self, event: EventLog) -> None:
        payload = event.payload_json
        self.db.flush()
        existing = self.db.query(RecurrenceRuleModel).filter(
            RecurrenceRuleModel.rule_id == payload["rule_id"]
        ).first()
        if existing:
            return
        rule = RecurrenceRuleModel(
            rule_id=payload["rule_id"],
            account_id=payload["account_id"],
            freq=payload["freq"],
            interval=payload.get("interval", 1),
            start_date=date.fromisoformat(payload["start_date"]),
            until_date=date.fromisoformat(payload["until_date"]) if payload.get("until_date") else None,
            count=payload.get("count"),
            by_weekday=payload.get("by_weekday"),
            by_monthday=payload.get("by_monthday"),
            monthday_clip_to_last_day=payload.get("monthday_clip_to_last_day", True),
            by_month=payload.get("by_month"),
            by_monthday_for_year=payload.get("by_monthday_for_year"),
            dates_json=payload.get("dates_json"),
        )
        self.db.add(rule)
        self.db.flush()

    def _handle_updated(self, event: EventLog) -> None:
        payload = event.payload_json
        rule = self.db.query(RecurrenceRuleModel).filter(
            RecurrenceRuleModel.rule_id == payload["rule_id"]
        ).first()
        if not rule:
            return
        for key in ("freq", "interval", "count", "by_weekday", "by_monthday",
                     "monthday_clip_to_last_day", "by_month", "by_monthday_for_year", "dates_json"):
            if key in payload:
                setattr(rule, key, payload[key])
        if "start_date" in payload:
            rule.start_date = date.fromisoformat(payload["start_date"])
        if "until_date" in payload:
            rule.until_date = date.fromisoformat(payload["until_date"]) if payload["until_date"] else None

    def reset(self, account_id: int) -> None:
        self.db.query(RecurrenceRuleModel).filter(RecurrenceRuleModel.account_id == account_id).delete()
        super().reset(account_id)
