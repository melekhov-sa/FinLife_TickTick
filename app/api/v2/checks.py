"""
Проверки (да/нет-вопросы) — JSON API.

GET    /api/v2/checks?event_id=N        — проверки события (для UI настройки)
POST   /api/v2/checks                   — создать (событийную или одиночную)
PATCH  /api/v2/checks/{id}              — изменить
DELETE /api/v2/checks/{id}              — удалить
GET    /api/v2/checks/pending           — активные вопросы на сейчас
POST   /api/v2/checks/{id}/answer       — ответ; «Нет» + дата → создаётся задача
"""
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.infrastructure.db.session import get_db
from app.infrastructure.db.models import (
    CheckModel, CheckAnswerModel, CalendarEventModel, EventOccurrenceModel,
)
from app.api.v2.deps import get_user_id

router = APIRouter(prefix="/checks", tags=["checks"])

# Горизонт: событийные вопросы видим максимум за столько дней,
# одиночные висят столько дней после своей даты, потом гаснут
_MAX_DAYS_BEFORE = 14
_STANDALONE_TTL_DAYS = 7


# ── Schemas ───────────────────────────────────────────────────────────────────

class CheckIn(BaseModel):
    question: str
    event_id: int | None = None
    days_before: int = 1
    ask_date: str | None = None          # YYYY-MM-DD (одиночный вопрос)
    fallback_task_title: str | None = None


class CheckPatch(BaseModel):
    question: str | None = None
    days_before: int | None = None
    ask_date: str | None = None
    fallback_task_title: str | None = None


class AnswerIn(BaseModel):
    occurrence_date: str                 # YYYY-MM-DD даты повторения/вопроса
    answer: str                          # YES | NO
    task_date: str | None = None         # для NO: на когда создать задачу


# ── Helpers ───────────────────────────────────────────────────────────────────

def _serialize(c: CheckModel) -> dict:
    return {
        "check_id": c.check_id,
        "question": c.question,
        "event_id": c.event_id,
        "days_before": c.days_before,
        "ask_date": c.ask_date.isoformat() if c.ask_date else None,
        "fallback_task_title": c.fallback_task_title or "",
    }


