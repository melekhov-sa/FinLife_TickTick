"""EventOccurrence domain entity - generates events for event occurrence actions"""
from datetime import datetime
from typing import Dict, Any


class EventOccurrenceEvent:
    @staticmethod
    def create(
        event_id: int,
        occurrence_id: int,
        account_id: int,
        start_date: str,
        start_time: str | None = None,
        end_date: str | None = None,
        end_time: str | None = None,
        source: str = "manual",
    ) -> Dict[str, Any]:
        return {
            "event_id": event_id,
            "occurrence_id": occurrence_id,
            "account_id": account_id,
            "start_date": start_date,
            "start_time": start_time,
            "end_date": end_date,
            "end_time": end_time,
            "source": source,
            "created_at": datetime.utcnow().isoformat(),
        }

    @staticmethod
    def update(occurrence_id: int, **changes) -> Dict[str, Any]:
        payload: Dict[str, Any] = {"occurrence_id": occurrence_id, "updated_at": datetime.utcnow().isoformat()}
        for key in ("start_date", "start_time", "end_date", "end_time"):
            if key in changes:
                payload[key] = changes[key]
        return payload

    @staticmethod
    def cancel(event_id: int, occurrence_id: int) -> Dict[str, Any]:
        return {
            "event_id": event_id,
            "occurrence_id": occurrence_id,
            "is_cancelled": True,
            "cancelled_at": datetime.utcnow().isoformat(),
        }
