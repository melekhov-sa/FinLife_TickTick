"""HabitOccurrence domain entity - generates events for habit occurrence actions"""
from datetime import datetime
from typing import Dict, Any


class HabitOccurrenceEvent:
    @staticmethod
    def complete(habit_id: int, occurrence_id: int, scheduled_date: str) -> Dict[str, Any]:
        return {
            "habit_id": habit_id,
            "occurrence_id": occurrence_id,
            "scheduled_date": scheduled_date,
            "status": "DONE",
            "completed_at": datetime.utcnow().isoformat()
        }

    @staticmethod
    def skip(habit_id: int, occurrence_id: int, scheduled_date: str) -> Dict[str, Any]:
        return {
            "habit_id": habit_id,
            "occurrence_id": occurrence_id,
            "scheduled_date": scheduled_date,
            "status": "SKIPPED",
        }

    @staticmethod
    def reset(habit_id: int, occurrence_id: int, scheduled_date: str) -> Dict[str, Any]:
        return {
            "habit_id": habit_id,
            "occurrence_id": occurrence_id,
            "scheduled_date": scheduled_date,
            "status": "ACTIVE",
        }
