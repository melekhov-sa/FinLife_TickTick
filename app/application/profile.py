"""
Profile service — user profile data including XP and registration info.
"""
from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from app.application.activity import ActivityReadService
from app.application.xp import XpService
from app.application.xp_analytics import XpAnalyticsService
from app.application.xp_history import XpHistoryService
from app.infrastructure.db.models import User

MSK = timezone(__import__("datetime").timedelta(hours=3))

_LEVEL_TITLES = [
    (12, "Архитектор"),
    (8,  "Стратег"),
    (5,  "Планировщик"),
    (3,  "Контролёр"),
    (1,  "Новичок"),
]


def get_level_title(level: int) -> str:
    """Return the rank title for a given XP level."""
    for threshold, title in _LEVEL_TITLES:
        if level >= threshold:
            return title
    return "Новичок"


def compute_days_in_system(registration_date: date, today: date) -> int:
    """Return whole days elapsed since registration_date (inclusive of today)."""
    delta = today - registration_date
    return max(delta.days, 0)


class ProfileService:
    def __init__(self, db: Session):
        self.db = db

    def get_profile_data(self, user_id: int) -> dict:
        """Return all data needed to render the profile page."""
        user = self.db.query(User).filter(User.id == user_id).first()

        today_msk = datetime.now(MSK).date()

        if user and user.created_at:
            reg_date = user.created_at.date()
            reg_date_str = reg_date.strftime("%d-%m-%Y")
            days_in_system = compute_days_in_system(reg_date, today_msk)
        else:
            reg_date_str = "—"
            days_in_system = 0

        xp = XpService(self.db).get_xp_profile(user_id)
        level_title = get_level_title(xp["level"])
        recent_xp_events = XpHistoryService(self.db).list_recent(user_id, limit=5)

        analytics = XpAnalyticsService(self.db)
        daily_xp = analytics.get_daily_xp_for_month(user_id, today_msk.year, today_msk.month)
        daily_xp_total = sum(d["xp"] for d in daily_xp)
        monthly_xp = analytics.get_monthly_xp_last_n_months(user_id, n=6, today=today_msk)
        current_month_label = analytics.get_current_month_label(today=today_msk)

        activity = ActivityReadService(self.db).get_activity_summary(user_id, today_msk)

        return {
            "email": user.email if user else "",
            "registration_date": reg_date_str,
            "days_in_system": days_in_system,
            "xp": xp,
            "level_title": level_title,
            "recent_xp_events": recent_xp_events,
            "daily_xp": daily_xp,
            "daily_xp_total": daily_xp_total,
            "monthly_xp": monthly_xp,
            "current_month_label": current_month_label,
            "activity": activity,
        }
