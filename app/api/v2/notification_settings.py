"""
Notification settings & Telegram setup — JSON API.

GET  /api/v2/notification-settings          — current settings + telegram status
POST /api/v2/notification-settings          — save preferences
POST /api/v2/notification-settings/telegram — save telegram bot_token + chat_id
POST /api/v2/notification-settings/telegram/test — send test message
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.infrastructure.db.session import get_db
from app.api.v2.deps import get_user_id
from app.infrastructure.db.models import (
    UserNotificationSettings,
    TelegramSettings,
    NotificationRule,
)

router = APIRouter(prefix="/notification-settings", tags=["notification-settings"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class SettingsOut(BaseModel):
    enabled: bool
    quiet_start: str | None
    quiet_end: str | None
    ch_telegram: bool
    ch_email: bool
    telegram_connected: bool
    telegram_chat_id: str | None
    telegram_bot_token_set: bool
    rules: list[dict]


class SettingsIn(BaseModel):
    enabled: bool = True
    quiet_start: str | None = None
    quiet_end: str | None = None
    ch_telegram: bool = False
    ch_email: bool = False


class TelegramIn(BaseModel):
    bot_token: str = ""
    chat_id: str = ""


# ── GET — current settings ────────────────────────────────────────────────────

@router.get("")
def get_settings(request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    s = db.query(UserNotificationSettings).filter_by(user_id=user_id).first()
    tg = db.query(TelegramSettings).filter_by(user_id=user_id).first()
    rules = db.query(NotificationRule).order_by(NotificationRule.id).all()

    channels = (s.channels_json or {}) if s else {}

    return SettingsOut(
        enabled=s.enabled if s else True,
        quiet_start=s.quiet_start.strftime("%H:%M") if s and s.quiet_start else None,
        quiet_end=s.quiet_end.strftime("%H:%M") if s and s.quiet_end else None,
        ch_telegram=channels.get("telegram", False),
        ch_email=channels.get("email", False),
        telegram_connected=tg.connected if tg else False,
        telegram_chat_id=tg.chat_id if tg else None,
        telegram_bot_token_set=bool(tg and tg.bot_token),
        rules=[
            {
                "id": r.id,
                "code": r.code,
                "title": r.title,
                "description": r.description,
                "enabled": r.enabled,
            }
            for r in rules
        ],
    )


# ── POST — save preferences ──────────────────────────────────────────────────

@router.post("")
def save_settings(body: SettingsIn, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    s = db.query(UserNotificationSettings).filter_by(user_id=user_id).first()
    if not s:
        s = UserNotificationSettings(user_id=user_id)
        db.add(s)

    s.enabled = body.enabled
    s.channels_json = {
        "inapp": True,
        "telegram": body.ch_telegram,
        "email": body.ch_email,
    }

    from datetime import time
    if body.quiet_start:
        parts = body.quiet_start.split(":")
        s.quiet_start = time(int(parts[0]), int(parts[1]))
    else:
        s.quiet_start = None

    if body.quiet_end:
        parts = body.quiet_end.split(":")
        s.quiet_end = time(int(parts[0]), int(parts[1]))
    else:
        s.quiet_end = None

    db.commit()
    return {"ok": True}


# ── POST — telegram connect ──────────────────────────────────────────────────

@router.post("/telegram")
def telegram_save(body: TelegramIn, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    tg = db.query(TelegramSettings).filter_by(user_id=user_id).first()
    if not tg:
        tg = TelegramSettings(user_id=user_id)
        db.add(tg)

    tg.bot_token = body.bot_token.strip() or None
    tg.chat_id = body.chat_id.strip() or None
    tg.connected = bool(tg.bot_token and tg.chat_id)
    tg.connected_at = datetime.now(timezone.utc) if tg.connected else None
    db.commit()

    return {"ok": True, "connected": tg.connected}


# ── POST — test telegram message ─────────────────────────────────────────────

@router.post("/telegram/disconnect")
def telegram_disconnect(request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    tg = db.query(TelegramSettings).filter_by(user_id=user_id).first()
    if tg:
        tg.bot_token = None
        tg.chat_id = None
        tg.connected = False
        tg.connected_at = None
        db.commit()
    return {"ok": True, "connected": False}


@router.post("/telegram/test")
def telegram_test(request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    tg = db.query(TelegramSettings).filter_by(user_id=user_id).first()
    if not tg or not tg.bot_token or not tg.chat_id:
        raise HTTPException(400, "Telegram не подключён")

    import httpx
    try:
        r = httpx.post(
            f"https://api.telegram.org/bot{tg.bot_token}/sendMessage",
            json={"chat_id": tg.chat_id, "text": "✅ FinLife: тестовое уведомление работает!"},
            timeout=10,
        )
        if r.status_code != 200:
            raise HTTPException(400, f"Telegram API error: {r.text[:200]}")
    except httpx.TimeoutException:
        raise HTTPException(400, "Telegram не ответил (timeout)")

    return {"ok": True}
