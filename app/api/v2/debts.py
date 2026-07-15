"""
Долги и займы — JSON API.

GET    /api/v2/debts                       — список + итоги «мне должны / я должен»
POST   /api/v2/debts                       — создать долг
PATCH  /api/v2/debts/{id}                  — изменить поля
DELETE /api/v2/debts/{id}                  — удалить (с платежами)
POST   /api/v2/debts/{id}/payments         — частичный возврат (авто-закрытие при полном)
DELETE /api/v2/debts/{id}/payments/{pid}   — удалить платёж (переоткрывает при недоплате)
POST   /api/v2/debts/{id}/close            — закрыть вручную (простить остаток)
POST   /api/v2/debts/{id}/reopen           — переоткрыть
"""
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.infrastructure.db.session import get_db
from app.infrastructure.db.models import DebtModel, DebtPaymentModel
from app.api.v2.deps import get_user_id

router = APIRouter(prefix="/debts", tags=["debts"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class DebtIn(BaseModel):
    direction: str                 # LENT | BORROWED
    counterparty: str
    contact_id: int | None = None
    amount: str                    # decimal string
    currency: str = "RUB"
    opened_date: str | None = None  # YYYY-MM-DD, default today
    due_date: str | None = None
    note: str = ""


class DebtPatch(BaseModel):
    counterparty: str | None = None
    contact_id: int | None = None
    amount: str | None = None
    due_date: str | None = None    # "" = убрать срок
    note: str | None = None


class PaymentIn(BaseModel):
    amount: str
    paid_date: str | None = None   # default today
    note: str = ""


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_amount(raw: str) -> Decimal:
    try:
        v = Decimal(raw.replace(",", "."))
    except (InvalidOperation, AttributeError):
        raise HTTPException(400, "Некорректная сумма")
    if v <= 0:
        raise HTTPException(400, "Сумма должна быть больше нуля")
    return v


def _parse_date(raw: str | None, field: str) -> date | None:
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        raise HTTPException(400, f"Некорректная дата {field}")


def _get_debt(db: Session, user_id: int, debt_id: int) -> DebtModel:
    d = db.query(DebtModel).filter(
        DebtModel.debt_id == debt_id, DebtModel.account_id == user_id
    ).first()
    if not d:
        raise HTTPException(404, "Долг не найден")
    return d


def _paid_map(db: Session, user_id: int, debt_ids: list[int]) -> dict[int, Decimal]:
    if not debt_ids:
        return {}
    rows = (
        db.query(DebtPaymentModel.debt_id, func.sum(DebtPaymentModel.amount))
        .filter(
            DebtPaymentModel.account_id == user_id,
            DebtPaymentModel.debt_id.in_(debt_ids),
        )
        .group_by(DebtPaymentModel.debt_id)
        .all()
    )
    return {r[0]: r[1] or Decimal("0") for r in rows}


def _serialize(d: DebtModel, paid: Decimal, payments: list[DebtPaymentModel] | None = None) -> dict:
    remaining = max(Decimal("0"), d.amount - paid)
    out = {
        "debt_id": d.debt_id,
        "direction": d.direction,
        "counterparty": d.counterparty,
        "contact_id": d.contact_id,
        "amount": float(d.amount),
        "paid": float(paid),
        "remaining": float(remaining),
        "currency": d.currency,
        "opened_date": d.opened_date.isoformat(),
        "due_date": d.due_date.isoformat() if d.due_date else None,
        "note": d.note or "",
        "status": d.status,
        "overdue": bool(
            d.status == "OPEN" and d.due_date and d.due_date < date.today()
        ),
    }
    if payments is not None:
        out["payments"] = [
            {
                "payment_id": p.payment_id,
                "amount": float(p.amount),
                "paid_date": p.paid_date.isoformat(),
                "note": p.note or "",
            }
            for p in payments
        ]
    return out


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
def list_debts(
    request: Request,
    status: str = Query("OPEN"),  # OPEN | CLOSED | ALL
    db: Session = Depends(get_db),
):
    user_id = get_user_id(request, db)

    q = db.query(DebtModel).filter(DebtModel.account_id == user_id)
    if status in ("OPEN", "CLOSED"):
        q = q.filter(DebtModel.status == status)
    debts = q.order_by(
        DebtModel.status,
        DebtModel.due_date.is_(None),  # с ближайшим сроком — выше
        DebtModel.due_date,
        DebtModel.created_at.desc(),
    ).all()

    paid = _paid_map(db, user_id, [d.debt_id for d in debts])

    # Платежи — одним запросом, чтобы карточка сразу могла показать историю
    payments_by_debt: dict[int, list[DebtPaymentModel]] = {}
    if debts:
        all_payments = (
            db.query(DebtPaymentModel)
            .filter(
                DebtPaymentModel.account_id == user_id,
                DebtPaymentModel.debt_id.in_([d.debt_id for d in debts]),
            )
            .order_by(DebtPaymentModel.paid_date.desc(), DebtPaymentModel.payment_id.desc())
            .all()
        )
        for p in all_payments:
            payments_by_debt.setdefault(p.debt_id, []).append(p)

    # Итоги по ОТКРЫТЫМ долгам, по валютам
    open_debts = (
        debts if status == "OPEN"
        else [d for d in db.query(DebtModel).filter(
            DebtModel.account_id == user_id, DebtModel.status == "OPEN").all()]
    )
    open_paid = paid if status == "OPEN" else _paid_map(db, user_id, [d.debt_id for d in open_debts])
    totals: dict[str, dict[str, float]] = {}
    for d in open_debts:
        remaining = float(max(Decimal("0"), d.amount - open_paid.get(d.debt_id, Decimal("0"))))
        t = totals.setdefault(d.currency, {"lent": 0.0, "borrowed": 0.0})
        t["lent" if d.direction == "LENT" else "borrowed"] += remaining

    return {
        "totals": totals,
        "items": [
            _serialize(d, paid.get(d.debt_id, Decimal("0")), payments_by_debt.get(d.debt_id, []))
            for d in debts
        ],
    }


@router.post("", status_code=201)
def create_debt(body: DebtIn, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    if body.direction not in ("LENT", "BORROWED"):
        raise HTTPException(400, "direction: LENT или BORROWED")
    if not body.counterparty.strip():
        raise HTTPException(400, "Укажи, кто именно")

    d = DebtModel(
        account_id=user_id,
        direction=body.direction,
        counterparty=body.counterparty.strip(),
        contact_id=body.contact_id,
        amount=_parse_amount(body.amount),
        currency=(body.currency or "RUB").upper()[:3],
        opened_date=_parse_date(body.opened_date, "opened_date") or date.today(),
        due_date=_parse_date(body.due_date, "due_date"),
        note=body.note or "",
    )
    db.add(d)
    db.commit()
    return {"id": d.debt_id}


@router.patch("/{debt_id}")
def update_debt(debt_id: int, body: DebtPatch, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    d = _get_debt(db, user_id, debt_id)

    if body.counterparty is not None:
        if not body.counterparty.strip():
            raise HTTPException(400, "Укажи, кто именно")
        d.counterparty = body.counterparty.strip()
    if "contact_id" in body.model_fields_set:
        d.contact_id = body.contact_id
    if body.amount is not None:
        d.amount = _parse_amount(body.amount)
    if "due_date" in body.model_fields_set:
        d.due_date = _parse_date(body.due_date or None, "due_date")
    if body.note is not None:
        d.note = body.note

    db.commit()
    return {"ok": True}


@router.delete("/{debt_id}", status_code=204)
def delete_debt(debt_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    d = _get_debt(db, user_id, debt_id)
    db.query(DebtPaymentModel).filter(DebtPaymentModel.debt_id == d.debt_id).delete()
    db.delete(d)
    db.commit()


@router.post("/{debt_id}/payments", status_code=201)
def add_payment(debt_id: int, body: PaymentIn, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    d = _get_debt(db, user_id, debt_id)

    p = DebtPaymentModel(
        debt_id=d.debt_id,
        account_id=user_id,
        amount=_parse_amount(body.amount),
        paid_date=_parse_date(body.paid_date, "paid_date") or date.today(),
        note=body.note or "",
    )
    db.add(p)
    db.flush()

    paid = _paid_map(db, user_id, [d.debt_id]).get(d.debt_id, Decimal("0"))
    closed = False
    if paid >= d.amount and d.status == "OPEN":
        d.status = "CLOSED"
        d.closed_at = datetime.now(timezone.utc)
        closed = True
    db.commit()
    return {"id": p.payment_id, "closed": closed, "remaining": float(max(Decimal("0"), d.amount - paid))}


@router.delete("/{debt_id}/payments/{payment_id}", status_code=204)
def delete_payment(debt_id: int, payment_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    d = _get_debt(db, user_id, debt_id)
    p = db.query(DebtPaymentModel).filter(
        DebtPaymentModel.payment_id == payment_id,
        DebtPaymentModel.debt_id == d.debt_id,
        DebtPaymentModel.account_id == user_id,
    ).first()
    if not p:
        raise HTTPException(404, "Платёж не найден")
    db.delete(p)
    db.flush()

    # Недоплата после удаления — переоткрываем
    paid = _paid_map(db, user_id, [d.debt_id]).get(d.debt_id, Decimal("0"))
    if d.status == "CLOSED" and paid < d.amount:
        d.status = "OPEN"
        d.closed_at = None
    db.commit()


@router.post("/{debt_id}/close")
def close_debt(debt_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    d = _get_debt(db, user_id, debt_id)
    d.status = "CLOSED"
    d.closed_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


@router.post("/{debt_id}/reopen")
def reopen_debt(debt_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    d = _get_debt(db, user_id, debt_id)
    d.status = "OPEN"
    d.closed_at = None
    db.commit()
    return {"ok": True}
