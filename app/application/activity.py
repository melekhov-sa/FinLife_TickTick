"""
Activity read service — computes the Activity Index and related aggregates.

Activity Index (0–100) measures meaningful user engagement over the last 7
calendar days (MSK).  It is completely independent of the XP / level system.
"""
from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.infrastructure.db.models import UserActivityDaily

SATURATION_POINTS_7D = 70  # points that saturate the index at 100


def compute_activity_index(points_7d: int, saturation: int = SATURATION_POINTS_7D) -> int:
    """Return Activity Index 0–100 for the given 7-day point total."""
    if saturation <= 0:
        return 100 if points_7d > 0 else 0
    return round(min(100, 100 * points_7d / saturation))


class ActivityReadService:
    def __init__(self, db: Session):
        self.db = db

    def get_activity_summary(self, user_id: int, today_date_msk: date) -> dict:
        """
        Return a dict with all activity metrics needed for the profile page.

        Date windows (all inclusive, MSK calendar days):
          - 7d window    : today-6 … today
          - prev 7d window: today-13 … today-7
          - 30d window   : today-29 … today
        """
        today = today_date_msk
        day_7_start = today - timedelta(days=6)
        day_prev_start = today - timedelta(days=13)
        day_prev_end = today - timedelta(days=7)
        day_30_start = today - timedelta(days=29)

        rows = (
            self.db.query(UserActivityDaily)
            .filter(
                UserActivityDaily.user_id == user_id,
                UserActivityDaily.day_date >= day_30_start,
                UserActivityDaily.day_date <= today,
            )
            .all()
        )

        # Partition into windows
        points_7d = sum(r.points for r in rows if r.day_date >= day_7_start)
        points_prev_7d = sum(
            r.points for r in rows
            if day_prev_start <= r.day_date <= day_prev_end
        )
        points_30d_total = sum(r.points for r in rows)

        # Average over exactly 30 days (denominator is always 30)
        points_30d_avg = round(points_30d_total / 30, 1)

        # Best day in the 30-day window
        best_row = max(rows, key=lambda r: r.points, default=None)
        if best_row and best_row.points > 0:
            best_day_date_30d = best_row.day_date.strftime("%d-%m-%Y")
            best_day_points_30d = best_row.points
        else:
            best_day_date_30d = None
            best_day_points_30d = 0

        activity_index = compute_activity_index(points_7d)
        activity_index_prev = compute_activity_index(points_prev_7d)
        trend_delta = activity_index - activity_index_prev

        return {
            "activity_index": activity_index,
            "trend_delta": trend_delta,
            "points_7d": points_7d,
            "points_prev_7d": points_prev_7d,
            "points_30d_total": points_30d_total,
            "points_30d_avg": points_30d_avg,
            "best_day_date_30d": best_day_date_30d,
            "best_day_points_30d": best_day_points_30d,
        }
