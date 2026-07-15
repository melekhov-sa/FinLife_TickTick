"""
Единая точка работы с Telegram Bot API.

- tg_api()        — низкоуровневый вызов метода Bot API (с опц. прокси:
                    env TELEGRAM_PROXY, т.к. сервер в РФ может требовать обход).
- send_tg()       — отправка уведомления юзеру с учётом его настроек:
                    глобальный тумблер, канал telegram, пер-видовые настройки
                    rule_prefs_json {kind: {enabled, silent}} — silent шлёт
                    сообщение с disable_notification (без звука).
- NOTIF_KINDS     — реестр видов уведомлений для UI настроек.
"""
import logging
import os

import httpx
from sqlalchemy.orm import Session

from app.infrastructure.db.models import TelegramSettings, UserNotificationSettings
from app.infrastructure.crypto import decrypt

logger = logging.getLogger(__name__)

# Виды уведомлений: (code, title). Код = ключ в rule_prefs_json;
# для правил notification_engine код совпадает с rule_code.
NOTIF_KINDS: list[tuple[str, str]] = [
    ("digest_morning", "Утренняя сводка"),
    ("digest_evening", "Вечерняя сводка"),
    ("task_reminder", "Напоминания: задачи"),
    ("event_reminder", "Напоминания: события"),
    ("habit_reminder", "Напоминания: привычки"),
    ("hourly_pending", "Почасовая сводка «не выполнено»"),
    ("PAYMENT_DUE_TOMORROW", "Плановый платёж завтра"),
    ("TASK_OVERDUE", "Просроченные задачи"),
    ("SUB_MEMBER_EXPIRES_SOON", "Подписка истекает"),
    ("SUB_MEMBER_EXPIRED", "Подписка истекла"),
    ("WEEKLY_DIGEST_READY", "Недельный дайджест"),
    ("MEDIA_DATE_APPEARED", "Медиа: появилась дата выхода"),
    ("MEDIA_DATE_CHANGED", "Медиа: дата изменилась"),
    ("MEDIA_NEW_EPISODES", "Медиа: новые серии"),
    ("FOOTBALL_MATCH_NEW", "Футбол: новый матч"),
    ("FOOTBALL_MATCH_RESCHEDULED", "Футбол: перенос матча"),
]

_KIND_CODES = {c for c, _ in NOTIF_KINDS}


def tg_api(bot_token: str, method: str, payload: dict | None = None, timeout: float = 8.0):
    """Вызов метода Bot API. Возвращает httpx.Response или None (сетевая ошибка)."""
    proxy = os.getenv("TELEGRAM_PROXY") or None  # напр. socks5://user:pass@host:port
    try:
        with httpx.Client(proxy=proxy, timeout=timeout) as client:
            return client.post(
                f"https://api.telegram.org/bot{bot_token}/{method}",
                json=payload or {},
            )
    except Exception:
        logger.warning("Telegram API %s network failure", method, exc_info=True)
        return None


def get_pref(prefs: dict | None, kind: str) -> tuple[bool, bool]:
    """(enabled, silent) для вида уведомлений; по умолчанию включено со звуком."""
    p = (prefs or {}).get(kind) or {}
    return bool(p.get("enabled", True)), bool(p.get("silent", False))


def get_user_bot(db: Session, user_id: int) -> tuple[str, str] | None:
    """(bot_token, chat_id) расшифрованные, если телеграм подключён."""
    tg = db.query(TelegramSettings).filter_by(user_id=user_id, connected=True).first()
    if not tg or not tg.bot_token or not tg.chat_id:
        return None
    token = decrypt(tg.bot_token)
    chat_id = decrypt(tg.chat_id)
    if not token or not chat_id:
        return None
    return token, chat_id


def send_tg(db: Session, user_id: int, text: str, kind: str, html: bool = True) -> bool:
    """
    Отправить уведомление вида `kind` с учётом настроек юзера.
    Возвращает True, если сообщение доставлено (или намеренно пропущено
    настройками — False только при реальной ошибке доставки).
    """
    settings = db.query(UserNotificationSettings).filter_by(user_id=user_id).first()
    if settings is not None:
        if not settings.enabled:
            return True
        if not (settings.channels_json or {}).get("telegram", False):
            return True
        enabled, silent = get_pref(settings.rule_prefs_json, kind)
        if not enabled:
            return True
    else:
        silent = False

    creds = get_user_bot(db, user_id)
    if not creds:
        return True  # телеграм не подключён — это не ошибка
    token, chat_id = creds

    payload: dict = {"chat_id": chat_id, "text": text}
    if html:
        payload["parse_mode"] = "HTML"
    if silent:
        payload["disable_notification"] = True

    resp = tg_api(token, "sendMessage", payload)
    if resp is None or resp.status_code != 200:
        logger.warning(
            "Telegram send failed for user_id=%s kind=%s status=%s",
            user_id, kind, getattr(resp, "status_code", "network"),
        )
        return False
    return True
