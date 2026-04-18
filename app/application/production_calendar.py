"""
Russian Production Calendar — xmlcalendar.ru integration.

Provides get_day_types(start, end) -> dict[date, str] where values are:
  "work"        — normal working day
  "weekend"     — Saturday/Sunday (not overridden)
  "holiday"     — public holiday or day off by government decree
  "preholiday"  — shortened pre-holiday working day

Data is fetched from https://xmlcalendar.ru/data/ru/{year}/calendar.json
and cached in memory per calendar year (data is stable within a year).

Falls back to weekday-based logic (Sat/Sun = weekend, else work) if the
external source is unavailable or returns unexpected data.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Dict

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
# In-memory cache: { year: { date: day_type_str } }
# --------------------------------------------------------------------------- #
_cache: Dict[int, Dict[date, str]] = {}

DayType = str  # "work" | "weekend" | "holiday" | "preholiday"


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #

def get_day_types(start: date, end: date) -> Dict[date, DayType]:
    """Return a mapping of every date in [start, end] to its day type."""
    result: Dict[date, DayType] = {}

    # Collect years we need
    years_needed: set[int] = set()
    d = start
    while d <= end:
        years_needed.add(d.year)
        d += timedelta(days=1)

    for year in years_needed:
        if year not in _cache:
            _cache[year] = _load_year(year)

    d = start
    while d <= end:
        result[d] = _cache[d.year].get(d, _weekday_fallback(d))
        d += timedelta(days=1)

    return result


def clear_cache() -> None:
    """Clear in-memory cache (used in tests)."""
    _cache.clear()


# --------------------------------------------------------------------------- #
# Internals
# --------------------------------------------------------------------------- #

def _weekday_fallback(d: date) -> DayType:
    return "weekend" if d.weekday() >= 5 else "work"


def _load_year(year: int) -> Dict[date, DayType]:
    """Fetch and parse calendar for the given year; fallback on any error."""
    try:
        data = _fetch_json(year)
        return _parse_calendar(year, data)
    except Exception as exc:  # noqa: BLE001
        logger.warning("production_calendar: failed to load year %d — %s", year, exc)
        return {}


def _fetch_json(year: int) -> dict:
    """Fetch JSON from xmlcalendar.ru using httpx (available) or urllib fallback."""
    url = f"https://xmlcalendar.ru/data/ru/{year}/calendar.json"

    try:
        import httpx  # type: ignore
        resp = httpx.get(url, timeout=5.0, follow_redirects=True)
        resp.raise_for_status()
        return resp.json()
    except ImportError:
        pass

    # urllib fallback (stdlib)
    import json
    import urllib.request
    with urllib.request.urlopen(url, timeout=5) as r:  # noqa: S310
        return json.loads(r.read().decode())


def _parse_calendar(year: int, data: dict) -> Dict[date, DayType]:
    """
    Parse xmlcalendar.ru JSON into {date: day_type}.

    Format:
      months[].month  — 1-based month number
      months[].days   — comma-separated day tokens:
          "N"   → non-working day (holiday or regular weekend)
          "N*"  → pre-holiday shortened working day
          "N+"  → working day override (e.g. moved Saturday becomes workday)
    """
    result: Dict[date, DayType] = {}

    months = data.get("months") or []
    for month_entry in months:
        month_num = month_entry.get("month")
        days_str = month_entry.get("days", "")
        if not month_num or not days_str:
            continue

        for token in days_str.split(","):
            token = token.strip()
            if not token:
                continue

            if token.endswith("*"):
                day_num = int(token[:-1])
                try:
                    d = date(year, month_num, day_num)
                except ValueError:
                    continue
                result[d] = "preholiday"

            elif token.endswith("+"):
                # This day is a working day despite being Sat/Sun (transfer)
                day_num = int(token[:-1])
                try:
                    d = date(year, month_num, day_num)
                except ValueError:
                    continue
                result[d] = "work"

            else:
                # Plain number — non-working day
                try:
                    day_num = int(token)
                except ValueError:
                    continue
                try:
                    d = date(year, month_num, day_num)
                except ValueError:
                    continue

                # Distinguish holiday vs regular weekend:
                # If the day falls on Sat/Sun it's a regular weekend;
                # if it's a weekday it was made non-working by decree (holiday).
                if d.weekday() >= 5:
                    result[d] = "weekend"
                else:
                    result[d] = "holiday"

    return result
