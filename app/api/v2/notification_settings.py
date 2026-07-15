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
from app.infrastructure.crypto import encrypt, decrypt
from app.infrastructure.telegram import NOTIF_KINDS, get_pref, tg_api

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
    kinds: list[dict]  # виды уведомлений: {code, title, enabled, silent}


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
        telegram_chat_id=decrypt(tg.chat_id) if tg else None,
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
        kinds=[
            {
                "code": code,
                "title": title,
                "enabled": get_pref(s.rule_prefs_json if s else None, code)[0],
                "silent": get_pref(s.rule_prefs_json if s else None, code)[1],
            }
            for code, title in NOTIF_KINDS
        ],
    )


# ── POST — настройки видов уведомлений (вкл/выкл, без звука) ─────────────────

class KindPref(BaseModel):
    code: str
    enabled: bool = True
    silent: bool = False


class KindsIn(BaseModel):
    kinds: list[KindPref]


@router.post("/kinds")
def save_kinds(body: KindsIn, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    s = db.query(UserNotificationSettings).filter_by(user_id=user_id).first()
    if not s:
        s = UserNotificationSettings(user_id=user_id)
        db.add(s)
    valid = {code for code, _ in NOTIF_KINDS}
    s.rule_prefs_json = {
        k.code: {"enabled": k.enabled, "silent": k.silent}
        for k in body.kinds if k.code in valid
    }
    db.commit()
    return {"ok": True}


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

    raw_token = body.bot_token.strip() or None
    raw_chat_id = body.chat_id.strip() or None
    tg.bot_token = encrypt(raw_token)
    tg.chat_id = encrypt(raw_chat_id)
    tg.connected = bool(raw_token and raw_chat_id)
    tg.connected_at = datetime.now(timezone.utc) if tg.connected else None

    # Команды бота: по умолчанию long-polling (надёжно с РФ-сервера через
    # TELEGRAM_PROXY). Вебхук — только при TELEGRAM_POLLING=0.
    webhook_ok = False
    if raw_token:
        import os
        polling = os.getenv("TELEGRAM_POLLING", "1") != "0"
        if polling:
            tg_api(raw_token, "deleteWebhook")  # getUpdates конфликтует с вебхуком
            tg.webhook_secret = None
            webhook_ok = True
        else:
            import secrets as _secrets
            if not tg.webhook_secret:
                tg.webhook_secret = _secrets.token_urlsafe(32)[:64]
            base = os.getenv("PUBLIC_BASE_URL", "https://centricore.ru").rstrip("/")
            resp = tg_api(raw_token, "setWebhook", {
                "url": f"{base}/api/v2/telegram/webhook/{tg.webhook_secret}",
                "allowed_updates": ["message"],
            })
            webhook_ok = bool(resp is not None and resp.status_code == 200
                              and (resp.json() or {}).get("ok"))
    db.commit()

    return {"ok": True, "connected": tg.connected, "webhook_ok": webhook_ok}


# ── POST — test telegram message ─────────────────────────────────────────────

@router.post("/telegram/disconnect")
def telegram_disconnect(request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    tg = db.query(TelegramSettings).filter_by(user_id=user_id).first()
    if tg:
        if tg.bot_token:
            token = decrypt(tg.bot_token)
            if token:
                tg_api(token, "deleteWebhook")
        tg.bot_token = None
        tg.chat_id = None
        tg.connected = False
        tg.connected_at = None
        tg.webhook_secret = None
        db.commit()
    return {"ok": True, "connected": False}


@router.post("/telegram/test")
def telegram_test(request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    tg = db.query(TelegramSettings).filter_by(user_id=user_id).first()
    if not tg or not tg.bot_token or not tg.chat_id:
        raise HTTPException(400, "Telegram не подключён")

    bot_token = decrypt(tg.bot_token)
    chat_id = decrypt(tg.chat_id)
    if not bot_token or not chat_id:
        raise HTTPException(400, "Не удалось расшифровать Telegram токен")

    import httpx
    try:
        r = httpx.post(
            f"https://api.telegram.org/bot{bot_token}/sendMessage",
            json={"chat_id": chat_id, "text": "✅ FinLife: тестовое уведомление работает!"},
            timeout=10,
        )
        if r.status_code != 200:
            raise HTTPException(400, f"Telegram API error: {r.text[:200]}")
    except httpx.TimeoutException:
        raise HTTPException(400, "Telegram не ответил (timeout)")

    return {"ok": True}
