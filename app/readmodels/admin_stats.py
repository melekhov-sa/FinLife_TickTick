"""
Admin statistics readmodel — queries event_log + users for admin panel.

All functions accept a SQLAlchemy Session and return plain dicts/lists.
Timezone: MSK (UTC+3), consistent with the rest of the project.
"""
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, distinct, text, case, literal_column
from sqlalchemy.orm import Session

from app.infrastructure.db.models import User, EventLog

MSK = timezone(timedelta(hours=3))

# Event types that count as "user activity" for DAU/WAU/MAU
_ACTIVITY_EVENT_TYPES = (
    "transaction_created",
    "task_created",
    "task_completed",
    "task_occurrence_completed",
    "habit_occurrence_completed",
    "calendar_event_created",
    "wallet_created",
    "category_created",
    "wish_created",
    "goal_created",
    "budget_month_created",
    "user_logged_in",
)


def get_overview_stats(db: Session, now_msk: datetime) -> dict:
    """Aggregate stats for /admin/overview."""
    today = now_msk.date()
    d7 = today - timedelta(days=7)
    d14 = today - timedelta(days=14)
    d30 = today - timedelta(days=30)

    # ── User counts ──
    total_users = db.query(func.count(User.id)).scalar() or 0
    new_7d = db.query(func.count(User.id)).filter(
        func.date(User.created_at) >= d7
    ).scalar() or 0
    new_30d = db.query(func.count(User.id)).filter(
        func.date(User.created_at) >= d30
    ).scalar() or 0

    # ── DAU / WAU / MAU (distinct users with activity events) ──
    activity_base = db.query(
        EventLog.account_id, func.date(EventLog.occurred_at).label("d")
    ).filter(
        EventLog.event_type.in_(_ACTIVITY_EVENT_TYPES),
    )

    dau = db.query(func.count(distinct(EventLog.account_id))).filter(
        EventLog.event_type.in_(_ACTIVITY_EVENT_TYPES),
        func.date(EventLog.occurred_at) == today,
    ).scalar() or 0

    wau = db.query(func.count(distinct(EventLog.account_id))).filter(
        EventLog.event_type.in_(_ACTIVITY_EVENT_TYPES),
        func.date(EventLog.occurred_at) >= d7,
    ).scalar() or 0

    mau = db.query(func.count(distinct(EventLog.account_id))).filter(
        EventLog.event_type.in_(_ACTIVITY_EVENT_TYPES),
        func.date(EventLog.occurred_at) >= d30,
    ).scalar() or 0

    # ── Retention 14d: users active on 2+ distinct days in last 14 days ──
    sub = (
        db.query(
            EventLog.account_id,
            func.count(distinct(func.date(EventLog.occurred_at))).label("days_active"),
        )
        .filter(
            EventLog.event_type.in_(_ACTIVITY_EVENT_TYPES),
            func.date(EventLog.occurred_at) >= d14,
        )
        .group_by(EventLog.account_id)
        .subquery()
    )
    retention_14d = db.query(func.count()).filter(sub.c.days_active >= 2).scalar() or 0

    # ── Top 10 active users (by event count, 30d) ──
    top_active = (
        db.query(
            EventLog.account_id,
            func.count(EventLog.id).label("cnt"),
        )
        .filter(
            EventLog.event_type.in_(_ACTIVITY_EVENT_TYPES),
            func.date(EventLog.occurred_at) >= d30,
        )
        .group_by(EventLog.account_id)
        .order_by(func.count(EventLog.id).desc())
        .limit(10)
        .all()
    )

    # Resolve emails
    user_ids = [r[0] for r in top_active]
    emails = {}
    if user_ids:
        rows = db.query(User.id, User.email).filter(User.id.in_(user_ids)).all()
        emails = {r[0]: r[1] for r in rows}

    top_active_list = [
        {"user_id": uid, "email": emails.get(uid, f"#{uid}"), "events_30d": cnt}
        for uid, cnt in top_active
    ]

    return {
        "total_users": total_users,
        "new_users_7d": new_7d,
        "new_users_30d": new_30d,
        "dau": dau,
        "wau": wau,
        "mau": mau,
        "retention_14d": retention_14d,
        "top_active_30d": top_active_list,
    }


