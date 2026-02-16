"""
Deterministic recurrence occurrence generator.

Uses date only (no timezone). Ported from FinLife OS core/recurrence/generator.py + from_db.py.

Frequencies:
- DAILY: every N days
- WEEKLY: specific weekdays every N weeks
- MONTHLY: specific day of month every N months
- YEARLY: specific month+day every N years
- INTERVAL_DAYS: alias for DAILY with arbitrary interval
- MULTI_DATE: explicit list of dates
"""
import json
import calendar
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Set


WEEKDAY_MAP = {"MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6}
VALID_FREQ = frozenset({"DAILY", "WEEKLY", "MONTHLY", "YEARLY", "INTERVAL_DAYS", "MULTI_DATE", "ONETIME"})


@dataclass(frozen=True)
class RuleSpec:
    freq: str
    interval: int
    start_date: date
    until_date: date | None
    count: int | None
    by_weekday: Set[int] | None  # WEEKLY only (MO=0..SU=6)
    by_monthday: int | None  # MONTHLY only, 1..31
    monthday_clip_to_last_day: bool
    by_month: int | None  # YEARLY only, 1..12
    by_monthday_for_year: int | None  # YEARLY only, 1..31
    dates: list[date] | None  # MULTI_DATE only


def last_day_of_month(year: int, month: int) -> int:
    return calendar.monthrange(year, month)[1]


def add_months(d: date, n: int) -> date:
    month = d.month - 1 + n
    year = d.year + month // 12
    month = month % 12 + 1
    last = last_day_of_month(year, month)
    day = min(d.day, last)
    return date(year, month, day)


def _validate_rule(rule: RuleSpec, window_start: date, window_end: date) -> None:
    if rule.interval < 1:
        raise ValueError("interval must be >= 1")
    if window_start > window_end:
        raise ValueError("window_start must be <= window_end")
    if rule.freq not in VALID_FREQ:
        raise ValueError(f"invalid freq: {rule.freq}")
    if rule.count is not None and rule.count < 1:
        raise ValueError("count must be >= 1 when set")
    # ONETIME doesn't require any specific params
    if rule.freq == "ONETIME":
        return
    if rule.freq == "WEEKLY" and not rule.by_weekday:
        raise ValueError("WEEKLY requires by_weekday")
    if rule.freq == "MONTHLY" and rule.by_monthday is None:
        raise ValueError("MONTHLY requires by_monthday")
    if rule.freq == "YEARLY" and (rule.by_month is None or rule.by_monthday_for_year is None):
        raise ValueError("YEARLY requires by_month and by_monthday_for_year")
    if rule.freq == "MULTI_DATE" and rule.dates is None:
        raise ValueError("MULTI_DATE requires dates")


def _apply_until_count(dates: list[date], rule: RuleSpec) -> list[date]:
    out = dates
    if rule.until_date is not None:
        out = [d for d in out if d <= rule.until_date]
    if rule.count is not None:
        out = out[:rule.count]
    return out


def _daily_or_interval(rule: RuleSpec, window_start: date, window_end: date) -> list[date]:
    out: list[date] = []
    d = rule.start_date
    while d <= window_end:
        if d >= window_start:
            out.append(d)
        if rule.count is not None and len(out) >= rule.count:
            break
        if rule.until_date is not None and d >= rule.until_date:
            break
        d += timedelta(days=rule.interval)
    return _apply_until_count(out, rule)


def _weekly(rule: RuleSpec, window_start: date, window_end: date) -> list[date]:
    wd = rule.start_date.weekday()
    monday0 = rule.start_date - timedelta(days=wd)
    out: list[date] = []
    k = 0
    while True:
        week_monday = monday0 + timedelta(days=k * 7 * rule.interval)
        if week_monday > window_end:
            break
        for dow in rule.by_weekday or set():
            d = week_monday + timedelta(days=dow)
            if d < rule.start_date:
                continue
            if d > window_end:
                continue
            if d >= window_start:
                out.append(d)
        if rule.count is not None and len(out) >= rule.count:
            break
        k += 1
    out.sort()
    return _apply_until_count(out, rule)


def _monthly(rule: RuleSpec, window_start: date, window_end: date) -> list[date]:
    by_md = rule.by_monthday or 0
    out: list[date] = []
    k = 0
    while True:
        base = add_months(rule.start_date.replace(day=1), k * rule.interval)
        last = last_day_of_month(base.year, base.month)
        if rule.monthday_clip_to_last_day:
            day = min(by_md, last)
        else:
            if by_md > last:
                k += 1
                continue
            day = by_md
        d = date(base.year, base.month, day)
        if d < rule.start_date:
            k += 1
            continue
        if d > window_end:
            break
        if d >= window_start:
            out.append(d)
        if rule.count is not None and len(out) >= rule.count:
            break
        if rule.until_date is not None and d >= rule.until_date:
            break
        k += 1
    return _apply_until_count(out, rule)


def _yearly(rule: RuleSpec, window_start: date, window_end: date) -> list[date]:
    by_m = rule.by_month or 1
    by_md = rule.by_monthday_for_year or 1
    out: list[date] = []
    k = 0
    while True:
        y = rule.start_date.year + k * rule.interval
        last = last_day_of_month(y, by_m)
        day = min(by_md, last)
        d = date(y, by_m, day)
        if d < rule.start_date:
            k += 1
            continue
        if d > window_end:
            break
        if d >= window_start:
            out.append(d)
        if rule.count is not None and len(out) >= rule.count:
            break
        if rule.until_date is not None and d >= rule.until_date:
            break
        k += 1
    return _apply_until_count(out, rule)


def _multi_date(rule: RuleSpec, window_start: date, window_end: date) -> list[date]:
    dates = rule.dates or []
    out = [d for d in dates if d >= rule.start_date and window_start <= d <= window_end]
    if rule.until_date is not None:
        out = [d for d in out if d <= rule.until_date]
    out = sorted(set(out))
    if rule.count is not None:
        out = out[:rule.count]
    return out


def generate_occurrence_dates(
    rule: RuleSpec,
    window_start: date,
    window_end: date,
) -> list[date]:
    """Generate occurrence dates in [window_start, window_end] (inclusive).
    Deterministic, sorted ascending."""
    _validate_rule(rule, window_start, window_end)

    if rule.freq == "ONETIME":
        # One-time occurrence: return only start_date if it's in window
        if window_start <= rule.start_date <= window_end:
            return [rule.start_date]
        return []
    if rule.freq in ("DAILY", "INTERVAL_DAYS"):
        return _daily_or_interval(rule, window_start, window_end)
    if rule.freq == "WEEKLY":
        return _weekly(rule, window_start, window_end)
    if rule.freq == "MONTHLY":
        return _monthly(rule, window_start, window_end)
    if rule.freq == "YEARLY":
        return _yearly(rule, window_start, window_end)
    if rule.freq == "MULTI_DATE":
        return _multi_date(rule, window_start, window_end)
    raise ValueError(f"unhandled freq: {rule.freq}")


# --- Helpers for converting DB rows to RuleSpec ---

def parse_by_weekday(s: str | None) -> Set[int] | None:
    """Parse comma-separated weekday string (e.g. 'MO,TU,FR') to set of ints."""
    if not s or not s.strip():
        return None
    out: Set[int] = set()
    for part in s.strip().upper().split(","):
        part = part.strip()
        if part in WEEKDAY_MAP:
            out.add(WEEKDAY_MAP[part])
    return out if out else None


def parse_dates_json(s: str | None) -> list[date] | None:
    """Parse JSON array of date strings to list of dates."""
    if s is None or not s.strip():
        return None
    try:
        raw = json.loads(s)
    except (json.JSONDecodeError, TypeError) as e:
        raise ValueError(f"invalid dates_json: {e}") from e
    if not isinstance(raw, list):
        raise ValueError("dates_json must be a JSON array")
    out: list[date] = []
    for item in raw:
        if not isinstance(item, str):
            raise ValueError("dates_json must contain string dates YYYY-MM-DD")
        out.append(date.fromisoformat(item.strip()[:10]))
    return sorted(set(out))


def rule_spec_from_db(row) -> RuleSpec:
    """Build RuleSpec from a RecurrenceRuleModel DB row (any object with matching attributes)."""
    by_month = row.by_month
    by_monthday_for_year = row.by_monthday_for_year

    # YEARLY: infer missing by_month / by_monthday_for_year from start_date
    if row.freq == "YEARLY":
        if by_month is None and row.start_date:
            by_month = row.start_date.month
        if by_monthday_for_year is None:
            by_monthday_for_year = row.by_monthday or (row.start_date.day if row.start_date else None)

    return RuleSpec(
        freq=row.freq,
        interval=row.interval,
        start_date=row.start_date,
        until_date=row.until_date,
        count=row.count,
        by_weekday=parse_by_weekday(row.by_weekday),
        by_monthday=row.by_monthday,
        monthday_clip_to_last_day=bool(row.monthday_clip_to_last_day),
        by_month=by_month,
        by_monthday_for_year=by_monthday_for_year,
        dates=parse_dates_json(row.dates_json),
    )
