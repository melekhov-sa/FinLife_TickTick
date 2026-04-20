"""
Federal non-working holidays of the Russian Federation.

Fixed dates per Labor Code (ТК РФ, ст. 112). Transferred working days
(e.g. a working Saturday before May 1) are handled separately by
production_calendar.py — this module only returns the named holiday
itself.

Returned payload carries a display name, an emoji icon, and a theme
key. The theme key is a semantic label ("winter", "victory", ...) that
the frontend maps to tint/border/badge colors.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import date, timedelta


@dataclass(frozen=True)
class Holiday:
    date: date
    name: str
    icon: str
    theme: str  # frontend theme key

    def to_dict(self) -> dict:
        d = asdict(self)
        d["date"] = self.date.isoformat()
        return d


# (month, day) -> (name, icon, theme)
_RU_FEDERAL: dict[tuple[int, int], tuple[str, str, str]] = {
    # January 1–6 and 8 are Новогодние каникулы; Jan 7 is Рождество Христово
    (1, 1):  ("Новый год", "🎄", "winter"),
    (1, 2):  ("Новогодние каникулы", "🎄", "winter"),
    (1, 3):  ("Новогодние каникулы", "🎄", "winter"),
    (1, 4):  ("Новогодние каникулы", "🎄", "winter"),
    (1, 5):  ("Новогодние каникулы", "🎄", "winter"),
    (1, 6):  ("Новогодние каникулы", "🎄", "winter"),
    (1, 7):  ("Рождество Христово", "✨", "christmas"),
    (1, 8):  ("Новогодние каникулы", "🎄", "winter"),
    (2, 23): ("День защитника Отечества", "🎖️", "military"),
    (3, 8):  ("Международный женский день", "🌷", "rose"),
    (5, 1):  ("Праздник весны и труда", "🌱", "spring"),
    (5, 9):  ("День Победы", "🎗️", "victory"),
    (6, 12): ("День России", "🇷🇺", "tricolor"),
    (11, 4): ("День народного единства", "🤝", "unity"),
}


def get_holiday_ru(d: date) -> Holiday | None:
    """Return the federal holiday for a given date, or None if not a holiday."""
    entry = _RU_FEDERAL.get((d.month, d.day))
    if entry is None:
        return None
    name, icon, theme = entry
    return Holiday(date=d, name=name, icon=icon, theme=theme)


def get_holidays_ru_range(start: date, end: date) -> list[Holiday]:
    """List every federal holiday in [start, end] inclusive."""
    result: list[Holiday] = []
    d = start
    while d <= end:
        h = get_holiday_ru(d)
        if h is not None:
            result.append(h)
        d += timedelta(days=1)
    return result
