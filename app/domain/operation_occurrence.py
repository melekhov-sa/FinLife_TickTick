"""OperationOccurrence domain entity - generates events for planned operation occurrence actions"""
from datetime import datetime
from typing import Dict, Any


class OperationOccurrenceEvent:
    @staticmethod
    def confirm(template_id: int, occurrence_id: int, scheduled_date: str, transaction_id: int) -> Dict[str, Any]:
        return {
            "template_id": template_id,
            "occurrence_id": occurrence_id,
            "scheduled_date": scheduled_date,
            "status": "DONE",
            "transaction_id": transaction_id,
            "completed_at": datetime.utcnow().isoformat()
        }

    @staticmethod
    def skip(template_id: int, occurrence_id: int, scheduled_date: str) -> Dict[str, Any]:
        return {
            "template_id": template_id,
            "occurrence_id": occurrence_id,
            "scheduled_date": scheduled_date,
            "status": "SKIPPED",
        }
