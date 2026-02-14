"""EventsProjector - builds calendar events read model from events"""
from datetime import date, time

from app.readmodels.projectors.base import BaseProjector
from app.infrastructure.db.models import (
    CalendarEventModel, EventOccurrenceModel,
    EventReminderModel, EventDefaultReminderModel,
    EventFilterPresetModel, EventLog,
)


class EventsProjector(BaseProjector):
    def __init__(self, db):
        super().__init__(db, projector_name="events")

    def handle_event(self, event: EventLog) -> None:
        handlers = {
            "calendar_event_created": self._handle_event_created,
            "calendar_event_updated": self._handle_event_updated,
            "calendar_event_deactivated": self._handle_event_deactivated,
            "event_occurrence_created": self._handle_occurrence_created,
            "event_occurrence_updated": self._handle_occurrence_updated,
            "event_occurrence_cancelled": self._handle_occurrence_cancelled,
            "event_default_reminder_created": self._handle_default_reminder_created,
            "event_default_reminder_updated": self._handle_default_reminder_updated,
            "event_default_reminder_deleted": self._handle_default_reminder_deleted,
            "event_reminder_created": self._handle_reminder_created,
            "event_reminder_updated": self._handle_reminder_updated,
            "event_reminder_deleted": self._handle_reminder_deleted,
            "event_filter_preset_created": self._handle_preset_created,
            "event_filter_preset_updated": self._handle_preset_updated,
            "event_filter_preset_deleted": self._handle_preset_deleted,
        }
        handler = handlers.get(event.event_type)
        if handler:
            handler(event)

    # --- CalendarEvent handlers ---

    def _handle_event_created(self, event: EventLog) -> None:
        p = event.payload_json
        self.db.flush()
        existing = self.db.query(CalendarEventModel).filter(
            CalendarEventModel.event_id == p["event_id"]
        ).first()
        if existing:
            return
        self.db.add(CalendarEventModel(
            event_id=p["event_id"],
            account_id=p["account_id"],
            title=p["title"],
            description=p.get("description"),
            category_id=p["category_id"],
            importance=p.get("importance", 0),
            repeat_rule_id=p.get("repeat_rule_id"),
            is_active=True,
        ))
        self.db.flush()

    def _handle_event_updated(self, event: EventLog) -> None:
        p = event.payload_json
        ev = self.db.query(CalendarEventModel).filter(
            CalendarEventModel.event_id == p["event_id"]
        ).first()
        if not ev:
            return
        for field in ("title", "description", "category_id", "importance", "is_active", "repeat_rule_id"):
            if field in p:
                setattr(ev, field, p[field])

    def _handle_event_deactivated(self, event: EventLog) -> None:
        p = event.payload_json
        ev = self.db.query(CalendarEventModel).filter(
            CalendarEventModel.event_id == p["event_id"]
        ).first()
        if ev:
            ev.is_active = False

    # --- Occurrence handlers ---

    def _handle_occurrence_created(self, event: EventLog) -> None:
        p = event.payload_json
        self.db.flush()
        existing = self.db.query(EventOccurrenceModel).filter(
            EventOccurrenceModel.id == p["occurrence_id"]
        ).first()
        if existing:
            return
        self.db.add(EventOccurrenceModel(
            id=p["occurrence_id"],
            account_id=p["account_id"],
            event_id=p["event_id"],
            start_date=date.fromisoformat(p["start_date"]),
            start_time=time.fromisoformat(p["start_time"]) if p.get("start_time") else None,
            end_date=date.fromisoformat(p["end_date"]) if p.get("end_date") else None,
            end_time=time.fromisoformat(p["end_time"]) if p.get("end_time") else None,
            is_cancelled=False,
            source=p.get("source", "manual"),
        ))
        self.db.flush()

    def _handle_occurrence_updated(self, event: EventLog) -> None:
        p = event.payload_json
        occ = self.db.query(EventOccurrenceModel).filter(
            EventOccurrenceModel.id == p["occurrence_id"]
        ).first()
        if not occ:
            return
        if "start_date" in p:
            occ.start_date = date.fromisoformat(p["start_date"])
        if "start_time" in p:
            occ.start_time = time.fromisoformat(p["start_time"]) if p["start_time"] else None
        if "end_date" in p:
            occ.end_date = date.fromisoformat(p["end_date"]) if p["end_date"] else None
        if "end_time" in p:
            occ.end_time = time.fromisoformat(p["end_time"]) if p["end_time"] else None

    def _handle_occurrence_cancelled(self, event: EventLog) -> None:
        p = event.payload_json
        occ = self.db.query(EventOccurrenceModel).filter(
            EventOccurrenceModel.id == p["occurrence_id"]
        ).first()
        if occ:
            occ.is_cancelled = True

    # --- Default Reminder handlers ---

    def _handle_default_reminder_created(self, event: EventLog) -> None:
        p = event.payload_json
        self.db.add(EventDefaultReminderModel(
            event_id=p["event_id"],
            channel=p["channel"],
            mode=p["mode"],
            offset_minutes=p.get("offset_minutes"),
            fixed_time=time.fromisoformat(p["fixed_time"]) if p.get("fixed_time") else None,
            is_enabled=p.get("is_enabled", True),
        ))
        self.db.flush()

    def _handle_default_reminder_updated(self, event: EventLog) -> None:
        p = event.payload_json
        rem = self.db.query(EventDefaultReminderModel).filter(
            EventDefaultReminderModel.id == p["reminder_id"]
        ).first()
        if not rem:
            return
        for field in ("channel", "mode", "offset_minutes", "is_enabled"):
            if field in p:
                setattr(rem, field, p[field])
        if "fixed_time" in p:
            rem.fixed_time = time.fromisoformat(p["fixed_time"]) if p["fixed_time"] else None

    def _handle_default_reminder_deleted(self, event: EventLog) -> None:
        p = event.payload_json
        self.db.query(EventDefaultReminderModel).filter(
            EventDefaultReminderModel.id == p["reminder_id"]
        ).delete()

    # --- Occurrence Reminder handlers ---

    def _handle_reminder_created(self, event: EventLog) -> None:
        p = event.payload_json
        self.db.add(EventReminderModel(
            occurrence_id=p["occurrence_id"],
            channel=p["channel"],
            mode=p["mode"],
            offset_minutes=p.get("offset_minutes"),
            fixed_time=time.fromisoformat(p["fixed_time"]) if p.get("fixed_time") else None,
            is_enabled=p.get("is_enabled", True),
        ))
        self.db.flush()

    def _handle_reminder_updated(self, event: EventLog) -> None:
        p = event.payload_json
        rem = self.db.query(EventReminderModel).filter(
            EventReminderModel.id == p["reminder_id"]
        ).first()
        if not rem:
            return
        for field in ("channel", "mode", "offset_minutes", "is_enabled"):
            if field in p:
                setattr(rem, field, p[field])
        if "fixed_time" in p:
            rem.fixed_time = time.fromisoformat(p["fixed_time"]) if p["fixed_time"] else None

    def _handle_reminder_deleted(self, event: EventLog) -> None:
        p = event.payload_json
        self.db.query(EventReminderModel).filter(
            EventReminderModel.id == p["reminder_id"]
        ).delete()

    # --- Filter Preset handlers ---

    def _handle_preset_created(self, event: EventLog) -> None:
        p = event.payload_json
        self.db.add(EventFilterPresetModel(
            account_id=p["account_id"],
            name=p["name"],
            category_ids_json=p.get("category_ids_json", "[]"),
            is_selected=p.get("is_selected", False),
        ))
        self.db.flush()

    def _handle_preset_updated(self, event: EventLog) -> None:
        p = event.payload_json
        preset = self.db.query(EventFilterPresetModel).filter(
            EventFilterPresetModel.id == p["preset_id"]
        ).first()
        if not preset:
            return
        for field in ("name", "category_ids_json", "is_selected"):
            if field in p:
                setattr(preset, field, p[field])

    def _handle_preset_deleted(self, event: EventLog) -> None:
        p = event.payload_json
        self.db.query(EventFilterPresetModel).filter(
            EventFilterPresetModel.id == p["preset_id"]
        ).delete()
