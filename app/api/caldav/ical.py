"""iCalendar VTODO generation and parsing (no external dependencies)."""
from __future__ import annotations
from datetime import date, datetime, timezone

from app.infrastructure.db.models import TaskModel

PRODID = "-//FinLife//CalDAV//EN"


# ── Generation ─────────────────────────────────────────────────────────────

def task_to_vcalendar(task: TaskModel) -> str:
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
    lines += ["END:VTODO", "END:VCALENDAR"]
    return "\r\n".join(lines) + "\r\n"


def task_etag(task: TaskModel) -> str:
    ts = int(task.created_at.timestamp()) if task.created_at else 0
    return f'"{task.task_id}-{ts}"'


# ── Parsing ────────────────────────────────────────────────────────────────

def parse_vtodo(ical_text: str) -> dict:
    """Parse a VCALENDAR/VTODO string into a dict of task fields."""
    result: dict = {}
    in_vtodo = False
    for raw in ical_text.splitlines():
        line = raw.rstrip()
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


def _esc(text: str) -> str:
    return text.replace("\\", "\\\\").replace("\n", "\\n").replace(",", "\\,").replace(";", "\\;")


def _unesc(text: str) -> str:
    return (
        text.replace("\\n", "\n")
        .replace("\\,", ",")
        .replace("\\;", ";")
        .replace("\\\\", "\\")
    )