def _get_check(db: Session, user_id: int, check_id: int) -> CheckModel:
    c = db.query(CheckModel).filter(
        CheckModel.check_id == check_id,
        CheckModel.account_id == user_id,
        CheckModel.is_archived == False,  # noqa: E712
    ).first()
    if not c:
        raise HTTPException(404, "Проверка не найдена")
    return c


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.get("")
def list_checks(
    request: Request,
    event_id: int | None = Query(None),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(request, db)
    q = db.query(CheckModel).filter(
        CheckModel.account_id == user_id,
        CheckModel.is_archived == False,  # noqa: E712
    )
    if event_id is not None:
        q = q.filter(CheckModel.event_id == event_id)
    else:
        q = q.filter(CheckModel.event_id == None)  # noqa: E711 — одиночные
    return [_serialize(c) for c in q.order_by(CheckModel.check_id).all()]


@router.post("", status_code=201)
def create_check(body: CheckIn, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    question = body.question.strip()
    if not question:
        raise HTTPException(400, "Пустой вопрос")
    if body.event_id is None and not body.ask_date:
        raise HTTPException(400, "Нужно событие или дата вопроса")

    ask_date = None
    if body.ask_date:
        try:
            ask_date = date.fromisoformat(body.ask_date)
        except ValueError:
            raise HTTPException(400, "Некорректная дата")

    if body.event_id is not None:
        ev = db.query(CalendarEventModel).filter(
            CalendarEventModel.event_id == body.event_id,
            CalendarEventModel.account_id == user_id,
        ).first()
        if not ev:
            raise HTTPException(404, "Событие не найдено")

    c = CheckModel(
        account_id=user_id,
        question=question,
        event_id=body.event_id,
        days_before=max(0, min(_MAX_DAYS_BEFORE, body.days_before)),
        ask_date=ask_date,
        fallback_task_title=(body.fallback_task_title or "").strip() or None,
    )
    db.add(c)
    db.commit()
    return {"id": c.check_id}


@router.patch("/{check_id}")
def update_check(check_id: int, body: CheckPatch, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    c = _get_check(db, user_id, check_id)
    if body.question is not None:
        if not body.question.strip():
            raise HTTPException(400, "Пустой вопрос")
        c.question = body.question.strip()
    if body.days_before is not None:
        c.days_before = max(0, min(_MAX_DAYS_BEFORE, body.days_before))
    if "ask_date" in body.model_fields_set and body.ask_date:
        try:
            c.ask_date = date.fromisoformat(body.ask_date)
        except ValueError:
            raise HTTPException(400, "Некорректная дата")
    if "fallback_task_title" in body.model_fields_set:
        c.fallback_task_title = (body.fallback_task_title or "").strip() or None
    db.commit()
    return {"ok": True}


@router.delete("/{check_id}", status_code=204)
def delete_check(check_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    c = _get_check(db, user_id, check_id)
    db.query(CheckAnswerModel).filter(CheckAnswerModel.check_id == c.check_id).delete()
    db.delete(c)
    db.commit()


# ── Pending: активные вопросы ─────────────────────────────────────────────────

@router.get("/pending")
def pending_checks(request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    today = date.today()

    checks = db.query(CheckModel).filter(
        CheckModel.account_id == user_id,
        CheckModel.is_archived == False,  # noqa: E712
    ).all()
    if not checks:
        return []

    # Ответы одним запросом
    answered: set[tuple[int, date]] = {
        (a.check_id, a.occurrence_date)
        for a in db.query(CheckAnswerModel).filter(
            CheckAnswerModel.account_id == user_id,
            CheckAnswerModel.occurrence_date >= today - timedelta(days=_STANDALONE_TTL_DAYS),
        ).all()
    }

    # Ближайшие повторения событий, у которых есть проверки
    event_ids = sorted({c.event_id for c in checks if c.event_id is not None})
    occs_by_event: dict[int, list] = {}
    ev_titles: dict[int, str] = {}
    if event_ids:
        horizon = today + timedelta(days=_MAX_DAYS_BEFORE)
        occs = (
            db.query(EventOccurrenceModel)
            .filter(
                EventOccurrenceModel.account_id == user_id,
                EventOccurrenceModel.event_id.in_(event_ids),
                EventOccurrenceModel.is_cancelled == False,  # noqa: E712
                EventOccurrenceModel.start_date >= today,
                EventOccurrenceModel.start_date <= horizon,
            )
            .order_by(EventOccurrenceModel.start_date)
            .all()
        )
        for o in occs:
            occs_by_event.setdefault(o.event_id, []).append(o)
        for ev in db.query(CalendarEventModel).filter(
            CalendarEventModel.event_id.in_(event_ids)
        ).all():
            ev_titles[ev.event_id] = ev.title

    items = []
    for c in checks:
        if c.event_id is not None:
            for occ in occs_by_event.get(c.event_id, []):
                # окно вопроса: [дата − days_before … дата]
                if occ.start_date - timedelta(days=c.days_before) > today:
                    continue
                if (c.check_id, occ.start_date) in answered:
                    continue
                items.append({
                    "check_id": c.check_id,
                    "question": c.question,
                    "occurrence_date": occ.start_date.isoformat(),
                    "event_title": ev_titles.get(c.event_id),
                    "days_left": (occ.start_date - today).days,
                    "has_fallback": bool(c.fallback_task_title),
                    "fallback_task_title": c.fallback_task_title or "",
                })
                break  # только ближайшее повторение
        elif c.ask_date is not None:
            if c.ask_date > today or c.ask_date + timedelta(days=_STANDALONE_TTL_DAYS) < today:
                continue
            if (c.check_id, c.ask_date) in answered:
                continue
            items.append({
                "check_id": c.check_id,
                "question": c.question,
                "occurrence_date": c.ask_date.isoformat(),
                "event_title": None,
                "days_left": 0,
                "has_fallback": bool(c.fallback_task_title),
                "fallback_task_title": c.fallback_task_title or "",
            })

    items.sort(key=lambda x: (x["days_left"], x["check_id"]))
    return items


# ── Answer ────────────────────────────────────────────────────────────────────

@router.post("/{check_id}/answer")
def answer_check(check_id: int, body: AnswerIn, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    c = _get_check(db, user_id, check_id)

    if body.answer not in ("YES", "NO"):
        raise HTTPException(400, "answer: YES или NO")
    try:
        occ_date = date.fromisoformat(body.occurrence_date)
    except ValueError:
        raise HTTPException(400, "Некорректная occurrence_date")

    task_id = None
    if body.answer == "NO" and c.fallback_task_title and body.task_date:
        from app.application.tasks_usecases import CreateTaskUseCase, TaskValidationError
        try:
            task_id = CreateTaskUseCase(db).execute(
                account_id=user_id,
                title=c.fallback_task_title,
                due_kind="DATE",
                due_date=body.task_date,
                actor_user_id=user_id,
            )
        except TaskValidationError as e:
            raise HTTPException(400, str(e))

    # Идемпотентно: повторный ответ по той же дате обновляет запись
    existing = db.query(CheckAnswerModel).filter(
        CheckAnswerModel.check_id == c.check_id,
        CheckAnswerModel.occurrence_date == occ_date,
    ).first()
    if existing:
        existing.answer = body.answer
        if task_id:
            existing.task_id = task_id
    else:
        db.add(CheckAnswerModel(
            check_id=c.check_id,
            account_id=user_id,
            occurrence_date=occ_date,
            answer=body.answer,
            task_id=task_id,
        ))
    db.commit()
    return {"ok": True, "task_id": task_id}
