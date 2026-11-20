"""
Доставка уведомления одним каналом, без задвоения.

Раньше одно событие приходило дважды, а то и трижды: телеграмом, web-push'ем
и бейджем колокольчика. Информации от этого не прибавлялось, а шума —
прибавлялось. Теперь телеграм основной, push — запасной: он уходит только
если телеграм не доставил (не привязан, выключен настройками или ошибка).
"""
import logging

from sqlalchemy.orm import Session

from app.application.push_service import send_push_to_user
from app.infrastructure.telegram import TG_SENT, send_tg

logger = logging.getLogger(__name__)

VIA_TELEGRAM = "telegram"
VIA_PUSH = "push"
VIA_NONE = "none"


def deliver(
    db: Session,
    user_id: int,
    *,
    kind: str,
    title: str,
    body: str,
    url: str = "/",
) -> str:
    """Доставить одно уведомление. Возвращает использованный канал."""
    try:
        status = send_tg(db, user_id, f"<b>{title}</b>\n{body}", kind)
    except Exception:
        logger.exception("telegram delivery crashed for user_id=%s kind=%s", user_id, kind)
        status = None

    if status == TG_SENT:
        return VIA_TELEGRAM

    try:
        n = send_push_to_user(db, user_id, {"title": title, "body": body, "url": url})
    except Exception:
        logger.exception("push delivery crashed for user_id=%s kind=%s", user_id, kind)
        return VIA_NONE

    return VIA_PUSH if n else VIA_NONE
