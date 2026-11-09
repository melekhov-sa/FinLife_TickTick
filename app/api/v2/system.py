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
from app.infrastructure.db.models import BackupStatusModel, ErrorEventModel, User

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
