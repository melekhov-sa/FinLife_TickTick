"""
Обработка входящих сообщений Telegram-бота (общая для вебхука и поллинга).

handle_update(db, tg, update) — разбирает апдейт и отвечает:
  /start   — привязка чата (запоминаем chat_id) + справка
  /today   — план на сегодня (задачи, привычки, события, просрочка)
  /budget  — бюджет текущего месяца: план/факт, топ отклонений
  /balance — балансы кошельков
"""
import logging
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.infrastructure.db.models import TelegramSettings, WalletBalance
from app.infrastructure.crypto import encrypt, decrypt
from app.infrastructure.telegram import tg_api

logger = logging.getLogger(__name__)

HELP_TEXT = (
    "🤖 <b>FinLife-бот</b>\n\n"
    "Сюда приходят уведомления: сводки, напоминания, бюджетные алерты.\n"
    "Настройки видов (вкл/выкл, без звука) — в приложении:\n"
    "Настройки → Уведомления.\n\n"
    "<b>Команды:</b>\n"
    "/today — план на сегодня\n"
    "/budget — бюджет текущего месяца\n"
    "/balance — балансы кошельков\n"
    "/help — эта справка"
)


def _fmt_money(v) -> str:
    n = float(v or 0)
    return f"{n:,.0f}".replace(",", " ")


def _cmd_today(db: Session, user_id: int) -> str:
    from app.application.dashboard import DashboardService
    from app.application.occurrence_generator import OccurrenceGenerator

    try:
        OccurrenceGenerator(db).generate_all(user_id)
    except Exception:
        logger.warning("today: occurrence generation failed", exc_info=True)
    block = DashboardService(db).get_today_block(user_id, date.today())

    lines = ["📋 <b>План на сегодня</b>", ""]
    if not block["active"] and not block["overdue"]:
        lines.append("Дел нет — свободный день!")
    icons = {"habit": "🔄", "event": "📅"}
    for it in block["active"][:20]:
        t = it.get("time") or it.get("task_time")
        icon = icons.get(it.get("kind"), "•")
        lines.append(f"{icon} {it.get('title', '?')}" + (f" <i>({t})</i>" if t else ""))
    if len(block["active"]) > 20:
        lines.append(f"…и ещё {len(block['active']) - 20}")
    if block["overdue"]:
        lines.append("")
        lines.append(f"⚠️ <b>Просрочено ({len(block['overdue'])}):</b>")
        for it in block["overdue"][:7]:
            lines.append(f"• {it.get('title', '?')}")
    done = block.get("progress", {}).get("done")
    total = block.get("progress", {}).get("total")
    if total:
        lines.append("")
        lines.append(f"Прогресс: {done}/{total}")
    return "\n".join(lines)


def _cmd_budget(db: Session, user_id: int) -> str:
    from app.application.budget import build_budget_view

    today = date.today()
    view = build_budget_view(db, user_id, today.year, today.month)
    t = view["totals"]

    lines = [
        f"💰 <b>Бюджет: {view['month_name']} {today.year}</b>",
        "",
        f"Доходы: {_fmt_money(t['fact_income'])} / план {_fmt_money(t['plan_income'])}",
        f"Расходы: {_fmt_money(t['fact_expense'])} / план {_fmt_money(t['plan_expense'])}",
        f"Итог: {_fmt_money(t['fact_result'])} (план {_fmt_money(t['plan_result'])})",
    ]

    # Топ-7 расходов по факту с отметкой перерасхода
    rows = [
        r for r in view["expense_lines"]
        if float(r.get("fact") or 0) > 0 or float(r.get("plan") or 0) > 0
    ]
    rows.sort(key=lambda r: -float(r.get("fact") or 0))
    if rows:
        lines.append("")
        lines.append("<b>Топ расходов:</b>")
        for r in rows[:7]:
            fact = float(r.get("fact") or 0)
            plan = float(r.get("plan") or 0)
            mark = " 🔴" if plan > 0 and fact > plan else ""
            plan_part = f" / {_fmt_money(plan)}" if plan > 0 else ""
            lines.append(f"• {r['title']}: {_fmt_money(fact)}{plan_part}{mark}")

    # Перерасходы отдельно (кроме уже показанных топ-7)
    shown = {r["title"] for r in rows[:7]}
    over = [
        r for r in view["expense_lines"]
        if float(r.get("plan") or 0) > 0
        and float(r.get("fact") or 0) > float(r.get("plan") or 0)
        and r["title"] not in shown
    ]
    if over:
        lines.append("")
        lines.append("<b>🔴 Ещё перерасход:</b>")
        for r in over[:5]:
            d = float(r["fact"]) - float(r["plan"])
            lines.append(f"• {r['title']}: +{_fmt_money(d)}")

    return "\n".join(lines)


