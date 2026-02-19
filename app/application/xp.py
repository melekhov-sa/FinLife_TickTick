"""
XpService — query XP profile and rebuild XP projection.
"""
from datetime import datetime, timezone

from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.infrastructure.db.models import UserXpState, XpEvent
from app.readmodels.projectors.xp import XpProjector, compute_level


class XpService:
    def __init__(self, db: Session):
        self.db = db

    def get_xp_profile(self, user_id: int) -> dict:
        """Return full XP profile for a user."""
        state = self.db.query(UserXpState).filter(UserXpState.user_id == user_id).first()

        if state:
            level = state.level
            total_xp = state.total_xp
            current_level_xp = state.current_level_xp
            xp_to_next_level = state.xp_to_next_level
        else:
            level, current_level_xp, xp_to_next_level = 1, 0, 100
            total_xp = 0

        percent_progress = (
            round(current_level_xp / xp_to_next_level * 100, 1)
            if xp_to_next_level > 0 else 0.0
        )

        now = datetime.now(timezone.utc)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        xp_this_month = (
            self.db.query(func.sum(XpEvent.xp_amount))
            .filter(XpEvent.user_id == user_id, XpEvent.created_at >= month_start)
            .scalar() or 0
        )

        xp_record_month = self._xp_record_month(user_id)

        return {
            "level": level,
            "total_xp": total_xp,
            "current_level_xp": current_level_xp,
            "xp_to_next_level": xp_to_next_level,
            "percent_progress": percent_progress,
            "xp_this_month": int(xp_this_month),
            "xp_record_month": xp_record_month,
        }

    def _xp_record_month(self, user_id: int) -> int:
        """Return maximum XP earned in a single calendar month."""
        result = self.db.execute(
            text("""
                SELECT COALESCE(MAX(monthly_xp), 0)
                FROM (
                    SELECT DATE_TRUNC('month', created_at) AS month,
                           SUM(xp_amount) AS monthly_xp
                    FROM xp_events
                    WHERE user_id = :uid
                    GROUP BY DATE_TRUNC('month', created_at)
                ) t
            """),
            {"uid": user_id},
        ).scalar()
        return int(result or 0)

    def rebuild(self, user_id: int) -> int:
        """
        Rebuild XP state from scratch by replaying all relevant events.

        Returns the number of events processed.
        """
        projector = XpProjector(self.db)
        projector.reset(user_id)
        self.db.flush()
        return projector.run(user_id)
