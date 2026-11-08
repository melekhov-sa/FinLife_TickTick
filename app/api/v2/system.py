"""API v2 — состояние системы.

Пока здесь только состояние бэкапа. Смысл: сделать тихие сбои заметными.
Выгрузка бэкапов однажды сломалась и прожила так месяцами — скрипт честно
писал об этом в лог, но в лог никто не смотрит. Приложение смотрят каждый день.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.v2.deps import get_user_id
from app.infrastructure.db.session import get_db
from app.infrastructure.db.models import BackupStatusModel, User

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
