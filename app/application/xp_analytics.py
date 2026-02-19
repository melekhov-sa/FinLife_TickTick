"""
XP Analytics service — daily and monthly XP aggregation.
"""
from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.infrastructure.db.models import XpEvent

MSK = timezone(timedelta(hours=3))

_MONTH_NAMES_RU: dict[int, str] = {
    1: "Январь", 2: "Февраль", 3: "Март", 4: "Апрель",
    5: "Май", 6: "Июнь", 7: "Июль", 8: "Август",
    9: "Сентябрь", 10: "Октябрь", 11: "Ноябрь", 12: "Декабрь",
}


class XpAnalyticsService:
    def __init__(self, db: Session):
        self.db = db

    def get_daily_xp_for_month(
        self, user_id: int, year: int, month: int
    ) -> list[dict]:
        """
        Return [{date_str, day, xp}, ...] for every calendar day in the given
        MSK month.  Days with no XP events have xp=0.
        """
        first_day_dt = datetime(year, month, 1, 0, 0, 0, tzinfo=MSK)
        last_day_num = calendar.monthrange(year, month)[1]
        last_day_dt = datetime(year, month, last_day_num, 23, 59, 59, 999999, tzinfo=MSK)

        rows = (
            self.db.query(XpEvent)
            .filter(
                XpEvent.user_id == user_id,
                XpEvent.created_at >= first_day_dt,
                XpEvent.created_at <= last_day_dt,
            )
            .all()
        )

        day_totals: dict[int, int] = {}
        for ev in rows:
            d = self._to_msk_date(ev.created_at)
            day_totals[d.day] = day_totals.get(d.day, 0) + ev.xp_amount

        result = []
        for day in range(1, last_day_num + 1):
            d = date(year, month, day)
            result.append({
                "date_str": d.strftime("%d-%m-%Y"),
                "day": day,
                "xp": day_totals.get(day, 0),
            })
        return result

    def get_monthly_xp_last_n_months(
        self, user_id: int, n: int = 6, today: date | None = None
    ) -> list[dict]:
        """
        Return [{year, month, month_name, xp}, ...] for the last n calendar
        months (newest first).  Months with no events have xp=0.
        """
        if today is None:
            today = datetime.now(MSK).date()

        # Build list of (year, month) pairs, newest first
        months: list[tuple[int, int]] = []
        y, m = today.year, today.month
        for _ in range(n):
            months.append((y, m))
            m -= 1
            if m == 0:
                m, y = 12, y - 1

        oldest_y, oldest_m = months[-1]
        since_dt = datetime(oldest_y, oldest_m, 1, 0, 0, 0, tzinfo=MSK)

        rows = (
            self.db.query(XpEvent)
            .filter(
                XpEvent.user_id == user_id,
                XpEvent.created_at >= since_dt,
            )
            .all()
        )

        month_totals: dict[tuple[int, int], int] = {}
        for ev in rows:
            d = self._to_msk_date(ev.created_at)
            key = (d.year, d.month)
            month_totals[key] = month_totals.get(key, 0) + ev.xp_amount

        return [
            {
                "year": yr,
                "month": mo,
                "month_name": _MONTH_NAMES_RU[mo],
                "xp": month_totals.get((yr, mo), 0),
            }
            for yr, mo in months
        ]

    def get_current_month_label(self, today: date | None = None) -> str:
        """Return a localised label, e.g. 'Февраль 2026'."""
        if today is None:
            today = datetime.now(MSK).date()
        return f"{_MONTH_NAMES_RU[today.month]} {today.year}"

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _to_msk_date(self, dt: datetime) -> date:
        """Convert a datetime (tz-naive assumed UTC) to an MSK calendar date."""
        if dt is None:
            return datetime.now(MSK).date()
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(MSK).date()
