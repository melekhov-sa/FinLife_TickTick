"""Event use cases - calendar events, occurrences, reminders, filter presets"""
import json
from datetime import date, time, datetime, timedelta, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_, Integer

from app.infrastructure.eventlog.repository import EventLogRepository
from app.infrastructure.db.models import (
    CalendarEventModel, EventOccurrenceModel,
    EventReminderModel, EventDefaultReminderModel,
    EventFilterPresetModel, EventLog,
)
from app.domain.event import CalendarEvent
from app.domain.event_occurrence import EventOccurrenceEvent
from app.readmodels.projectors.events import EventsProjector
from app.application.recurrence_rules import CreateRecurrenceRuleUseCase

from app.application.occurrence_generator import OccurrenceGenerator

MSK = timezone(timedelta(hours=3))
ALL_DAY_START_HOUR = 9  # for reminder calculations


class EventValidationError(ValueError):
    pass


def validate_event_form(
    event_type: str,
    title: str,
    recurrence_type: str = "",
    start_date: str = "",
    rec_month: int | None = None,
    rec_day: int | None = None,
    rec_weekdays: list[str] | None = None,
    rec_interval: int = 1,
    rec_start_date: str = "",
) -> str | None:
    """Validate event creation form. Returns error message or None."""
    if not title.strip():
        return "Название обязательно"

    if event_type == "onetime":
        if not start_date.strip():
            return "Дата начала обязательна для однократного события"
    elif event_type == "recurring":
        if not recurrence_type:
            return "Выберите тип повтора"
        if recurrence_type == "yearly":
            if rec_month is None or rec_day is None:
                return "Укажите месяц и день для ежегодного события"
            if rec_month < 1 or rec_month > 12:
                return "Месяц должен быть от 1 до 12"
            if rec_day < 1 or rec_day > 31:
                return "День должен быть от 1 до 31"
        elif recurrence_type == "monthly":
            if rec_day is None:
                return "Укажите день месяца"
            if rec_day < 1 or rec_day > 31:
                return "День должен быть от 1 до 31"
        elif recurrence_type == "weekly":
            if not rec_weekdays:
                return "Выберите хотя бы один день недели"
        elif recurrence_type == "interval":
            if rec_interval < 1:
                return "Интервал должен быть >= 1"
            if not rec_start_date.strip():
                return "Дата начала обязательна"
        else:
            return f"Неверный тип повтора: {recurrence_type}"
    else:
        return f"Неверный тип события: {event_type}"

    return None


def rebuild_event_occurrences(db: Session, event_id: int, account_id: int, today: date) -> int:
    """Delete future rule-generated occurrences and regenerate.
    Returns count of deleted occurrences."""
    # Find future rule-generated, non-cancelled occurrences
    future_occs = db.query(EventOccurrenceModel).filter(
        EventOccurrenceModel.event_id == event_id,
        EventOccurrenceModel.account_id == account_id,
        EventOccurrenceModel.source == "rule",
        EventOccurrenceModel.start_date >= today,
        EventOccurrenceModel.is_cancelled == False,
    ).all()

    deleted = len(future_occs)

    # Delete associated reminders first
    if future_occs:
        occ_ids = [occ.id for occ in future_occs]
        db.query(EventReminderModel).filter(
            EventReminderModel.occurrence_id.in_(occ_ids),
        ).delete(synchronize_session=False)

        # Delete the occurrences
        db.query(EventOccurrenceModel).filter(
            EventOccurrenceModel.id.in_(occ_ids),
        ).delete(synchronize_session=False)
        db.commit()

    # Regenerate via OccurrenceGenerator
    OccurrenceGenerator(db).generate_event_occurrences(account_id)

    return deleted


def validate_reminder_mode(mode: str, offset_minutes: int | None, fixed_time: str | None) -> None:
    """Validate reminder mode/offset/fixed_time consistency."""
    if mode not in ("offset", "fixed_time"):
        raise EventValidationError(f"Неверный режим напоминания: {mode}")
    if mode == "offset":
        if offset_minutes is None:
            raise EventValidationError("offset_minutes обязателен для режима 'offset'")
        if fixed_time is not None:
            raise EventValidationError("fixed_time должен быть пуст для режима 'offset'")
    elif mode == "fixed_time":
        if fixed_time is None:
            raise EventValidationError("fixed_time обязателен для режима 'fixed_time'")
        if offset_minutes is not None:
            raise EventValidationError("offset_minutes должен быть пуст для режима 'fixed_time'")


