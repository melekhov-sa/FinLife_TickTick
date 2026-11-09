"""API v2 — состояние системы: бэкапы и ошибки бэкенда.

Смысл один: сделать тихие сбои заметными. Выгрузка бэкапов сломалась и
прожила так месяцами, а исключения уходили в stdout — и то, и другое
исправно сообщало о себе в логи, которые никто не читает. Приложение
читают каждый день.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.v2.deps import get_user_id
from app.infrastructure.db.session import get_db
from app.infrastructure.db.models import (
    BackupStatusModel,
    ErrorEventModel,
    NotificationFailureModel,
    TelegramSettings,
    User,
    UserNotificationSettings,
)

router = APIRouter()

# Бэкап идёт раз в сутки. Сутки + запас на сдвиг расписания и долгую выгрузку.
STALE_AFTER_HOURS = 30


class BackupStatusOut(BaseModel):
    configured: bool
    healthy: bool
    problem: str | None = None
    last_run_at: datetime | None = None
    age_hours: float | None = None
    size_text: str | None = None
    offsite_ok: bool = False
    config_ok: bool = False


@router.get("/system/backup-status", response_model=BackupStatusOut)
def backup_status(db: Session = Depends(get_db), user_id: int = Depends(get_user_id)):
    """Состояние бэкапа. Только для админа — это про сервер, а не про данные."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_admin:
        raise HTTPException(403, "Доступно только администратору")

    row = db.query(BackupStatusModel).filter(BackupStatusModel.id == 1).first()
    if not row:
        # Скрипт ещё ни разу не отчитался: либо не обновлён, либо не запускался.
        return BackupStatusOut(
            configured=False,
            healthy=False,
            problem="Бэкап ещё ни разу не отчитался о себе",
        )

    now = datetime.now(timezone.utc)
    last = row.last_run_at
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    age = (now - last).total_seconds() / 3600

    problem: str | None = None
    if age > STALE_AFTER_HOURS:
        problem = f"Последний бэкап был {int(age)} ч назад"
    elif not row.offsite_ok:
        problem = "Бэкап делается, но копия не уходит на Яндекс.Диск"
    elif not row.config_ok:
        problem = "База выгружается, а конфигурация сервера — нет"
    elif row.error:
        problem = row.error

    return BackupStatusOut(
        configured=True,
        healthy=problem is None,
        problem=problem,
        last_run_at=last,
        age_hours=round(age, 1),
        size_text=row.size_text,
        offsite_ok=row.offsite_ok,
        config_ok=row.config_ok,
    )


# ── Ошибки бэкенда ────────────────────────────────────────────────────────────

class ErrorItem(BaseModel):
    occurred_at: datetime
    method: str
    path: str
    message: str


class ErrorsOut(BaseModel):
    count_24h: int
    recent: list[ErrorItem]


@router.get("/system/errors", response_model=ErrorsOut)
def recent_errors(db: Session = Depends(get_db), user_id: int = Depends(get_user_id)):
    """Необработанные исключения за сутки. Только для админа.

    Они и раньше писались в stdout, но туда никто не смотрит — поломку
    статистики бюджета так и нашли, случайно наткнувшись на пустую страницу.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_admin:
        raise HTTPException(403, "Доступно только администратору")

    since = datetime.now(timezone.utc) - timedelta(hours=24)
    count = (
        db.query(func.count(ErrorEventModel.id))
        .filter(ErrorEventModel.occurred_at >= since)
        .scalar()
    ) or 0
    rows = (
        db.query(ErrorEventModel)
        .order_by(ErrorEventModel.occurred_at.desc())
        .limit(5)
        .all()
    )
    return ErrorsOut(
        count_24h=count,
        recent=[
            ErrorItem(
                occurred_at=r.occurred_at,
                method=r.method,
                path=r.path,
                message=r.message[:200],
            )
            for r in rows
        ],
    )


# ── Доставка уведомлений ──────────────────────────────────────────────────────

class NotifyHealthOut(BaseModel):
    healthy: bool
    problem: str | None = None
    hint: str | None = None
    telegram_connected: bool
    channel_enabled: bool
    failures_24h: int
    last_error: str | None = None
    last_error_at: datetime | None = None


@router.get("/system/notifications", response_model=NotifyHealthOut)
def notifications_health(db: Session = Depends(get_db), user_id: int = Depends(get_user_id)):
    """Доходят ли уведомления. Для каждого пользователя свой ответ — у всех
    свой бот, и обрыв у одного не виден другому.

    Повод: заблокированный в Telegram бот месяцами ронял все уведомления, а
    приложение показывало, что всё нормально.
    """
    settings = (
        db.query(UserNotificationSettings)
        .filter(UserNotificationSettings.user_id == user_id)
        .first()
    )
    tg = db.query(TelegramSettings).filter(TelegramSettings.user_id == user_id).first()

    channel_enabled = bool((settings.channels_json or {}).get("telegram")) if settings else False
    connected = bool(tg and tg.bot_token and tg.chat_id)

    since = datetime.now(timezone.utc) - timedelta(hours=24)
    failures = (
        db.query(NotificationFailureModel)
        .filter(
            NotificationFailureModel.user_id == user_id,
            NotificationFailureModel.occurred_at >= since,
        )
        .order_by(NotificationFailureModel.occurred_at.desc())
        .all()
    )

    problem: str | None = None
    hint: str | None = None
    if settings is not None and not settings.enabled:
        problem = "Уведомления выключены полностью"
        hint = "Включить можно здесь же, в настройках уведомлений"
    elif not connected:
        problem = "Telegram не подключён"
        hint = "Настройки → Уведомления → подключить бота"
    elif not channel_enabled:
        # Ровно этот случай был у второго пользователя: бот подключён,
        # а канал выключен, поэтому не приходило вообще ничего.
        problem = "Бот подключён, но канал Telegram выключен"
        hint = "Включить переключатель Telegram в настройках уведомлений"
    elif failures:
        problem = f"Не доходят: {failures[0].error}"
        if "blocked" in failures[0].error.lower():
            hint = "Открой чат с ботом в Telegram и нажми «Разблокировать», затем /start"

    return NotifyHealthOut(
        healthy=problem is None,
        problem=problem,
        hint=hint,
        telegram_connected=connected,
        channel_enabled=channel_enabled,
        failures_24h=len(failures),
        last_error=failures[0].error if failures else None,
        last_error_at=failures[0].occurred_at if failures else None,
    )
