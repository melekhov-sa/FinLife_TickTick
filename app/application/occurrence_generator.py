"""
Occurrence Generator - lazily generates occurrences for habits, task templates, operation templates.

Called when loading pages. Uses recurrence engine to compute dates,
then inserts missing occurrences into the DB (idempotent - checks before insert).
"""
from datetime import date, timedelta
from sqlalchemy.orm import Session

from app.domain.recurrence import rule_spec_from_db, generate_occurrence_dates
from app.infrastructure.db.models import (
    RecurrenceRuleModel,
    HabitModel, HabitOccurrence,
    TaskTemplateModel, TaskOccurrence,
    OperationTemplateModel, OperationOccurrence,
    CalendarEventModel, EventOccurrenceModel,
    EventDefaultReminderModel, EventReminderModel,
)


def _get_window() -> tuple[date, date]:
    """Generation window: [today-30, max(today+90, Dec 31 of current year)]."""
    today = date.today()
    window_start = today - timedelta(days=30)
    window_end = max(today + timedelta(days=90), date(today.year, 12, 31))
    return window_start, window_end


class OccurrenceGenerator:
    def __init__(self, db: Session):
        self.db = db

    def generate_habit_occurrences(self, account_id: int) -> int:
        """Generate missing habit occurrences. Returns count of new rows."""
        habits = self.db.query(HabitModel).filter(
            HabitModel.account_id == account_id,
            HabitModel.is_archived == False,
        ).all()

        window_start, window_end = _get_window()
        count = 0

        for habit in habits:
            rule = self.db.query(RecurrenceRuleModel).filter(
                RecurrenceRuleModel.rule_id == habit.rule_id
            ).first()
            if not rule:
                continue

            ws = max(window_start, habit.active_from)
            we = window_end
            if habit.active_until:
                we = min(we, habit.active_until)
            if ws > we:
                continue

            spec = rule_spec_from_db(rule)
            dates = generate_occurrence_dates(spec, ws, we)

            # Get existing dates for this habit in one query
            existing_dates = {
                row.scheduled_date for row in
                self.db.query(HabitOccurrence.scheduled_date).filter(
                    HabitOccurrence.account_id == account_id,
                    HabitOccurrence.habit_id == habit.habit_id,
                    HabitOccurrence.scheduled_date >= ws,
                    HabitOccurrence.scheduled_date <= we,
                ).all()
            }

            for d in dates:
                if d in existing_dates:
                    continue
                self.db.add(HabitOccurrence(
                    account_id=account_id,
                    habit_id=habit.habit_id,
                    scheduled_date=d,
                    status="ACTIVE",
                ))
                count += 1

        if count > 0:
            self.db.commit()
        return count

    def generate_task_occurrences(self, account_id: int) -> int:
        """Generate missing task template occurrences. Returns count of new rows."""
        templates = self.db.query(TaskTemplateModel).filter(
            TaskTemplateModel.account_id == account_id,
            TaskTemplateModel.is_archived == False,
        ).all()

        window_start, window_end = _get_window()
        count = 0

        for tmpl in templates:
            rule = self.db.query(RecurrenceRuleModel).filter(
                RecurrenceRuleModel.rule_id == tmpl.rule_id
            ).first()
            if not rule:
                continue

            ws = max(window_start, tmpl.active_from)
            we = window_end
            if tmpl.active_until:
                we = min(we, tmpl.active_until)
            if ws > we:
                continue

            spec = rule_spec_from_db(rule)
            dates = generate_occurrence_dates(spec, ws, we)

            existing_dates = {
                row.scheduled_date for row in
                self.db.query(TaskOccurrence.scheduled_date).filter(
                    TaskOccurrence.account_id == account_id,
                    TaskOccurrence.template_id == tmpl.template_id,
                    TaskOccurrence.scheduled_date >= ws,
                    TaskOccurrence.scheduled_date <= we,
                ).all()
            }

            for d in dates:
                if d in existing_dates:
                    continue
                self.db.add(TaskOccurrence(
                    account_id=account_id,
                    template_id=tmpl.template_id,
                    scheduled_date=d,
                    status="ACTIVE",
                ))
                count += 1

        if count > 0:
            self.db.commit()
        return count

    def generate_operation_occurrences(self, account_id: int) -> int:
        """Generate missing operation template occurrences. Returns count of new rows."""
        templates = self.db.query(OperationTemplateModel).filter(
            OperationTemplateModel.account_id == account_id,
            OperationTemplateModel.is_archived == False,
        ).all()

        window_start, window_end = _get_window()
        count = 0

        for tmpl in templates:
            rule = self.db.query(RecurrenceRuleModel).filter(
                RecurrenceRuleModel.rule_id == tmpl.rule_id
            ).first()
            if not rule:
                continue

            ws = max(window_start, tmpl.active_from)
            we = window_end
            if tmpl.active_until:
                we = min(we, tmpl.active_until)
            if ws > we:
                continue

            spec = rule_spec_from_db(rule)
            dates = generate_occurrence_dates(spec, ws, we)

            existing_dates = {
                row.scheduled_date for row in
                self.db.query(OperationOccurrence.scheduled_date).filter(
                    OperationOccurrence.account_id == account_id,
                    OperationOccurrence.template_id == tmpl.template_id,
                    OperationOccurrence.scheduled_date >= ws,
                    OperationOccurrence.scheduled_date <= we,
                ).all()
            }

            for d in dates:
                if d in existing_dates:
                    continue
                self.db.add(OperationOccurrence(
                    account_id=account_id,
                    template_id=tmpl.template_id,
                    scheduled_date=d,
                    status="ACTIVE",
                ))
                count += 1

        if count > 0:
            self.db.commit()
        return count

    def generate_event_occurrences(self, account_id: int) -> int:
        """Generate missing event occurrences for repeating calendar events. Returns count of new rows."""
        events = self.db.query(CalendarEventModel).filter(
            CalendarEventModel.account_id == account_id,
            CalendarEventModel.is_active == True,
            CalendarEventModel.repeat_rule_id != None,
        ).all()

        today = date.today()
        window_start = today
        window_end = today + timedelta(days=90)
        count = 0

        for ev in events:
            rule = self.db.query(RecurrenceRuleModel).filter(
                RecurrenceRuleModel.rule_id == ev.repeat_rule_id
            ).first()
            if not rule:
                continue

            spec = rule_spec_from_db(rule)
            try:
                dates = generate_occurrence_dates(spec, window_start, window_end)
            except ValueError:
                continue

            # Get existing dates for this event with source='rule'
            existing_dates = {
                row.start_date for row in
                self.db.query(EventOccurrenceModel.start_date).filter(
                    EventOccurrenceModel.account_id == account_id,
                    EventOccurrenceModel.event_id == ev.event_id,
                    EventOccurrenceModel.source == "rule",
                    EventOccurrenceModel.start_date >= window_start,
                    EventOccurrenceModel.start_date <= window_end,
                ).all()
            }

            # Load default reminders once per event
            default_reminders = self.db.query(EventDefaultReminderModel).filter(
                EventDefaultReminderModel.event_id == ev.event_id,
                EventDefaultReminderModel.is_enabled == True,
            ).all()

            for d in dates:
                if d in existing_dates:
                    continue
                occ = EventOccurrenceModel(
                    account_id=account_id,
                    event_id=ev.event_id,
                    start_date=d,
                    start_time=None,  # all_day for rule-generated
                    is_cancelled=False,
                    source="rule",
                )
                self.db.add(occ)
                self.db.flush()  # get occ.id for reminders

                # Copy default reminders
                for dr in default_reminders:
                    self.db.add(EventReminderModel(
                        occurrence_id=occ.id,
                        channel=dr.channel,
                        mode=dr.mode,
                        offset_minutes=dr.offset_minutes,
                        fixed_time=dr.fixed_time,
                        is_enabled=dr.is_enabled,
                    ))
                count += 1

        if count > 0:
            self.db.commit()
        return count

    def generate_all(self, account_id: int) -> dict[str, int]:
        """Generate all types of occurrences. Returns dict of counts."""
        return {
            "habits": self.generate_habit_occurrences(account_id),
            "tasks": self.generate_task_occurrences(account_id),
            "operations": self.generate_operation_occurrences(account_id),
            "events": self.generate_event_occurrences(account_id),
        }