def _cmd_balance(db: Session, user_id: int) -> str:
    wallets = (
        db.query(WalletBalance)
        .filter(WalletBalance.account_id == user_id)
        .order_by(WalletBalance.wallet_type, WalletBalance.title)
        .all()
    )
    if not wallets:
        return "Кошельков нет"

    type_titles = {
        "REGULAR": "💳 Обычные",
        "SAVINGS": "🐷 Накопления",
        "CREDIT": "🏦 Кредиты",
    }
    lines = ["👛 <b>Балансы</b>"]
    cur_type = None
    total = Decimal("0")
    for w in wallets:
        if getattr(w, "is_archived", False):
            continue
        if w.wallet_type != cur_type:
            cur_type = w.wallet_type
            lines.append("")
            lines.append(type_titles.get(cur_type, cur_type))
        cur = "₽" if w.currency == "RUB" else w.currency
        lines.append(f"• {w.title}: {_fmt_money(w.balance)} {cur}")
        if w.currency == "RUB":
            total += (w.balance or 0) if w.wallet_type != "CREDIT" else 0
    lines.append("")
    lines.append(f"<b>Итого (RUB, без кредитов): {_fmt_money(total)} ₽</b>")
    return "\n".join(lines)


def handle_update(db: Session, tg: TelegramSettings, update: dict) -> None:
    """Обработать один апдейт бота (из вебхука или getUpdates)."""
    msg = update.get("message") or update.get("edited_message") or {}
    chat = msg.get("chat") or {}
    chat_id = chat.get("id")
    text = (msg.get("text") or "").strip()
    if not chat_id or not text or not tg.bot_token:
        return

    bot_token = decrypt(tg.bot_token)
    if not bot_token:
        return

    def reply(t: str):
        tg_api(bot_token, "sendMessage", {
            "chat_id": chat_id, "text": t, "parse_mode": "HTML",
        })

    cmd = text.split()[0].split("@")[0].lower()

    # /start — привязка чата (или перепривязка с нового чата)
    if cmd == "/start":
        tg.chat_id = encrypt(str(chat_id))
        tg.connected = True
        tg.connected_at = datetime.now(timezone.utc)
        db.commit()
        reply("✅ Telegram привязан к FinLife!\n\n" + HELP_TEXT)
        return

    # Остальные команды — только из привязанного чата
    bound_chat = decrypt(tg.chat_id) if tg.chat_id else None
    if not tg.connected or bound_chat != str(chat_id):
        reply("Чат не привязан. Отправь /start")
        return

    try:
        if cmd == "/today":
            reply(_cmd_today(db, tg.user_id))
        elif cmd == "/budget":
            reply(_cmd_budget(db, tg.user_id))
        elif cmd == "/balance":
            reply(_cmd_balance(db, tg.user_id))
        else:
            reply(HELP_TEXT)
    except Exception:
        logger.exception("Telegram command %s failed for user_id=%s", cmd, tg.user_id)
        reply("⚠️ Ошибка при выполнении команды, попробуй позже")
