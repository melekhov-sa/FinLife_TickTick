"""
Russian Production Calendar — xmlcalendar.ru integration.

Provides get_day_types(start, end) -> dict[date, str] where values are:
  "work"        — normal working day
  "weekend"     — Saturday/Sunday (not overridden)
  "holiday"     — public holiday or day off by government decree
  "preholiday"  — shortened pre-holiday working day

Resolution order per year:
  1. In-memory cache (thread-safe dict, per-process, reset on restart)
  2. Persistent DB cache (production_calendar_cache table, survives restarts)
  3. Network fetch from https://xmlcalendar.ru/data/ru/{year}/calendar.json
  4. Fallback to weekday-based logic (Sat/Sun = weekend, else work)

The scheduler job calendar_refresh (weekly) keeps the DB cache fresh.
"""

from __future__ import annotations

import logging
import threading
from datetime import date, datetime, timedelta, timezone
from typing import Dict

import httpx

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
# In-memory cache (process-local): { year: { date: day_type_str } }
# --------------------------------------------------------------------------- #
_cache: Dict[int, Dict[date, str]] = {}
_cache_lock = threading.Lock()

_FETCH_TIMEOUT_SEC = 3.0
_UA = "CentriCore/1.0 (+https://centricore.ru)"

DayType = str  # "work" | "weekend" | "holiday" | "preholiday"


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #

def get_day_types(start: date, end: date) -> Dict[date, DayType]:
    """Return a mapping of every date in [start, end] to its day type."""
    years_needed: set[int] = set()
    d = start
    while d <= end:
        years_needed.add(d.year)
        d += timedelta(days=1)

    # Load missing years under the lock
    for year in years_needed:
        with _cache_lock:
            if year in _cache:
                continue
        loaded = _load_year(year)
        with _cache_lock:
            _cache.setdefault(year, loaded)

    result: Dict[date, DayType] = {}
    d = start
    while d <= end:
        with _cache_lock:
            year_data = _cache.get(d.year, {})
        result[d] = year_data.get(d, _weekday_fallback(d))
        d += timedelta(days=1)

    return result


def refresh_year(year: int) -> bool:
    """Force a refresh for one year: fetch from network and update DB + memory cache.

    Returns True on successful fetch+write, False if network failed (in which case
    existing DB data, if any, stays intact).
    """
    try:
        data = _fetch_json(year)
        parsed = _parse_calendar(year, data)
    except Exception as exc:  # noqa: BLE001
        logger.warning("production_calendar: refresh failed for year %d — %s", year, exc)
        return False

    _save_to_db(year, parsed)
    with _cache_lock:
        _cache[year] = parsed
    logger.info("production_calendar: refreshed year %d (%d entries)", year, len(parsed))
    return True


def clear_cache() -> None:
    """Clear in-memory cache (used in tests)."""
    with _cache_lock:
        _cache.clear()


# --------------------------------------------------------------------------- #
# Per-year loading: DB → network → empty dict (fallback kicks in at read time)
# --------------------------------------------------------------------------- #

def _load_year(year: int) -> Dict[date, DayType]:
    """Resolve a year: DB cache first, then network, then empty (weekday fallback)."""
    # 1. Try persistent DB cache
    cached = _load_from_db(year)
    if cached:
        return cached

    # 2. Fetch from network
    try:
        data = _fetch_json(year)
        parsed = _parse_calendar(year, data)
        _save_to_db(year, parsed)
        return parsed
    except Exception as exc:  # noqa: BLE001
        logger.warning("production_calendar: network fetch failed for year %d — %s", year, exc)
        return {}


def _load_from_db(year: int) -> Dict[date, DayType] | None:
    """Read cached year from DB. Returns None on any failure (no such table, no row, bad data)."""
    try:
        from app.infrastructure.db.session import get_session_factory
        from app.infrastructure.db.models import ProductionCalendarCache
        Session = get_session_factory()
        db = Session()
        try:
            row = db.query(ProductionCalendarCache).filter_by(year=year).first()
            if not row or not row.day_types_json:
                return None
            return _deserialize(row.day_types_json)
        finally:
            db.close()
    except Exception:
        logger.debug("production_calendar: DB cache read failed for year %d", year, exc_info=True)
        return None


def _save_to_db(year: int, day_types: Dict[date, DayType]) -> None:
    """Upsert cached year to DB. Silent on failure."""
    if not day_types:
        return
    try:
        from app.infrastructure.db.session import get_session_factory
        from app.infrastructure.db.models import ProductionCalendarCache
        Session = get_session_factory()
        db = Session()
        try:
            serialized = {d.isoformat(): t for d, t in day_types.items()}
            row = db.query(ProductionCalendarCache).filter_by(year=year).first()
            if row:
                row.day_types_json = serialized
                row.fetched_at = datetime.now(tz=timezone.utc)
            else:
                db.add(ProductionCalendarCache(year=year, day_types_json=serialized))
            db.commit()
        finally:
            db.close()
    except Exception:
        logger.warning("production_calendar: DB cache write failed for year %d", year, exc_info=True)


def _deserialize(json_data: dict) -> Dict[date, DayType]:
    result: Dict[date, DayType] = {}
    for date_str, day_type in (json_data or {}).items():
        try:
            result[date.fromisoformat(date_str)] = day_type
        except (ValueError, TypeError):
            continue
    return result


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def _weekday_fallback(d: date) -> DayType:
    return "weekend" if d.weekday() >= 5 else "work"


def _fetch_json(year: int) -> dict:
    """Fetch calendar JSON from xmlcalendar.ru."""
    url = f"https://xmlcalendar.ru/data/ru/{year}/calendar.json"
    resp = httpx.get(
        url,
        timeout=_FETCH_TIMEOUT_SEC,
        follow_redirects=True,
        headers={"User-Agent": _UA},
    )
    resp.raise_for_status()
    return resp.json()


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
                try:
                    d = date(year, month_num, int(token[:-1]))
                except ValueError:
                    continue
                result[d] = "preholiday"

            elif token.endswith("+"):
                try:
                    d = date(year, month_num, int(token[:-1]))
                except ValueError:
                    continue
                result[d] = "work"

            else:
                try:
                    d = date(year, month_num, int(token))
                except ValueError:
                    continue
                # Sat/Sun without decree → weekend; weekday → holiday by decree
                result[d] = "weekend" if d.weekday() >= 5 else "holiday"

    return result
