"""
Long-polling Telegram-ботов: getUpdates для каждого юзера с токеном.

Основной режим получения команд на РФ-сервере: исходящие запросы идут
через TELEGRAM_PROXY (см. infrastructure/telegram.py), а вебхук
Telegram→сервер может быть недоступен из-за блокировок.

Смещение подтверждённых апдейтов хранится в telegram_settings.poll_offset,
поэтому рестарт контейнера не приводит к повторной обработке команд.
"""
import logging

from sqlalchemy.orm import Session

from app.infrastructure.db.models import TelegramSettings
from app.infrastructure.crypto import decrypt
from app.infrastructure.telegram import tg_api
from app.application.telegram_commands import handle_update

logger = logging.getLogger(__name__)


def poll_telegram_updates(db: Session) -> int:
    """Один цикл поллинга всех ботов. Возвращает число обработанных апдейтов."""
    rows = (
        db.query(TelegramSettings)
        .filter(TelegramSettings.bot_token.isnot(None))
        .all()
    )
    handled = 0
    for tg in rows:
        token = decrypt(tg.bot_token)
        if not token:
            continue

        resp = tg_api(token, "getUpdates", {
            "offset": (tg.poll_offset or 0) + 1,
            "timeout": 0,
            "allowed_updates": ["message"],
        }, timeout=15)
        if resp is None:
            continue

        if resp.status_code == 409:
            # Активен вебхук — снимаем, поллинг главнее
            tg_api(token, "deleteWebhook")
            continue
        if resp.status_code != 200:
            logger.warning(
                "getUpdates failed for user_id=%s: %s", tg.user_id, resp.status_code
            )
            continue

        data = resp.json() or {}
        if not data.get("ok"):
            continue

        for upd in data.get("result", []):
            upd_id = int(upd.get("update_id") or 0)
            if upd_id > (tg.poll_offset or 0):
                tg.poll_offset = upd_id
            try:
                handle_update(db, tg, upd)
                handled += 1
            except Exception:
                logger.exception("Polling update failed for user_id=%s", tg.user_id)
        db.commit()
    return handled
