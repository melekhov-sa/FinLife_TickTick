"""iCalendar VTODO generation and parsing (no external dependencies)."""
from __future__ import annotations
from datetime import date, datetime, timezone, timedelta
from typing import Sequence
from zoneinfo import ZoneInfo

from app.infrastructure.db.models import TaskModel, TaskReminderModel

PRODID = "-//FinLife//CalDAV//EN"
_DEFAULT_TZ = ZoneInfo("Europe/Moscow")


# ── Generation ─────────────────────────────────────────────────────────────

def task_to_vcalendar(
    task: TaskModel,
    reminders: Sequence[TaskReminderModel] | None = None,
) -> str:
    """Return a VCALENDAR string containing one VTODO for the given task."""
    uid = f"finlife-task-{task.task_id}@finlife"
    lines: list[str] = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:{PRODID}",
        "BEGIN:VTODO",
        f"UID:{uid}",
        f"SUMMARY:{_esc(task.title)}",
    ]
    if task.note:
        lines.append(f"DESCRIPTION:{_esc(task.note)}")
    if task.due_date:
        if task.due_time:
            dt = datetime.combine(task.due_date, task.due_time)
            lines.append(f"DUE:{dt.strftime('%Y%m%dT%H%M%S')}")
        else:
            lines.append(f"DUE;VALUE=DATE:{task.due_date.strftime('%Y%m%d')}")
    if task.status == "DONE":
        lines.append("STATUS:COMPLETED")
        if task.completed_at:
            try:
                ts = task.completed_at.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
                lines.append(f"COMPLETED:{ts}")
            except Exception:
                pass
    else:
        lines.append("STATUS:NEEDS-ACTION")
    if task.created_at:
        try:
            ts = task.created_at.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            lines.append(f"CREATED:{ts}")
        except Exception:
            pass
    for reminder in (reminders or []):
        alarm = _reminder_to_valarm(task, reminder)
        if alarm:
            lines.extend(alarm)
    lines += ["END:VTODO", "END:VCALENDAR"]
    return "\r\n".join(lines) + "\r\n"


def task_etag(task: TaskModel) -> str:
    # Use the most recent modification timestamp so iOS detects status changes.
    stamp = task.completed_at or task.archived_at or task.created_at
    ts = int(stamp.timestamp()) if stamp else 0
    return f'"{task.task_id}-{ts}"'


# ── Parsing ────────────────────────────────────────────────────────────────

def parse_vtodo(ical_text: str) -> dict:
    """Parse a VCALENDAR/VTODO string into a dict of task fields."""
    result: dict = {}
    in_vtodo = False
    # Unfold lines per RFC 5545 §3.1: CRLF + whitespace = continuation
    unfolded: list[str] = []
    for raw in ical_text.splitlines():
        if raw and raw[0] in (" ", "\t") and unfolded:
            unfolded[-1] += raw[1:]  # append without the leading whitespace
        else:
            unfolded.append(raw.rstrip("\r"))

    for line in unfolded:
        line = line.rstrip()
        if line == "BEGIN:VTODO":
            in_vtodo = True
            continue
        if line == "END:VTODO":
            break
        if not in_vtodo or ":" not in line:
            continue
        name_part, _, value = line.partition(":")
        prop = name_part.split(";")[0].upper()
        params_raw = name_part.split(";")[1:]
        params = {}
        for p in params_raw:
            if "=" in p:
                k, v = p.split("=", 1)
                params[k.upper()] = v.upper()

        if prop == "SUMMARY":
            result["title"] = _unesc(value)
        elif prop == "DESCRIPTION":
            result["note"] = _unesc(value) or None
        elif prop == "STATUS":
            result["status"] = "DONE" if value.upper() == "COMPLETED" else "ACTIVE"
        elif prop == "UID":
            result["uid"] = value
        elif prop == "DUE":
            _parse_due(value, params, result)
    return result


def _parse_due(value: str, params: dict, result: dict) -> None:
    if params.get("VALUE") == "DATE" or (len(value) == 8 and value.isdigit()):
        try:
            result["due_date"] = date(int(value[:4]), int(value[4:6]), int(value[6:8]))
            result["due_kind"] = "DATE"
        except Exception:
            pass
    else:
        try:
            clean = value.rstrip("Z")[:15]
            dt = datetime.strptime(clean, "%Y%m%dT%H%M%S")
            result["due_date"] = dt.date()
            result["due_time"] = dt.time()
            result["due_kind"] = "DATETIME"
        except Exception:
            pass


def _reminder_to_valarm(task: TaskModel, reminder: TaskReminderModel) -> list[str] | None:
    """Convert a TaskReminderModel to VALARM lines, or None if not applicable."""
    if reminder.reminder_kind == "OFFSET":
        mins = reminder.offset_minutes
        if task.due_time:
            # Relative trigger: N minutes before DUE datetime (timezone-agnostic)
            return [
                "BEGIN:VALARM",
                "ACTION:DISPLAY",
                "DESCRIPTION:Напоминание",
                f"TRIGGER:-PT{mins}M",
                "END:VALARM",
            ]
        elif task.due_date and mins > 0:
            # Date-only task: absolute trigger at local midnight minus offset
            due_midnight = datetime.combine(task.due_date, datetime.min.time()).replace(tzinfo=_DEFAULT_TZ)
            ts = (due_midnight - timedelta(minutes=mins)).astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            return [
                "BEGIN:VALARM",
                "ACTION:DISPLAY",
                "DESCRIPTION:Напоминание",
                f"TRIGGER;VALUE=DATE-TIME:{ts}",
                "END:VALARM",
            ]
    elif reminder.reminder_kind == "FIXED_TIME" and reminder.fixed_time and task.due_date:
        # Interpret fixed_time as local time (Europe/Moscow)
        trigger_dt = datetime.combine(task.due_date, reminder.fixed_time).replace(tzinfo=_DEFAULT_TZ)
        ts = trigger_dt.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        return [
            "BEGIN:VALARM",
            "ACTION:DISPLAY",
            "DESCRIPTION:Напоминание",
            f"TRIGGER;VALUE=DATE-TIME:{ts}",
            "END:VALARM",
        ]
    return None


def _esc(text: str) -> str:
    return text.replace("\\", "\\\\").replace("\n", "\\n").replace(",", "\\,").replace(";", "\\;")


def _unesc(text: str) -> str:
    return (
        text.replace("\\n", "\n")
        .replace("\\,", ",")
        .replace("\\;", ";")
        .replace("\\\\", "\\")
    )