def get_users_list(db: Session, now_msk: datetime) -> list[dict]:
    """User list with per-user activity counts for /admin/users."""
    today = now_msk.date()
    d7 = today - timedelta(days=7)
    d30 = today - timedelta(days=30)

    users = db.query(User).order_by(User.created_at.desc()).all()
    if not users:
        return []

    user_ids = [u.id for u in users]

    # Activity 7d per user
    act_7d_rows = (
        db.query(EventLog.account_id, func.count(EventLog.id))
        .filter(
            EventLog.account_id.in_(user_ids),
            EventLog.event_type.in_(_ACTIVITY_EVENT_TYPES),
            func.date(EventLog.occurred_at) >= d7,
        )
        .group_by(EventLog.account_id)
        .all()
    )
    act_7d = dict(act_7d_rows)

    # Activity 30d per user
    act_30d_rows = (
        db.query(EventLog.account_id, func.count(EventLog.id))
        .filter(
            EventLog.account_id.in_(user_ids),
            EventLog.event_type.in_(_ACTIVITY_EVENT_TYPES),
            func.date(EventLog.occurred_at) >= d30,
        )
        .group_by(EventLog.account_id)
        .all()
    )
    act_30d = dict(act_30d_rows)

    # Last seen per user (max occurred_at from activity events)
    last_seen_rows = (
        db.query(EventLog.account_id, func.max(EventLog.occurred_at))
        .filter(
            EventLog.account_id.in_(user_ids),
            EventLog.event_type.in_(_ACTIVITY_EVENT_TYPES),
        )
        .group_by(EventLog.account_id)
        .all()
    )
    last_seen_map = dict(last_seen_rows)

    result = []
    for u in users:
        ls = u.last_seen_at or last_seen_map.get(u.id)
        is_active = False
        if ls:
            ls_date = ls.date() if hasattr(ls, 'date') else ls
            is_active = ls_date >= d30

        result.append({
            "user_id": u.id,
            "email": u.email,
            "is_admin": u.is_admin,
            "created_at": u.created_at,
            "last_seen": ls,
            "activity_7d": act_7d.get(u.id, 0),
            "activity_30d": act_30d.get(u.id, 0),
            "is_active": is_active,
        })
    return result


def get_user_detail(db: Session, user_id: int, now_msk: datetime) -> dict | None:
    """Single user details for /admin/users/{id}."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None

    today = now_msk.date()
    d7 = today - timedelta(days=7)
    d14 = today - timedelta(days=14)
    d30 = today - timedelta(days=30)

    activity_7d = db.query(func.count(EventLog.id)).filter(
        EventLog.account_id == user_id,
        EventLog.event_type.in_(_ACTIVITY_EVENT_TYPES),
        func.date(EventLog.occurred_at) >= d7,
    ).scalar() or 0

    activity_30d = db.query(func.count(EventLog.id)).filter(
        EventLog.account_id == user_id,
        EventLog.event_type.in_(_ACTIVITY_EVENT_TYPES),
        func.date(EventLog.occurred_at) >= d30,
    ).scalar() or 0

    # Days with activity in last 14d
    days_14d = db.query(
        func.count(distinct(func.date(EventLog.occurred_at)))
    ).filter(
        EventLog.account_id == user_id,
        EventLog.event_type.in_(_ACTIVITY_EVENT_TYPES),
        func.date(EventLog.occurred_at) >= d14,
    ).scalar() or 0

    # Last seen
    last_seen_event = db.query(func.max(EventLog.occurred_at)).filter(
        EventLog.account_id == user_id,
        EventLog.event_type.in_(_ACTIVITY_EVENT_TYPES),
    ).scalar()
    last_seen = user.last_seen_at or last_seen_event

    return {
        "user_id": user.id,
        "email": user.email,
        "is_admin": user.is_admin,
        "created_at": user.created_at,
        "last_seen": last_seen,
        "activity_7d": activity_7d,
        "activity_30d": activity_30d,
        "active_days_14d": days_14d,
    }


def get_user_activity_feed(db: Session, user_id: int, limit: int = 50) -> list[dict]:
    """Recent activity events for a user."""
    rows = (
        db.query(EventLog)
        .filter(EventLog.account_id == user_id)
        .order_by(EventLog.occurred_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": ev.id,
            "occurred_at": ev.occurred_at,
            "event_type": ev.event_type,
            "payload": ev.payload_json,
            "description": _describe_event(ev.event_type, ev.payload_json),
        }
        for ev in rows
    ]


def _describe_event(event_type: str, payload: dict) -> str:
    """Human-readable short description of an event."""
    _LABELS = {
        "user_logged_in": "Вход в систему",
        "wallet_created": "Создан кошелёк",
        "wallet_renamed": "Переименован кошелёк",
        "wallet_archived": "Кошелёк архивирован",
        "wallet_unarchived": "Кошелёк разархивирован",
        "category_created": "Создана категория",
        "category_updated": "Обновлена категория",
        "category_archived": "Категория архивирована",
        "category_unarchived": "Категория разархивирована",
        "transaction_created": "Создана операция",
        "transaction_deleted": "Удалена операция",
        "transaction_updated": "Обновлена операция",
        "task_created": "Создана задача",
        "task_completed": "Задача выполнена",
        "task_archived": "Задача архивирована",
        "task_uncompleted": "Задача возвращена",
        "task_updated": "Задача обновлена",
        "task_template_created": "Создана повтор. задача",
        "task_occurrence_completed": "Повтор. задача выполнена",
        "habit_created": "Создана привычка",
        "habit_occurrence_completed": "Привычка выполнена",
        "habit_occurrence_uncompleted": "Привычка отменена",
        "calendar_event_created": "Создано событие",
        "calendar_event_updated": "Обновлено событие",
        "wish_created": "Создана хотелка",
        "wish_updated": "Обновлена хотелка",
        "wish_purchased": "Хотелка куплена",
        "goal_created": "Создана цель",
        "goal_achieved": "Цель достигнута",
        "budget_month_created": "Создан бюджет",
        "budget_line_set": "Обновлена строка бюджета",
    }
    label = _LABELS.get(event_type, event_type)

    # Add detail from payload
    title = payload.get("title") or payload.get("name") or ""
    if title:
        label += f": {title}"

    return label
