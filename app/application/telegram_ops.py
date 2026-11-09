"""Ввод операций через телеграм-бота: текст → разбор → подтверждение.

Зачем отдельным модулем: логика команд в telegram_commands.py и так немаленькая,
а здесь свой сценарий с кнопками и состоянием между сообщениями.

Как это работает:
  1. Пользователь пишет боту «кофе 300 альфа» (любой текст не-команду).
  2. Разбираем тем же парсером, что и быстрый ввод в приложении, — он знает
     справочники пользователя и умеет банковские СМС.
  3. Показываем, что получилось, с кнопками «Сохранить» и «Отмена».
  4. По кнопке создаём операции и дообучаем правила мерчантов.

Состояние между сообщением и нажатием кнопки хранится в ai_parse_logs: там уже
лежат предложения, и его id помещается в callback_data (лимит Telegram — 64 байта).
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.application.ai_ops_parser import parse_operations, learn_from_confirmation
from app.application.app_config import get_openai_key
from app.config import get_settings
from app.infrastructure.db.models import (
    AiParseLog,
    CategoryInfo,
    WalletBalance,
)
from app.infrastructure.telegram import tg_api

logger = logging.getLogger(__name__)

CB_PREFIX = "op"          # callback_data: op:save:<id> / op:skip:<id>
MAX_TEXT = 1000


# ── Отрисовка предложения ─────────────────────────────────────────────────────

def _type_label(op_type: str) -> str:
    return {"EXPENSE": "Расход", "INCOME": "Доход", "TRANSFER": "Перевод"}.get(op_type, op_type)


def _fmt_amount(raw: str | None) -> str:
    if not raw:
        return "сумма не распознана"
    try:
        value = Decimal(str(raw))
    except (InvalidOperation, ValueError):
        return str(raw)
    whole = f"{value:,.0f}".replace(",", " ")
    return f"{whole} ₽"


def _name(db: Session, model, id_field, title_field, oid: int | None) -> str | None:
    if not oid:
        return None
    row = db.query(title_field).filter(id_field == oid).first()
    return row[0] if row else None


def render_proposals(db: Session, proposals: list[dict]) -> str:
    """Человеческий текст предложения — то, что пользователь подтверждает."""
    lines: list[str] = []
    for i, p in enumerate(proposals, 1):
        head = f"<b>{_type_label(p.get('operation_type', ''))} · {_fmt_amount(p.get('amount'))}</b>"
        if len(proposals) > 1:
            head = f"{i}. {head}"
        lines.append(head)

        cat = _name(db, CategoryInfo, CategoryInfo.category_id, CategoryInfo.title, p.get("category_id"))
        wal = _name(db, WalletBalance, WalletBalance.wallet_id, WalletBalance.title, p.get("wallet_id"))
        lines.append(f"   Статья: {cat or '— не распознана'}")
        lines.append(f"   Кошелёк: {wal or '— не распознан'}")
        if p.get("description"):
            lines.append(f"   Описание: {p['description']}")
        lines.append("")
    return "\n".join(lines).strip()


def _keyboard(parse_id: int) -> dict:
    return {
        "inline_keyboard": [[
            {"text": "✅ Сохранить", "callback_data": f"{CB_PREFIX}:save:{parse_id}"},
            {"text": "✖️ Отмена", "callback_data": f"{CB_PREFIX}:skip:{parse_id}"},
        ]]
    }


# ── Шаг 1: разобрать текст и предложить ───────────────────────────────────────

def offer_from_text(db: Session, account_id: int, bot_token: str, chat_id, text: str) -> bool:
    """Разобрать текст и отправить предложение с кнопками.

    Возвращает False, если распознать не удалось — тогда вызывающий код
    показывает обычную справку, как и раньше.
    """
    text = text.strip()[:MAX_TEXT]
    if not text:
        return False

    try:
        result = parse_operations(db, account_id, text, get_openai_key(db))
    except Exception:
        logger.exception("ai parse failed for user_id=%s", account_id)
        return False

    proposals = result.get("proposals") or []
    # Без суммы сохранять нечего — пусть лучше покажется справка.
    proposals = [p for p in proposals if p.get("amount")]
    if not proposals:
        return False

    log = AiParseLog(
        account_id=account_id,
        source_text=text,
        proposals_json=json.dumps(proposals, ensure_ascii=False),
        engine=result.get("engine", "llm"),
    )
    db.add(log)
    db.commit()
    db.refresh(log)

    tg_api(bot_token, "sendMessage", {
        "chat_id": chat_id,
        "text": render_proposals(db, proposals) + "\n\nСохранить?",
        "parse_mode": "HTML",
        "reply_markup": _keyboard(log.id),
    })
    return True


# ── Шаг 2: нажата кнопка ──────────────────────────────────────────────────────

def _save_one(db: Session, account_id: int, p: dict) -> int | None:
    """Создать одну операцию. Возвращает transaction_id или None."""
    from app.application.transactions import CreateTransactionUseCase

    wallet_id = p.get("wallet_id")
    if not wallet_id or not p.get("amount"):
        return None
    wallet = db.query(WalletBalance).filter(WalletBalance.wallet_id == wallet_id).first()
    if not wallet or wallet.account_id != account_id:
        return None

    amount = Decimal(str(p["amount"]))
    op_type = p.get("operation_type")
    uc = CreateTransactionUseCase(db)
    common = dict(
        account_id=account_id,
        wallet_id=wallet_id,
        amount=amount,
        currency=wallet.currency,
        category_id=p.get("category_id"),
        description=p.get("description") or "",
        actor_user_id=account_id,
    )
    if op_type == "INCOME":
        return uc.execute_income(**common, to_goal_id=p.get("to_goal_id"))
    if op_type == "EXPENSE":
        return uc.execute_expense(**common)
    return None  # переводы через бота пока не делаем — нужен второй кошелёк


def handle_callback(db: Session, account_id: int, bot_token: str, cq: dict) -> bool:
    """Обработать нажатие кнопки. True — это было наше нажатие."""
    data = (cq.get("data") or "")
    if not data.startswith(f"{CB_PREFIX}:"):
        return False

    parts = data.split(":")
    if len(parts) != 3:
        return False
    _, action, raw_id = parts

    msg = cq.get("message") or {}
    chat_id = (msg.get("chat") or {}).get("id")
    message_id = msg.get("message_id")

    def done(note: str):
        tg_api(bot_token, "answerCallbackQuery", {"callback_query_id": cq.get("id"), "text": note})
        if chat_id and message_id:
            tg_api(bot_token, "editMessageText", {
                "chat_id": chat_id, "message_id": message_id,
                "text": note, "parse_mode": "HTML",
            })

    log = (
        db.query(AiParseLog)
        .filter(AiParseLog.id == int(raw_id), AiParseLog.account_id == account_id)
        .first()
    )
    if not log:
        done("Разбор не найден")
        return True
    if log.status != "PENDING":
        done("Уже обработано")
        return True

    now = datetime.now(ZoneInfo(get_settings().TIMEZONE))

    if action == "skip":
        log.status = "DISCARDED"
        log.resolved_at = now
        db.commit()
        done("Отменено")
        return True

    proposals = json.loads(log.proposals_json)
    saved, failed = [], 0
    for p in proposals:
        try:
            tx_id = _save_one(db, account_id, p)
        except Exception:
            logger.exception("save from telegram failed for user_id=%s", account_id)
            db.rollback()
            tx_id = None
        if tx_id:
            saved.append({**p, "saved": True, "transaction_id": tx_id})
        else:
            failed += 1

    log.final_json = json.dumps(saved, ensure_ascii=False)
    log.status = "RESOLVED" if saved else "DISCARDED"
    log.resolved_at = now
    db.commit()

    if saved:
        # Дообучение на подтверждённом — то же, что делает приложение.
        try:
            learn_from_confirmation(db, account_id, saved)
            db.commit()
        except Exception:
            logger.exception("learn_from_confirmation failed for user_id=%s", account_id)
            db.rollback()

    if not saved:
        done("Не удалось сохранить: не хватает кошелька или суммы")
    elif failed:
        done(f"✅ Сохранено: {len(saved)}, пропущено: {failed}")
    else:
        done(f"✅ Сохранено ({len(saved)})")
    return True
