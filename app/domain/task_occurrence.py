"""TaskOccurrence domain entity - generates events for task occurrence actions"""
from datetime import datetime
from typing import Dict, Any


class TaskOccurrenceEvent:
    @staticmethod
    def complete(template_id: int, occurrence_id: int, scheduled_date: str) -> Dict[str, Any]:
        return {
            "template_id": template_id,
            "occurrence_id": occurrence_id,
            "scheduled_date": scheduled_date,
            "status": "DONE",
            "completed_at": datetime.utcnow().isoformat()
        }

    @staticmethod
    def uncomplete(template_id: int, occurrence_id: int, scheduled_date: str) -> Dict[str, Any]:
        return {
            "template_id": template_id,
            "occurrence_id": occurrence_id,
            "scheduled_date": scheduled_date,
            "status": "ACTIVE",
        }

    @staticmethod
    def skip(template_id: int, occurrence_id: int, scheduled_date: str) -> Dict[str, Any]:
        return {
            "template_id": template_id,
            "occurrence_id": occurrence_id,
            "scheduled_date": scheduled_date,
            "status": "SKIPPED",
        }