# ============================================================================
# Event CRUD
# ============================================================================

class CreateEventUseCase:
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(
        self,
        account_id: int,
        title: str,
        category_id: int,
        description: str | None = None,
        freq: str | None = None,
        interval: int = 1,
        start_date: str | None = None,
        by_weekday: str | None = None,
        by_monthday: int | None = None,
        by_month: int | None = None,
        by_monthday_for_year: int | None = None,
        until_date: str | None = None,
        # For one-time events: auto-create occurrence
        occ_start_date: str | None = None,
        occ_start_time: str | None = None,
        occ_end_date: str | None = None,
        occ_end_time: str | None = None,
        actor_user_id: int | None = None,
    ) -> int:
        title = title.strip()
        if not title:
            raise EventValidationError("Название не может быть пустым")

        repeat_rule_id = None
        if freq:
            if not start_date:
                raise EventValidationError("start_date обязателен для повторяющегося события")
            rule_uc = CreateRecurrenceRuleUseCase(self.db)
            repeat_rule_id = rule_uc.execute(
                account_id=account_id,
                freq=freq,
                interval=interval,
                start_date=start_date,
                until_date=until_date,
                by_weekday=by_weekday,
                by_monthday=by_monthday,
                by_month=by_month,
                by_monthday_for_year=by_monthday_for_year,
                actor_user_id=actor_user_id,
            )

        event_id = self._generate_id()
        payload = CalendarEvent.create(
            account_id=account_id,
            event_id=event_id,
            title=title,
            category_id=category_id,
            description=description,
            repeat_rule_id=repeat_rule_id,
        )
        self.event_repo.append_event(
            account_id=account_id,
            event_type="calendar_event_created",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        EventsProjector(self.db).run(account_id, event_types=["calendar_event_created"])

        # Auto-create occurrence for one-time events
        if not freq and occ_start_date:
            CreateEventOccurrenceUseCase(self.db).execute(
                event_id=event_id,
                account_id=account_id,
                start_date=occ_start_date,
                start_time=occ_start_time or None,
                end_date=occ_end_date or None,
                end_time=occ_end_time or None,
                source="manual",
                actor_user_id=actor_user_id,
            )

        return event_id

    def _generate_id(self) -> int:
        max_id = self.db.query(
            func.max(func.cast(EventLog.payload_json['event_id'], CalendarEventModel.event_id.type))
        ).filter(EventLog.event_type == 'calendar_event_created').scalar() or 0
        return max_id + 1


class UpdateEventUseCase:
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(self, event_id: int, account_id: int, actor_user_id: int | None = None, **changes) -> None:
        ev = self.db.query(CalendarEventModel).filter(
            CalendarEventModel.event_id == event_id,
            CalendarEventModel.account_id == account_id,
        ).first()
        if not ev:
            raise EventValidationError(f"Событие #{event_id} не найдено")

        payload = CalendarEvent.update(event_id, **changes)
        self.event_repo.append_event(
            account_id=account_id,
            event_type="calendar_event_updated",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        EventsProjector(self.db).run(account_id, event_types=["calendar_event_updated"])


class DeactivateEventUseCase:
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(self, event_id: int, account_id: int, actor_user_id: int | None = None) -> None:
        ev = self.db.query(CalendarEventModel).filter(
            CalendarEventModel.event_id == event_id,
            CalendarEventModel.account_id == account_id,
        ).first()
        if not ev:
            raise EventValidationError(f"Событие #{event_id} не найдено")
        if not ev.is_active:
            raise EventValidationError("Событие уже деактивировано")

        payload = CalendarEvent.deactivate(event_id)
        self.event_repo.append_event(
            account_id=account_id,
            event_type="calendar_event_deactivated",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        EventsProjector(self.db).run(account_id, event_types=["calendar_event_deactivated"])


class ReactivateEventUseCase:
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(self, event_id: int, account_id: int, actor_user_id: int | None = None) -> None:
        ev = self.db.query(CalendarEventModel).filter(
            CalendarEventModel.event_id == event_id,
            CalendarEventModel.account_id == account_id,
        ).first()
        if not ev:
            raise EventValidationError(f"Событие #{event_id} не найдено")
        if ev.is_active:
            raise EventValidationError("Событие уже активно")

        payload = CalendarEvent.reactivate(event_id)
        self.event_repo.append_event(
            account_id=account_id,
            event_type="calendar_event_reactivated",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        EventsProjector(self.db).run(account_id, event_types=["calendar_event_reactivated"])


# ============================================================================
# Occurrence CRUD
# ============================================================================

class CreateEventOccurrenceUseCase:
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(
        self,
        event_id: int,
        account_id: int,
        start_date: str,
        start_time: str | None = None,
        end_date: str | None = None,
        end_time: str | None = None,
        source: str = "manual",
        actor_user_id: int | None = None,
    ) -> int:
        ev = self.db.query(CalendarEventModel).filter(
            CalendarEventModel.event_id == event_id,
            CalendarEventModel.account_id == account_id,
        ).first()
        if not ev:
            raise EventValidationError(f"Событие #{event_id} не найдено")

        occurrence_id = self._generate_id()
        payload = EventOccurrenceEvent.create(
            event_id=event_id,
            occurrence_id=occurrence_id,
            account_id=account_id,
            start_date=start_date,
            start_time=start_time,
            end_date=end_date,
            end_time=end_time,
            source=source,
        )
        self.event_repo.append_event(
            account_id=account_id,
            event_type="event_occurrence_created",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        EventsProjector(self.db).run(account_id, event_types=["event_occurrence_created"])

        # Copy default reminders to occurrence reminders
        self._copy_default_reminders(event_id, occurrence_id, account_id, actor_user_id)

        return occurrence_id

    def _copy_default_reminders(self, event_id: int, occurrence_id: int, account_id: int, actor_user_id: int | None) -> None:
        defaults = self.db.query(EventDefaultReminderModel).filter(
            EventDefaultReminderModel.event_id == event_id,
            EventDefaultReminderModel.is_enabled == True,
        ).all()
        for dr in defaults:
            payload = {
                "occurrence_id": occurrence_id,
                "channel": dr.channel,
                "mode": dr.mode,
                "offset_minutes": dr.offset_minutes,
                "fixed_time": dr.fixed_time.isoformat() if dr.fixed_time else None,
                "is_enabled": True,
            }
            self.event_repo.append_event(
                account_id=account_id,
                event_type="event_reminder_created",
                payload=payload,
                actor_user_id=actor_user_id,
            )
        if defaults:
            self.db.commit()
            EventsProjector(self.db).run(account_id, event_types=["event_reminder_created"])

    def _generate_id(self) -> int:
        max_id = self.db.query(
            func.max(func.cast(EventLog.payload_json['occurrence_id'], Integer))
        ).filter(EventLog.event_type == 'event_occurrence_created').scalar() or 0
        return max_id + 1


class UpdateEventOccurrenceUseCase:
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(self, occurrence_id: int, account_id: int, actor_user_id: int | None = None, **changes) -> None:
        occ = self.db.query(EventOccurrenceModel).filter(
            EventOccurrenceModel.id == occurrence_id,
            EventOccurrenceModel.account_id == account_id,
        ).first()
        if not occ:
            raise EventValidationError(f"Occurrence #{occurrence_id} не найден")

        payload = EventOccurrenceEvent.update(occurrence_id, **changes)
        self.event_repo.append_event(
            account_id=account_id,
            event_type="event_occurrence_updated",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        EventsProjector(self.db).run(account_id, event_types=["event_occurrence_updated"])


class CancelEventOccurrenceUseCase:
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(self, occurrence_id: int, account_id: int, actor_user_id: int | None = None) -> None:
        occ = self.db.query(EventOccurrenceModel).filter(
            EventOccurrenceModel.id == occurrence_id,
            EventOccurrenceModel.account_id == account_id,
        ).first()
        if not occ:
            raise EventValidationError(f"Occurrence #{occurrence_id} не найден")
        if occ.is_cancelled:
            raise EventValidationError("Occurrence уже отменён")

        payload = EventOccurrenceEvent.cancel(occ.event_id, occurrence_id)
        self.event_repo.append_event(
            account_id=account_id,
            event_type="event_occurrence_cancelled",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        EventsProjector(self.db).run(account_id, event_types=["event_occurrence_cancelled"])


# ============================================================================
# Default Reminder CRUD
# ============================================================================

class CreateDefaultReminderUseCase:
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(
        self,
        event_id: int,
        account_id: int,
        channel: str = "ui",
        mode: str = "offset",
        offset_minutes: int | None = None,
        fixed_time: str | None = None,
        actor_user_id: int | None = None,
    ) -> None:
        validate_reminder_mode(mode, offset_minutes, fixed_time)
        payload = {
            "event_id": event_id,
            "channel": channel,
            "mode": mode,
            "offset_minutes": offset_minutes,
            "fixed_time": fixed_time,
            "is_enabled": True,
        }
        self.event_repo.append_event(
            account_id=account_id,
            event_type="event_default_reminder_created",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        EventsProjector(self.db).run(account_id, event_types=["event_default_reminder_created"])


class DeleteDefaultReminderUseCase:
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(self, reminder_id: int, account_id: int, actor_user_id: int | None = None) -> None:
        payload = {"reminder_id": reminder_id}
        self.event_repo.append_event(
            account_id=account_id,
            event_type="event_default_reminder_deleted",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        EventsProjector(self.db).run(account_id, event_types=["event_default_reminder_deleted"])


# ============================================================================
# Filter Preset CRUD
# ============================================================================

class CreateFilterPresetUseCase:
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(
        self,
        account_id: int,
        name: str,
        category_ids: list[int] | None = None,
        actor_user_id: int | None = None,
    ) -> None:
        name = name.strip()
        if not name:
            raise EventValidationError("Название пресета не может быть пустым")
        payload = {
            "account_id": account_id,
            "name": name,
            "category_ids_json": json.dumps(category_ids or []),
            "is_selected": False,
        }
        self.event_repo.append_event(
            account_id=account_id,
            event_type="event_filter_preset_created",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        EventsProjector(self.db).run(account_id, event_types=["event_filter_preset_created"])


class SelectFilterPresetUseCase:
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(self, preset_id: int, account_id: int, actor_user_id: int | None = None) -> None:
        # Deselect all presets first
        all_presets = self.db.query(EventFilterPresetModel).filter(
            EventFilterPresetModel.account_id == account_id,
            EventFilterPresetModel.is_selected == True,
        ).all()
        for p in all_presets:
            payload = {"preset_id": p.id, "is_selected": False}
            self.event_repo.append_event(
                account_id=account_id,
                event_type="event_filter_preset_updated",
                payload=payload,
                actor_user_id=actor_user_id,
            )

        # Select the chosen one
        payload = {"preset_id": preset_id, "is_selected": True}
        self.event_repo.append_event(
            account_id=account_id,
            event_type="event_filter_preset_updated",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        EventsProjector(self.db).run(account_id, event_types=["event_filter_preset_updated"])


class DeleteFilterPresetUseCase:
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(self, preset_id: int, account_id: int, actor_user_id: int | None = None) -> None:
        payload = {"preset_id": preset_id}
        self.event_repo.append_event(
            account_id=account_id,
            event_type="event_filter_preset_deleted",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        EventsProjector(self.db).run(account_id, event_types=["event_filter_preset_deleted"])


# ============================================================================
# Query Helpers
# ============================================================================

def get_today_events(db: Session, account_id: int, today: date) -> list[EventOccurrenceModel]:
    """Today: start_date == today OR (period spanning today). No past. No cancelled."""
    return db.query(EventOccurrenceModel).filter(
        EventOccurrenceModel.account_id == account_id,
        EventOccurrenceModel.is_cancelled == False,
        or_(
            EventOccurrenceModel.start_date == today,
            and_(
                EventOccurrenceModel.start_date <= today,
                EventOccurrenceModel.end_date != None,
                EventOccurrenceModel.end_date >= today,
            ),
        ),
    ).order_by(EventOccurrenceModel.start_date.asc(), EventOccurrenceModel.start_time.asc().nullslast()).all()


def get_7days_events(db: Session, account_id: int, today: date) -> list[EventOccurrenceModel]:
    """7 days: start_date in [today..today+7] OR period intersecting [today..today+7]. No cancelled."""
    window_end = today + timedelta(days=7)
    return db.query(EventOccurrenceModel).filter(
        EventOccurrenceModel.account_id == account_id,
        EventOccurrenceModel.is_cancelled == False,
        or_(
            and_(
                EventOccurrenceModel.start_date >= today,
                EventOccurrenceModel.start_date <= window_end,
            ),
            and_(
                EventOccurrenceModel.start_date <= window_end,
                EventOccurrenceModel.end_date != None,
                EventOccurrenceModel.end_date >= today,
            ),
        ),
    ).order_by(EventOccurrenceModel.start_date.asc(), EventOccurrenceModel.start_time.asc().nullslast()).all()


def get_history_events(db: Session, account_id: int, today: date, limit: int = 50) -> list[EventOccurrenceModel]:
    """History: past events (start_date < today and no active end_date)."""
    return db.query(EventOccurrenceModel).filter(
        EventOccurrenceModel.account_id == account_id,
        EventOccurrenceModel.start_date < today,
        or_(
            EventOccurrenceModel.end_date == None,
            EventOccurrenceModel.end_date < today,
        ),
    ).order_by(EventOccurrenceModel.start_date.desc()).limit(limit).all()


def compute_event_start_dt(start_date: date, start_time: time | None) -> datetime:
    """Compute MSK datetime for an event. All-day events use 09:00 MSK."""
    if start_time is None:
        return datetime(start_date.year, start_date.month, start_date.day, ALL_DAY_START_HOUR, 0, tzinfo=MSK)
    return datetime(start_date.year, start_date.month, start_date.day,
                    start_time.hour, start_time.minute, start_time.second, tzinfo=MSK)


def get_due_reminders(db: Session, account_id: int, now_msk: datetime) -> list[dict]:
    """Get reminders that should fire at or before now_msk.
    Returns list of dicts with reminder info + occurrence + event data.
    """
    today = now_msk.date()
    tomorrow = today + timedelta(days=1)

    # Get today's and tomorrow's occurrences (to cover offset reminders for tomorrow)
    occs = db.query(EventOccurrenceModel).filter(
        EventOccurrenceModel.account_id == account_id,
        EventOccurrenceModel.is_cancelled == False,
        EventOccurrenceModel.start_date >= today,
        EventOccurrenceModel.start_date <= tomorrow,
    ).all()

    if not occs:
        return []

    occ_map = {o.id: o for o in occs}
    occ_ids = list(occ_map.keys())

    reminders = db.query(EventReminderModel).filter(
        EventReminderModel.occurrence_id.in_(occ_ids),
        EventReminderModel.is_enabled == True,
    ).all()

    due = []
    for rem in reminders:
        occ = occ_map[rem.occurrence_id]
        start_dt = compute_event_start_dt(occ.start_date, occ.start_time)

        if rem.mode == "offset" and rem.offset_minutes is not None:
            fire_at = start_dt - timedelta(minutes=rem.offset_minutes)
        elif rem.mode == "fixed_time" and rem.fixed_time is not None:
            fire_at = datetime(
                occ.start_date.year, occ.start_date.month, occ.start_date.day,
                rem.fixed_time.hour, rem.fixed_time.minute, rem.fixed_time.second,
                tzinfo=MSK,
            )
        else:
            continue

        if fire_at <= now_msk:
            due.append({
                "reminder_id": rem.id,
                "occurrence_id": occ.id,
                "event_id": occ.event_id,
                "channel": rem.channel,
                "fire_at": fire_at,
                "start_date": occ.start_date,
                "start_time": occ.start_time,
            })

    return due
