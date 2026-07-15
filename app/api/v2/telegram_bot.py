"""
Telegram-бот: вебхук (альтернатива long-polling).

POST /api/v2/telegram/webhook/{secret} — приём апдейтов от Telegram.
Секрет генерируется при сохранении токена; юзер ищется по нему,
поэтому эндпоинт без JWT-авторизации (Telegram не умеет наши заголовки).

По умолчанию бот работает через long-polling (TELEGRAM_POLLING=1),
т.к. с РФ-сервера прямой доступ Telegram→сервер может не работать;
вебхук остаётся для окружений, где он доступен (TELEGRAM_POLLING=0).
Логика команд общая — app/application/telegram_commands.handle_update.
"""
import logging

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.infrastructure.db.session import get_db
from app.infrastructure.db.models import TelegramSettings
from app.application.telegram_commands import handle_update

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/telegram", tags=["telegram-bot"])


@router.post("/webhook/{secret}")
def telegram_webhook(secret: str, update: dict, request: Request, db: Session = Depends(get_db)):
    tg = db.query(TelegramSettings).filter_by(webhook_secret=secret).first()
    if not tg or not tg.bot_token:
        # Неизвестный секрет — отвечаем 200, чтобы Telegram не ретраил вечно
        return {"ok": True}
    try:
        handle_update(db, tg, update)
    except Exception:
        logger.exception("Webhook update failed")
    return {"ok": True}
