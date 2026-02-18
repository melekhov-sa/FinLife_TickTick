"""
GoalsProjector - builds goals read model from events
"""
from decimal import Decimal
from datetime import datetime

from app.readmodels.projectors.base import BaseProjector
from app.infrastructure.db.models import GoalInfo, EventLog


class GoalsProjector(BaseProjector):
    """
    Builds goals read model from events

    Обрабатывает события:
    - goal_created: создать цель
    - goal_updated: обновить цель
    - goal_archived: пометить цель как архивированную
    """

    def __init__(self, db):
        super().__init__(db, projector_name="goals")

    def handle_event(self, event: EventLog) -> None:
        if event.event_type == "goal_created":
            self._handle_goal_created(event)
        elif event.event_type == "goal_updated":
            self._handle_goal_updated(event)
        elif event.event_type == "goal_archived":
            self._handle_goal_archived(event)

    def _handle_goal_created(self, event: EventLog) -> None:
        payload = event.payload_json

        self.db.flush()
        existing = self.db.query(GoalInfo).filter(
            GoalInfo.goal_id == payload["goal_id"]
        ).first()

        if existing:
            return

        target_amount = None
        if payload.get("target_amount") is not None:
            target_amount = Decimal(payload["target_amount"])

        goal = GoalInfo(
            goal_id=payload["goal_id"],
            account_id=payload["account_id"],
            title=payload["title"],
            currency=payload["currency"],
            target_amount=target_amount,
            is_system=payload.get("is_system", False),
            is_archived=False,
            created_at=datetime.fromisoformat(payload["created_at"])
        )
        self.db.add(goal)
        self.db.flush()

    def _handle_goal_updated(self, event: EventLog) -> None:
        payload = event.payload_json

        goal = self.db.query(GoalInfo).filter(
            GoalInfo.goal_id == payload["goal_id"]
        ).first()

        if not goal:
            return

        if "title" in payload:
            goal.title = payload["title"]
        if "target_amount" in payload:
            if payload["target_amount"] is not None:
                goal.target_amount = Decimal(payload["target_amount"])
            else:
                goal.target_amount = None

    def _handle_goal_archived(self, event: EventLog) -> None:
        payload = event.payload_json

        goal = self.db.query(GoalInfo).filter(
            GoalInfo.goal_id == payload["goal_id"]
        ).first()

        if goal:
            goal.is_archived = True

    def reset(self, account_id: int) -> None:
        self.db.query(GoalInfo).filter(
            GoalInfo.account_id == account_id
        ).delete()
        super().reset(account_id)
