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

    @staticmethod
    def count_changed(habit_id: int, occurrence_id: int, scheduled_date: str,
                      new_count: int, target_count: int) -> Dict[str, Any]:
        return {
            "habit_id": habit_id,
            "occurrence_id": occurrence_id,
            "scheduled_date": scheduled_date,
            "completion_count": new_count,
            "target_count": target_count,
            "status": "DONE" if new_count >= target_count else "ACTIVE",
            "completed_at": datetime.utcnow().isoformat() if new_count >= target_count else None,
        }
