"""GET /api/v2/profile — user profile data (XP, level, activity)."""
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.infrastructure.db.session import get_db
from app.api.v2.deps import get_user_id
from app.application.profile import ProfileService
from app.infrastructure.db.models import User

router = APIRouter()


@router.get("/profile")
def get_profile(request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request)
    data = ProfileService(db).get_profile_data(user_id)
    user = db.query(User).filter(User.id == user_id).first()

    # Serialize xp daily/monthly (might have complex objects)
    def _ser_list(lst):
        result = []
        for item in (lst or []):
            d = {}
            for k, v in item.items():
                if hasattr(v, "isoformat"):
                    d[k] = v.isoformat()
                else:
                    d[k] = v
            result.append(d)
        return result

    return {
        "email": data["email"],
        "registration_date": data["registration_date"],
        "days_in_system": data["days_in_system"],
        "xp": data["xp"],
        "level_title": data["level_title"],
        "recent_xp_events": _ser_list(data["recent_xp_events"]),
        "daily_xp": data["daily_xp"],
        "daily_xp_total": data["daily_xp_total"],
        "monthly_xp": data["monthly_xp"],
        "current_month_label": data["current_month_label"],
        "activity": data["activity"],
        "theme": user.theme if user else None,
        "enable_task_expense_link": user.enable_task_expense_link if user else False,
        "enable_task_templates": user.enable_task_templates if user else False,
        "enable_task_reschedule_reasons": user.enable_task_reschedule_reasons if user else False,
        "digest_morning": user.digest_morning if user else True,
        "digest_evening": user.digest_evening if user else True,
    }
