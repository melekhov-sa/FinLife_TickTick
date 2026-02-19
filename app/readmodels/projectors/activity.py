"""
ActivityProjector — aggregates meaningful user actions into user_activity_daily.

Activity weight rules (per event):
  transaction_created           → ops_count  +1  (weight 2)
  task_completed                → tasks_count +1  (weight 1)
  task_occurrence_completed     → tasks_count +1  (weight 1)
  habit_occurrence_completed    → habits_count +1 (weight 1)
  goal_achieved                 → goals_count +1  (weight 5)

day_points = 2*ops + 1*tasks + 1*habits + 5*goals
"""
from datetime import datetime, timezone, timedelta

from app.readmodels.projectors.base import BaseProjector
from app.infrastructure.db.models import EventLog, UserActivityDaily

MSK = timezone(timedelta(hours=3))

# event_type → which counter to increment
_COUNTER_MAP: dict[str, str] = {
    "transaction_created": "ops",
    "task_completed": "tasks",
    "task_occurrence_completed": "tasks",
    "habit_occurrence_completed": "habits",
    "goal_achieved": "goals",
}


class ActivityProjector(BaseProjector):
    """
    Idempotent projector: BaseProjector checkpoint guarantees each event_log
    row is processed at most once per projector.  On reset() all daily rows
    are cleared and the checkpoint is zeroed, enabling full replay.
    """

    def __init__(self, db):
        super().__init__(db, projector_name="activity")

    def handle_event(self, event: EventLog) -> None:
        counter = _COUNTER_MAP.get(event.event_type)
        if counter is None:
            return

        day_date = self._to_msk_date(event.occurred_at)
        user_id = event.account_id

        row = (
            self.db.query(UserActivityDaily)
            .filter(
                UserActivityDaily.user_id == user_id,
                UserActivityDaily.day_date == day_date,
            )
            .first()
        )
        if row is None:
            row = UserActivityDaily(
                user_id=user_id,
                day_date=day_date,
                ops_count=0,
                tasks_count=0,
                habits_count=0,
                goals_count=0,
                points=0,
            )
            self.db.add(row)
            self.db.flush()

        if counter == "ops":
            row.ops_count += 1
        elif counter == "tasks":
            row.tasks_count += 1
        elif counter == "habits":
            row.habits_count += 1
        elif counter == "goals":
            row.goals_count += 1

        row.points = (
            2 * row.ops_count
            + row.tasks_count
            + row.habits_count
            + 5 * row.goals_count
        )
        self.db.flush()

    def reset(self, account_id: int) -> None:
        """Delete all activity rows for this user and reset the checkpoint."""
        self.db.query(UserActivityDaily).filter(
            UserActivityDaily.user_id == account_id
        ).delete()
        super().reset(account_id)

    @staticmethod
    def _to_msk_date(dt: datetime):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(MSK).date()
