"""Habit use cases and analytics queries"""
from datetime import date, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.infrastructure.eventlog.repository import EventLogRepository
from app.infrastructure.db.models import HabitModel, HabitOccurrence, RecurrenceRuleModel, EventLog
from app.domain.habit import Habit
from app.domain.habit_occurrence import HabitOccurrenceEvent
from app.domain.recurrence import rule_spec_from_db, generate_occurrence_dates
from app.readmodels.projectors.habits import HabitsProjector
from app.application.recurrence_rules import CreateRecurrenceRuleUseCase

TOGGLE_WINDOW_DAYS = 14


class HabitValidationError(ValueError):
    pass


class CreateHabitUseCase:
    """Creates a habit AND its recurrence rule in one go."""
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(
        self,
        account_id: int,
        title: str,
        freq: str,
        interval: int,
        start_date: str,
        note: str | None = None,
        active_until: str | None = None,
        category_id: int | None = None,
        by_weekday: str | None = None,
        by_monthday: int | None = None,
        level: int = 1,
        actor_user_id: int | None = None,
    ) -> int:
        title = title.strip()
        if not title:
            raise HabitValidationError("Название привычки не может быть пустым")

        if level not in (1, 2, 3):
            raise HabitValidationError("Уровень должен быть 1, 2 или 3")
        if freq == "WEEKLY" and not by_weekday:
            raise HabitValidationError("Для еженедельной привычки выберите хотя бы один день недели")
        if freq == "MONTHLY" and by_monthday is not None and (by_monthday < 1 or by_monthday > 31):
            raise HabitValidationError("День месяца должен быть от 1 до 31")

        rule_uc = CreateRecurrenceRuleUseCase(self.db)
        rule_id = rule_uc.execute(
            account_id=account_id,
            freq=freq,
            interval=interval,
            start_date=start_date,
            until_date=active_until,
            by_weekday=by_weekday,
            by_monthday=by_monthday,
            actor_user_id=actor_user_id,
        )

        habit_id = self._generate_id()
        payload = Habit.create(
            account_id=account_id,
            habit_id=habit_id,
            title=title,
            rule_id=rule_id,
            active_from=start_date,
            note=note,
            active_until=active_until,
            category_id=category_id,
            level=level,
        )

        self.event_repo.append_event(
            account_id=account_id,
            event_type="habit_created",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        HabitsProjector(self.db).run(account_id, event_types=["habit_created"])
        return habit_id

    def _generate_id(self) -> int:
        max_id = self.db.query(
            func.max(func.cast(EventLog.payload_json['habit_id'], HabitModel.habit_id.type))
        ).filter(EventLog.event_type == 'habit_created').scalar() or 0
        return max_id + 1


class ArchiveHabitUseCase:
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(self, habit_id: int, account_id: int, actor_user_id: int | None = None) -> None:
        habit = self.db.query(HabitModel).filter(
            HabitModel.habit_id == habit_id,
            HabitModel.account_id == account_id,
        ).first()
        if not habit:
            raise HabitValidationError(f"Привычка #{habit_id} не найдена")
        if habit.is_archived:
            raise HabitValidationError("Привычка уже в архиве")

        payload = Habit.archive(habit_id)
        self.event_repo.append_event(
            account_id=account_id,
            event_type="habit_archived",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        HabitsProjector(self.db).run(account_id, event_types=["habit_archived"])


class UnarchiveHabitUseCase:
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(self, habit_id: int, account_id: int, actor_user_id: int | None = None) -> None:
        habit = self.db.query(HabitModel).filter(
            HabitModel.habit_id == habit_id,
            HabitModel.account_id == account_id,
        ).first()
        if not habit:
            raise HabitValidationError(f"Привычка #{habit_id} не найдена")
        if not habit.is_archived:
            raise HabitValidationError("Привычка не в архиве")

        payload = Habit.unarchive(habit_id)
        self.event_repo.append_event(
            account_id=account_id,
            event_type="habit_unarchived",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        HabitsProjector(self.db).run(account_id, event_types=["habit_unarchived"])


class ToggleHabitOccurrenceUseCase:
    """Toggle occurrence: ACTIVE/SKIPPED -> DONE, DONE -> ACTIVE. 14-day window only."""
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(self, occurrence_id: int, account_id: int, today: date | None = None,
                actor_user_id: int | None = None) -> str:
        if today is None:
            today = date.today()

        occ = self.db.query(HabitOccurrence).filter(
            HabitOccurrence.id == occurrence_id,
            HabitOccurrence.account_id == account_id,
        ).first()
        if not occ:
            raise HabitValidationError(f"Occurrence #{occurrence_id} не найден")

        earliest = today - timedelta(days=TOGGLE_WINDOW_DAYS - 1)
        if occ.scheduled_date < earliest:
            raise HabitValidationError("Нельзя менять статус старше 14 дней")
        if occ.scheduled_date > today:
            raise HabitValidationError("Нельзя менять статус будущих дат")

        if occ.status == "DONE":
            payload = HabitOccurrenceEvent.reset(occ.habit_id, occurrence_id, occ.scheduled_date.isoformat())
            event_type = "habit_occurrence_reset"
            new_status = "ACTIVE"
        else:
            payload = HabitOccurrenceEvent.complete(occ.habit_id, occurrence_id, occ.scheduled_date.isoformat())
            event_type = "habit_occurrence_completed"
            new_status = "DONE"

        self.event_repo.append_event(
            account_id=account_id, event_type=event_type,
            payload=payload, actor_user_id=actor_user_id,
        )
        self.db.commit()
        HabitsProjector(self.db).run(account_id, event_types=[event_type])
        return new_status


class CompleteHabitOccurrenceUseCase:
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(self, occurrence_id: int, account_id: int, actor_user_id: int | None = None) -> None:
        occ = self.db.query(HabitOccurrence).filter(
            HabitOccurrence.id == occurrence_id,
            HabitOccurrence.account_id == account_id,
        ).first()
        if not occ:
            raise HabitValidationError(f"Occurrence #{occurrence_id} не найден")

        payload = HabitOccurrenceEvent.complete(
            occ.habit_id, occurrence_id, occ.scheduled_date.isoformat()
        )
        self.event_repo.append_event(
            account_id=account_id,
            event_type="habit_occurrence_completed",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        HabitsProjector(self.db).run(account_id, event_types=["habit_occurrence_completed"])


class SkipHabitOccurrenceUseCase:
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(self, occurrence_id: int, account_id: int, actor_user_id: int | None = None) -> None:
        occ = self.db.query(HabitOccurrence).filter(
            HabitOccurrence.id == occurrence_id,
            HabitOccurrence.account_id == account_id,
        ).first()
        if not occ:
            raise HabitValidationError(f"Occurrence #{occurrence_id} не найден")

        payload = HabitOccurrenceEvent.skip(
            occ.habit_id, occurrence_id, occ.scheduled_date.isoformat()
        )
        self.event_repo.append_event(
            account_id=account_id,
            event_type="habit_occurrence_skipped",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        HabitsProjector(self.db).run(account_id, event_types=["habit_occurrence_skipped"])


class ResetHabitOccurrenceUseCase:
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(self, occurrence_id: int, account_id: int, actor_user_id: int | None = None) -> None:
        occ = self.db.query(HabitOccurrence).filter(
            HabitOccurrence.id == occurrence_id,
            HabitOccurrence.account_id == account_id,
        ).first()
        if not occ:
            raise HabitValidationError(f"Occurrence #{occurrence_id} не найден")

        payload = HabitOccurrenceEvent.reset(
            occ.habit_id, occurrence_id, occ.scheduled_date.isoformat()
        )
        self.event_repo.append_event(
            account_id=account_id,
            event_type="habit_occurrence_reset",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        HabitsProjector(self.db).run(account_id, event_types=["habit_occurrence_reset"])


# --- Analytics & query helpers ---

def get_today_habits(db: Session, account_id: int, today: date) -> list[dict]:
    """Return active habits that have an occurrence today, with occurrence info."""
    habits = db.query(HabitModel).filter(
        HabitModel.account_id == account_id,
        HabitModel.is_archived == False,
    ).order_by(HabitModel.level.desc(), HabitModel.current_streak.desc(), HabitModel.title).all()

    result = []
    for h in habits:
        occ = db.query(HabitOccurrence).filter(
            HabitOccurrence.account_id == account_id,
            HabitOccurrence.habit_id == h.habit_id,
            HabitOccurrence.scheduled_date == today,
        ).first()
        if occ:
            total_30 = _count_occurrences_in_window(db, account_id, h.habit_id, today - timedelta(days=29), today)
            pct_30 = round(h.done_count_30d / total_30 * 100) if total_30 > 0 else 0
            result.append({
                "habit": h,
                "occ": occ,
                "pct_30": pct_30,
            })
    return result


def get_habits_grid(db: Session, account_id: int, today: date) -> list[dict]:
    """Return active habits with their 14-day occurrence grid (today-13..today)."""
    habits = db.query(HabitModel).filter(
        HabitModel.account_id == account_id,
        HabitModel.is_archived == False,
    ).order_by(HabitModel.level.desc(), HabitModel.current_streak.desc(), HabitModel.title).all()

    grid_start = today - timedelta(days=TOGGLE_WINDOW_DAYS - 1)
    all_occs = db.query(HabitOccurrence).filter(
        HabitOccurrence.account_id == account_id,
        HabitOccurrence.scheduled_date >= grid_start,
        HabitOccurrence.scheduled_date <= today,
    ).order_by(HabitOccurrence.scheduled_date.asc()).all()

    occ_map: dict[int, dict[date, HabitOccurrence]] = {}
    for occ in all_occs:
        occ_map.setdefault(occ.habit_id, {})[occ.scheduled_date] = occ

    result = []
    for h in habits:
        habit_occs = occ_map.get(h.habit_id, {})
        total_30 = _count_occurrences_in_window(db, account_id, h.habit_id, today - timedelta(days=29), today)
        pct_30 = round(h.done_count_30d / total_30 * 100) if total_30 > 0 else 0

        days = []
        for i in range(TOGGLE_WINDOW_DAYS):
            d = grid_start + timedelta(days=i)
            occ = habit_occs.get(d)
            days.append({
                "date": d,
                "occ_id": occ.id if occ else None,
                "status": occ.status if occ else None,
            })
        result.append({"habit": h, "days": days, "pct_30": pct_30})
    return result


def get_habits_analytics(db: Session, account_id: int, today: date) -> dict:
    """Compute aggregate analytics for the habits dashboard."""
    habits = db.query(HabitModel).filter(
        HabitModel.account_id == account_id,
        HabitModel.is_archived == False,
    ).all()

    if not habits:
        return {
            "today_done": 0, "today_total": 0,
            "week_pct": 0, "month_pct": 0,
            "best_streak": 0, "daily_stats": [],
        }

    habit_ids = [h.habit_id for h in habits]

    today_occs = db.query(HabitOccurrence).filter(
        HabitOccurrence.account_id == account_id,
        HabitOccurrence.scheduled_date == today,
        HabitOccurrence.habit_id.in_(habit_ids),
    ).all()
    today_done = sum(1 for o in today_occs if o.status == "DONE")
    today_total = len(today_occs)

    month_start = today - timedelta(days=29)
    month_occs = db.query(HabitOccurrence).filter(
        HabitOccurrence.account_id == account_id,
        HabitOccurrence.scheduled_date >= month_start,
        HabitOccurrence.scheduled_date <= today,
        HabitOccurrence.habit_id.in_(habit_ids),
    ).all()

    week_start = today - timedelta(days=6)
    week_done = sum(1 for o in month_occs if o.scheduled_date >= week_start and o.status == "DONE")
    week_total = sum(1 for o in month_occs if o.scheduled_date >= week_start)
    week_pct = round(week_done / week_total * 100) if week_total > 0 else 0

    month_done = sum(1 for o in month_occs if o.status == "DONE")
    month_total = len(month_occs)
    month_pct = round(month_done / month_total * 100) if month_total > 0 else 0

    best_streak = max((h.best_streak for h in habits), default=0)

    chart_start = today - timedelta(days=13)
    daily_stats = []
    for i in range(14):
        d = chart_start + timedelta(days=i)
        day_occs = [o for o in month_occs if o.scheduled_date == d]
        daily_stats.append({
            "date": d,
            "done": sum(1 for o in day_occs if o.status == "DONE"),
            "total": len(day_occs),
        })

    return {
        "today_done": today_done, "today_total": today_total,
        "week_pct": week_pct, "month_pct": month_pct,
        "best_streak": best_streak, "daily_stats": daily_stats,
    }


def _count_occurrences_in_window(db: Session, account_id: int, habit_id: int,
                                  start: date, end: date) -> int:
    return db.query(func.count(HabitOccurrence.id)).filter(
        HabitOccurrence.account_id == account_id,
        HabitOccurrence.habit_id == habit_id,
        HabitOccurrence.scheduled_date >= start,
        HabitOccurrence.scheduled_date <= end,
    ).scalar() or 0


# --- Heatmap ---

HEATMAP_DAYS = 90


def get_global_heatmap(db: Session, account_id: int, today: date) -> list[dict]:
    """Build global heatmap: 90 days, each cell = {date, done, total, level(0-4)}."""
    start = today - timedelta(days=HEATMAP_DAYS - 1)

    habits = db.query(HabitModel).filter(
        HabitModel.account_id == account_id,
        HabitModel.is_archived == False,
    ).all()
    if not habits:
        return []

    habit_ids = [h.habit_id for h in habits]
    occs = db.query(HabitOccurrence).filter(
        HabitOccurrence.account_id == account_id,
        HabitOccurrence.habit_id.in_(habit_ids),
        HabitOccurrence.scheduled_date >= start,
        HabitOccurrence.scheduled_date <= today,
    ).all()

    by_date: dict[date, list] = {}
    for o in occs:
        by_date.setdefault(o.scheduled_date, []).append(o)

    result = []
    for i in range(HEATMAP_DAYS):
        d = start + timedelta(days=i)
        day_occs = by_date.get(d, [])
        total = len(day_occs)
        done = sum(1 for o in day_occs if o.status == "DONE")
        if total == 0:
            level = 0
        else:
            pct = done / total
            if pct == 0:
                level = 0
            elif pct < 0.34:
                level = 1
            elif pct < 0.67:
                level = 2
            elif pct < 1.0:
                level = 3
            else:
                level = 4
        result.append({"date": d, "done": done, "total": total, "level": level})
    return result


def get_habit_heatmap(db: Session, account_id: int, habit_id: int, today: date) -> list[dict]:
    """Build per-habit heatmap: 90 days, status = 'done'|'undone'|'na'."""
    start = today - timedelta(days=HEATMAP_DAYS - 1)

    habit = db.query(HabitModel).filter(HabitModel.habit_id == habit_id).first()
    if not habit:
        return []

    rule = db.query(RecurrenceRuleModel).filter(
        RecurrenceRuleModel.rule_id == habit.rule_id
    ).first()

    # Compute expected dates from recurrence rule
    expected_dates: set[date] = set()
    if rule:
        spec = rule_spec_from_db(rule)
        ws = max(start, habit.active_from)
        we = today
        if habit.active_until:
            we = min(we, habit.active_until)
        if ws <= we:
            expected_dates = set(generate_occurrence_dates(spec, ws, we))

    # Fetch actual occurrences
    occs = db.query(HabitOccurrence).filter(
        HabitOccurrence.account_id == account_id,
        HabitOccurrence.habit_id == habit_id,
        HabitOccurrence.scheduled_date >= start,
        HabitOccurrence.scheduled_date <= today,
    ).all()
    occ_map = {o.scheduled_date: o for o in occs}

    result = []
    for i in range(HEATMAP_DAYS):
        d = start + timedelta(days=i)
        occ = occ_map.get(d)
        if d in expected_dates or occ:
            status = "done" if occ and occ.status == "DONE" else "undone"
        else:
            status = "na"
        result.append({"date": d, "status": status})
    return result


# --- Milestones ---

MILESTONE_THRESHOLDS = [7, 14, 30, 60, 100]


def check_and_emit_milestones(db: Session, account_id: int, habit_id: int,
                               current_streak: int, actor_user_id: int | None = None) -> list[int]:
    """Check if current streak hit any threshold and emit events. Returns newly reached thresholds."""
    from app.infrastructure.eventlog.repository import EventLogRepository

    newly_reached = []
    for threshold in MILESTONE_THRESHOLDS:
        if current_streak < threshold:
            break
        # Check if already emitted
        existing = db.query(EventLog).filter(
            EventLog.event_type == "habit_milestone_reached",
            EventLog.account_id == account_id,
        ).all()
        already_has = False
        for ev in existing:
            p = ev.payload_json
            if p.get("habit_id") == habit_id and p.get("threshold") == threshold:
                already_has = True
                break
        if already_has:
            continue

        from datetime import datetime
        event_repo = EventLogRepository(db)
        event_repo.append_event(
            account_id=account_id,
            event_type="habit_milestone_reached",
            payload={
                "habit_id": habit_id,
                "threshold": threshold,
                "current_streak": current_streak,
                "reached_at": datetime.utcnow().isoformat(),
            },
            actor_user_id=actor_user_id,
        )
        newly_reached.append(threshold)
    return newly_reached


def get_habit_milestones(db: Session, account_id: int, habit_id: int) -> list[int]:
    """Return list of reached thresholds for a habit."""
    events = db.query(EventLog).filter(
        EventLog.event_type == "habit_milestone_reached",
        EventLog.account_id == account_id,
    ).all()
    thresholds = []
    for ev in events:
        p = ev.payload_json
        if p.get("habit_id") == habit_id:
            thresholds.append(p["threshold"])
    return sorted(set(thresholds))


def get_recent_milestones(db: Session, account_id: int, limit: int = 5) -> list[dict]:
    """Return recent milestone events across all habits."""
    events = db.query(EventLog).filter(
        EventLog.event_type == "habit_milestone_reached",
        EventLog.account_id == account_id,
    ).order_by(EventLog.occurred_at.desc()).limit(limit * 3).all()

    # Deduplicate (keep latest per habit+threshold)
    seen = set()
    result = []
    for ev in events:
        p = ev.payload_json
        key = (p.get("habit_id"), p.get("threshold"))
        if key in seen:
            continue
        seen.add(key)
        # Get habit title
        habit = db.query(HabitModel).filter(HabitModel.habit_id == p.get("habit_id")).first()
        result.append({
            "habit_title": habit.title if habit else f"Привычка #{p.get('habit_id')}",
            "threshold": p["threshold"],
            "reached_at": p.get("reached_at"),
        })
        if len(result) >= limit:
            break
    return result
