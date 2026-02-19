"""
XpProjector — awards XP for user actions tracked in event_log.

XP rules:
  task_completed              → +10 XP  (+2 bonus if completed before due_date)
  task_occurrence_completed   → +10 XP
  habit_occurrence_completed  → +3  XP
  transaction_created         → +5  XP
  goal_achieved               → +200 XP  (reserved for future event)

Level formula: level N requires 100 * N² XP to complete.
  Level 1 → 2:  100 XP
  Level 2 → 3:  400 XP
  Level 3 → 4:  900 XP
  ...
"""
from datetime import date, datetime, timezone, timedelta

from app.readmodels.projectors.base import BaseProjector
from app.infrastructure.db.models import UserXpState, XpEvent, EventLog

MSK = timezone(timedelta(hours=3))

BASE_TASK_COMPLETED_XP = 10
BONUS_EARLY_COMPLETE_XP = 2

XP_RULES: dict[str, int] = {
    "task_completed": BASE_TASK_COMPLETED_XP,
    "task_occurrence_completed": 10,
    "habit_occurrence_completed": 3,
    "transaction_created": 5,
    "goal_achieved": 200,
}


def preview_task_xp(due_date: date | None, completed_date_msk: date) -> int:
    """
    Pure function: return the XP awarded for completing a task.

    Single source of truth for the early-completion bonus rule.
    Used both by the projector and by request handlers (for flash previews).

    Args:
        due_date:            The task's due_date (may be None).
        completed_date_msk:  The calendar date (MSK) when the task was closed.

    Returns:
        10 normally, 12 if completed strictly before due_date.
    """
    if due_date and completed_date_msk < due_date:
        return BASE_TASK_COMPLETED_XP + BONUS_EARLY_COMPLETE_XP
    return BASE_TASK_COMPLETED_XP


def compute_level(total_xp: int) -> tuple[int, int, int]:
    """
    Derive level, current_level_xp, xp_to_next_level from total_xp.

    Returns:
        (level, current_level_xp, xp_to_next_level)
    """
    level = 1
    accumulated = 0
    while True:
        needed = 100 * level * level
        if total_xp < accumulated + needed:
            break
        accumulated += needed
        level += 1
    return level, total_xp - accumulated, 100 * level * level


class XpProjector(BaseProjector):
    """
    Projector that awards XP for completed tasks, habits, and transactions.

    Idempotent: xp_events.source_event_id is unique, so replaying the same
    event_log event never double-awards XP.
    """

    def __init__(self, db):
        super().__init__(db, projector_name="xp")

    def handle_event(self, event: EventLog) -> None:
        if event.event_type not in XP_RULES:
            return
        xp_amount = self._compute_xp_amount(event)
        self._award_xp(event, xp_amount)

    # ------------------------------------------------------------------
    # XP amount computation
    # ------------------------------------------------------------------

    def _compute_xp_amount(self, event: EventLog) -> int:
        """Return the XP amount for this event, including any bonuses."""
        if event.event_type == "task_completed":
            return self._task_completed_xp(event)
        return XP_RULES[event.event_type]

    def _task_completed_xp(self, event: EventLog) -> int:
        """Compute XP for task_completed, applying early-completion bonus."""
        payload = event.payload_json or {}
        task_id = payload.get("task_id")
        if not task_id:
            return BASE_TASK_COMPLETED_XP

        from app.infrastructure.db.models import TaskModel
        task = self.db.query(TaskModel).filter(
            TaskModel.task_id == int(task_id)
        ).first()
        if not task or not task.due_date:
            return BASE_TASK_COMPLETED_XP

        completed_date_msk = self._occurred_msk_date(event)
        return preview_task_xp(task.due_date, completed_date_msk)

    @staticmethod
    def _occurred_msk_date(event: EventLog) -> date:
        dt = event.occurred_at
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(MSK).date()

    # ------------------------------------------------------------------
    # Award & state update
    # ------------------------------------------------------------------

    def _award_xp(self, event: EventLog, xp_amount: int) -> None:
        # Idempotency check
        self.db.flush()
        if self.db.query(XpEvent).filter(XpEvent.source_event_id == event.id).first():
            return

        user_id = event.account_id

        # Record the XP award
        self.db.add(XpEvent(
            user_id=user_id,
            source_event_id=event.id,
            xp_amount=xp_amount,
            reason=event.event_type,
        ))

        # Upsert UserXpState
        state = self.db.query(UserXpState).filter(UserXpState.user_id == user_id).first()
        if not state:
            state = UserXpState(user_id=user_id, total_xp=0, level=1,
                                current_level_xp=0, xp_to_next_level=100)
            self.db.add(state)
            self.db.flush()

        state.total_xp += xp_amount
        state.level, state.current_level_xp, state.xp_to_next_level = compute_level(state.total_xp)
        self.db.flush()

    def reset(self, account_id: int) -> None:
        """Drop all XP data for this user and reset the checkpoint."""
        self.db.query(XpEvent).filter(XpEvent.user_id == account_id).delete()
        self.db.query(UserXpState).filter(UserXpState.user_id == account_id).delete()
        super().reset(account_id)
