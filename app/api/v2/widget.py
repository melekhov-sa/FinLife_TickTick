"""API v2 — данные для виджетов на домашнем экране iOS (через Scriptable).

Два слоя:
  • /widget-token        — выдача и отзыв токена, под обычной Supabase-авторизацией;
  • /widget/{kind}       — сами данные, авторизация ТОЛЬКО по токену, только чтение.

Ответ намеренно отдаётся уже в виде готовых строк (left / right / note / tone):
скрипт на телефоне остаётся тупым отрисовщиком, поэтому новый вид виджета
добавляется одной функцией здесь и НЕ требует трогать скрипт на устройстве.
"""
from __future__ import annotations

import secrets
from datetime import date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.v2.deps import get_user_id
from app.application.cashback import best_per_category
from app.application.dashboard import DashboardService
from app.config import get_settings
from app.infrastructure.db.session import get_db
from app.infrastructure.db.models import (
    CashbackCategory,
    CashbackEntry,
    WalletBalance,
    WidgetTokenModel,
)

router = APIRouter()

PUBLIC_BASE = "https://centricore.ru"


# ── Schemas ───────────────────────────────────────────────────────────────────

class WidgetTokenOut(BaseModel):
    token: str
    enabled: bool


class WidgetRow(BaseModel):
    left: str
    right: str = ""
    note: str = ""
    # accent — акцент жирным, accentSoft — акцент обычным,
    # warn — красный, normal — обычный текст.
    tone: str = "normal"


class WidgetOut(BaseModel):
    title: str
    rows: list[WidgetRow]
    empty: str
    url: str


# ── Токен ─────────────────────────────────────────────────────────────────────

def _new_token() -> str:
    return secrets.token_urlsafe(32)[:64]


@router.get("/widget-token", response_model=WidgetTokenOut)
def get_or_create_token(db: Session = Depends(get_db), user_id: int = Depends(get_user_id)):
    row = db.query(WidgetTokenModel).filter(WidgetTokenModel.account_id == user_id).first()
    if not row:
        row = WidgetTokenModel(account_id=user_id, token=_new_token(), enabled=True)
        db.add(row)
        db.commit()
        db.refresh(row)
    return WidgetTokenOut(token=row.token, enabled=row.enabled)


@router.post("/widget-token/regenerate", response_model=WidgetTokenOut)
def regenerate_token(db: Session = Depends(get_db), user_id: int = Depends(get_user_id)):
    row = db.query(WidgetTokenModel).filter(WidgetTokenModel.account_id == user_id).first()
    if not row:
        row = WidgetTokenModel(account_id=user_id, token=_new_token(), enabled=True)
        db.add(row)
    else:
        row.token = _new_token()
        row.enabled = True
    db.commit()
    db.refresh(row)
    return WidgetTokenOut(token=row.token, enabled=row.enabled)


# ── Данные виджетов ───────────────────────────────────────────────────────────

def _account_by_token(db: Session, token: str) -> int:
    row = (
        db.query(WidgetTokenModel)
        .filter(WidgetTokenModel.token == token, WidgetTokenModel.enabled == True)  # noqa: E712
        .first()
    )
    if not row:
        raise HTTPException(401, "Недействительный токен виджета")
    return row.account_id


_MONTHS = [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
]


def _fmt_percent(p: Decimal) -> str:
    """5.00 → «5%», 1.50 → «1.5%»."""
    q = p.normalize()
    s = format(q, "f")
    if "." in s:
        s = s.rstrip("0").rstrip(".")
    return f"{s}%"


def _build_cashback(db: Session, account_id: int, today: date) -> WidgetOut:
    period = date(today.year, today.month, 1)

    rows_db = (
        db.query(CashbackEntry, CashbackCategory.title, WalletBalance.title)
        .join(CashbackCategory, CashbackCategory.id == CashbackEntry.category_id)
        .join(WalletBalance, WalletBalance.wallet_id == CashbackEntry.wallet_id)
        .filter(
            CashbackEntry.account_id == account_id,
            CashbackEntry.period_month == period,
        )
        .all()
    )

    best = best_per_category(
        [(e.id, cat_title, e.percent, card_title) for e, cat_title, card_title in rows_db]
    )

    return WidgetOut(
        title=f"Кэшбек · {_MONTHS[today.month - 1]}",
        rows=[
            WidgetRow(
                left=category,
                right=_fmt_percent(percent),
                note=card,
                # Крупные ставки выделяем жирным — в этом виджете показана только
                # лучшая карта по каждой категории, так что «лучшая» ничего не
                # различала бы, а вот «жирная» различает.
                tone="accent" if percent >= 5 else "accentSoft",
            )
            for category, percent, card in best
        ],
        empty="Ставок на этот месяц нет",
        url=f"{PUBLIC_BASE}/cashback",
    )


def _build_today(db: Session, account_id: int, today: date) -> WidgetOut:
    block = DashboardService(db).get_today_block(account_id, today)

    # Только сегодняшние. Просроченные намеренно НЕ показываем: про них
    # пользователь и так знает, а в виджете на 6 строк они вытесняют то,
    # ради чего в него смотрят.
    rows: list[WidgetRow] = []
    for item in block.get("active", []):
        emoji = item.get("category_emoji") or ""
        rows.append(
            WidgetRow(
                left=f"{emoji} {item['title']}".strip(),
                right=item.get("time") or "",
            )
        )

    return WidgetOut(
        title=f"Сегодня · осталось {len(rows)}",
        rows=rows,
        empty="На сегодня всё закрыто",
        url=f"{PUBLIC_BASE}/plan",
    )


_BUILDERS = {
    "cashback": _build_cashback,
    "today": _build_today,
}


@router.get("/widget/{kind}", response_model=WidgetOut)
def get_widget(
    kind: str,
    token: str = Query(..., min_length=10),
    db: Session = Depends(get_db),
):
    builder = _BUILDERS.get(kind)
    if not builder:
        raise HTTPException(404, f"Неизвестный вид виджета: {kind}")

    account_id = _account_by_token(db, token)
    today = datetime.now(ZoneInfo(get_settings().TIMEZONE)).date()
    return builder(db, account_id, today)
