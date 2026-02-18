"""
Goal domain entity - generates events for savings goal operations
"""
from datetime import datetime
from dataclasses import dataclass
from typing import Dict, Any, Optional
from decimal import Decimal

SYSTEM_GOAL_TITLE = "Без цели"


@dataclass
class Goal:
    """
    Goal domain entity (Event Sourcing)

    Goal не персистится напрямую - генерирует события для event_log.
    Read model (GoalInfo) строится projector'ом из событий.
    """
    id: int
    account_id: int
    title: str
    currency: str
    target_amount: Optional[Decimal]
    is_system: bool

    @staticmethod
    def create(
        account_id: int,
        goal_id: int,
        title: str,
        currency: str,
        target_amount: Optional[str] = None,
        is_system: bool = False
    ) -> Dict[str, Any]:
        """
        Создать событие goal_created

        Returns:
            Event payload для сохранения в event_log
        """
        return {
            "goal_id": goal_id,
            "account_id": account_id,
            "title": title,
            "currency": currency,
            "target_amount": target_amount,
            "is_system": is_system,
            "created_at": datetime.utcnow().isoformat()
        }

    @staticmethod
    def update(goal_id: int, **changes) -> Dict[str, Any]:
        """
        Создать событие goal_updated

        Returns:
            Event payload для сохранения в event_log
        """
        payload: Dict[str, Any] = {
            "goal_id": goal_id,
            "updated_at": datetime.utcnow().isoformat()
        }
        payload.update(changes)
        return payload

    @staticmethod
    def archive(goal_id: int) -> Dict[str, Any]:
        """Создать событие goal_archived"""
        return {
            "goal_id": goal_id,
            "archived_at": datetime.utcnow().isoformat()
        }
