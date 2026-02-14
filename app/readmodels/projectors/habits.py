"""HabitsProjector - builds habits read model from events, including streak calculation.
Ported from FinLife OS apps/projector/habits.py."""
from datetime import date, datetime, timedelta
from app.readmodels.projectors.base import BaseProjector
from app.infrastructure.db.models import (
    HabitModel, HabitOccurrence, RecurrenceRuleModel, EventLog
)

STREAK_LOOKBACK_DAYS = 365
MAX_OCCURRENCES_FOR_STREAK = 500


class HabitsProjector(BaseProjector):
    def __init__(self, db):
        super().__init__(db, projector_name="habits")

    def handle_event(self, event: EventLog) -> None:
        if event.event_type == "habit_created":
            self._handle_created(event)
        elif event.event_type == "habit_updated":
            self._handle_updated(event)
        elif event.event_type == "habit_archived":
            self._handle_archived(event)
        elif event.event_type == "habit_unarchived":
            self._handle_unarchived(event)
        elif event.event_type in ("habit_occurrence_completed", "habit_occurrence_skipped", "habit_occurrence_reset"):
            self._handle_occurrence_status(event)

    def _handle_created(self, event: EventLog) -> None:
        payload = event.payload_json
        self.db.flush()
        existing = self.db.query(HabitModel).filter(
            HabitModel.habit_id == payload["habit_id"]
        ).first()
        if existing:
            return
        habit = HabitModel(
            habit_id=payload["habit_id"],
            account_id=payload["account_id"],
            title=payload["title"],
            note=payload.get("note"),
            rule_id=payload["rule_id"],
            category_id=payload.get("category_id"),
            active_from=date.fromisoformat(payload["active_from"]),
            active_until=date.fromisoformat(payload["active_until"]) if payload.get("active_until") else None,
            is_archived=False,
            level=payload.get("level", 1),
            current_streak=0,
            best_streak=0,
            done_count_30d=0,
        )
        self.db.add(habit)
        self.db.flush()

    def _handle_updated(self, event: EventLog) -> None:
        payload = event.payload_json
        habit = self.db.query(HabitModel).filter(
            HabitModel.habit_id == payload["habit_id"]
        ).first()
        if not habit:
            return
        if "title" in payload:
            habit.title = payload["title"]
        if "note" in payload:
            habit.note = payload["note"]
        if "active_until" in payload:
            habit.active_until = date.fromisoformat(payload["active_until"]) if payload["active_until"] else None
        if "category_id" in payload:
            habit.category_id = payload["category_id"]
        if "is_archived" in payload:
            habit.is_archived = payload["is_archived"]
        if "level" in payload:
            habit.level = payload["level"]

    def _handle_archived(self, event: EventLog) -> None:
        payload = event.payload_json
        habit = self.db.query(HabitModel).filter(
            HabitModel.habit_id == payload["habit_id"]
        ).first()
        if habit:
            habit.is_archived = True

    def _handle_unarchived(self, event: EventLog) -> None:
        payload = event.payload_json
        habit = self.db.query(HabitModel).filter(
            HabitModel.habit_id == payload["habit_id"]
        ).first()
        if habit:
            habit.is_archived = False

    def _handle_occurrence_status(self, event: EventLog) -> None:
        payload = event.payload_json
        occurrence_id = payload["occurrence_id"]
        status = payload["status"]
        completed_at = None

        if status == "DONE" and payload.get("completed_at"):
            completed_at = datetime.fromisoformat(payload["completed_at"])
        elif status == "DONE":
            completed_at = datetime.utcnow()

        occ = self.db.query(HabitOccurrence).filter(
            HabitOccurrence.id == occurrence_id
        ).first()
        if occ:
            occ.status = status
            occ.completed_at = completed_at if status == "DONE" else None

        # Recompute streaks
        habit_id = payload["habit_id"]
        habit = self.db.query(HabitModel).filter(
            HabitModel.habit_id == habit_id
        ).first()
        if habit:
            today = date.today()
            cs, bs, d30 = self._compute_streaks(habit.account_id, habit_id, habit.rule_id, today)
            habit.current_streak = cs
            habit.best_streak = bs
            habit.done_count_30d = d30

            # Emit milestone events if streak crossed thresholds
            from app.application.habits import check_and_emit_milestones
            check_and_emit_milestones(self.db, habit.account_id, habit_id, cs)

    def _compute_streaks(self, account_id: int, habit_id: int, rule_id: int, today: date) -> tuple[int, int, int]:
        """Compute (current_streak, best_streak, done_count_30d)."""
        rule = self.db.query(RecurrenceRuleModel).filter(
            RecurrenceRuleModel.rule_id == rule_id
        ).first()
        freq = rule.freq if rule else "DAILY"

        window_start = today - timedelta(days=STREAK_LOOKBACK_DAYS)
        rows = self.db.query(HabitOccurrence).filter(
            HabitOccurrence.account_id == account_id,
            HabitOccurrence.habit_id == habit_id,
            HabitOccurrence.scheduled_date >= window_start,
            HabitOccurrence.scheduled_date <= today,
        ).order_by(HabitOccurrence.scheduled_date.desc()).limit(MAX_OCCURRENCES_FOR_STREAK).all()

        done_dates = {r.scheduled_date for r in rows if r.status == "DONE"}
        all_dates = {r.scheduled_date for r in rows}
        done_count_30d = sum(1 for d in done_dates if (today - d).days <= 30)

        if freq == "WEEKLY":
            return self._weekly_streaks(done_dates, today, window_start, done_count_30d)

        # DAILY / INTERVAL_DAYS / other
        current_streak = 0
        d = today
        while d >= window_start:
            if d not in all_dates:
                break
            if d in done_dates:
                current_streak += 1
                d -= timedelta(days=1)
            else:
                break

        sorted_dates = sorted(all_dates)
        best_streak = 0
        run = 0
        prev = None
        for d in sorted_dates:
            if d in done_dates:
                if prev is not None and (d - prev).days == 1:
                    run += 1
                else:
                    run = 1
                best_streak = max(best_streak, run)
                prev = d
            else:
                run = 0
                prev = None

        return current_streak, best_streak, done_count_30d

    def _weekly_streaks(self, done_dates: set, today: date, window_start: date, done_count_30d: int) -> tuple[int, int, int]:
        weeks_with_done = {d.isocalendar()[:2] for d in done_dates}

        # Current streak: consecutive ISO weeks with at least one DONE
        cur = 0
        d = today
        while d >= window_start:
            if d.isocalendar()[:2] in weeks_with_done:
                cur += 1
                d -= timedelta(days=7)
            else:
                break

        # Best streak
        def monday_of_week(yw):
            y, w = yw[0], yw[1]
            jan4 = date(y, 1, 4)
            mon = jan4 - timedelta(days=jan4.weekday())
            return mon + timedelta(weeks=w - 1)

        sorted_weeks = sorted(weeks_with_done, key=monday_of_week)
        best = 0
        run = 0
        prev_m = None
        for yw in sorted_weeks:
            m = monday_of_week(yw)
            if prev_m is None or (m - prev_m).days == 7:
                run += 1
            else:
                run = 1
            best = max(best, run)
            prev_m = m

        return cur, best, done_count_30d

    def reset(self, account_id: int) -> None:
        self.db.query(HabitOccurrence).filter(HabitOccurrence.account_id == account_id).delete()
        self.db.query(HabitModel).filter(HabitModel.account_id == account_id).delete()
        super().reset(account_id)
