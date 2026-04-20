from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, Request, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.infrastructure.db.session import get_db
from app.api.v2.deps import get_user_id
from app.infrastructure.db.models import OperationTemplateModel, OperationOccurrence, RecurrenceRuleModel, WalletBalance

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class PlannedOpItem(BaseModel):
    template_id: int
    title: str
    kind: str
    amount: str
    wallet_title: str | None
    freq: str | None
    active_from: str
    active_until: str | None
    is_archived: bool


class UpcomingOccurrence(BaseModel):
    id: int
    template_id: int
    title: str
    kind: str
    amount: str
    scheduled_date: str
    status: str
    is_overdue: bool
    wallet_id: int | None = None
    destination_wallet_id: int | None = None
    category_id: int | None = None


class PlannedOpUpdate(BaseModel):
    title: str | None = None
    amount: str | None = None
    active_until: str | None = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_template_or_404(template_id: int, user_id: int, db: Session) -> OperationTemplateModel:
    t = db.query(OperationTemplateModel).filter(
        OperationTemplateModel.template_id == template_id,
        OperationTemplateModel.account_id == user_id,
    ).first()
    if not t:
        raise HTTPException(404, "Template not found")
    return t


def _get_occurrence_or_404(occurrence_id: int, user_id: int, db: Session) -> OperationOccurrence:
    occ = db.query(OperationOccurrence).filter(
        OperationOccurrence.id == occurrence_id,
        OperationOccurrence.account_id == user_id,
    ).first()
    if not occ:
        raise HTTPException(404, "Occurrence not found")
    return occ


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/planned-ops", response_model=list[PlannedOpItem])
def list_planned_ops(
    request: Request,
    db: Session = Depends(get_db),
    archived: bool = Query(False),
):
    user_id = get_user_id(request, db)
    q = db.query(OperationTemplateModel).filter(
        OperationTemplateModel.account_id == user_id,
        OperationTemplateModel.is_archived == archived,
    )
    templates = q.order_by(OperationTemplateModel.template_id.desc()).all()

    wallet_ids = {t.wallet_id for t in templates if t.wallet_id}
    wallet_map = {}
    if wallet_ids:
        wallets = db.query(WalletBalance).filter(WalletBalance.wallet_id.in_(wallet_ids)).all()
        wallet_map = {w.wallet_id: w.title for w in wallets}

    rule_ids = [t.rule_id for t in templates if t.rule_id]
    rule_map = {}
    if rule_ids:
        rules = db.query(RecurrenceRuleModel).filter(RecurrenceRuleModel.rule_id.in_(rule_ids)).all()
        rule_map = {r.rule_id: r for r in rules}

    return [
        PlannedOpItem(
            template_id=t.template_id,
            title=t.title,
            kind=t.kind,
            amount=str(t.amount),
            wallet_title=wallet_map.get(t.wallet_id),
            freq=rule_map[t.rule_id].freq if t.rule_id and t.rule_id in rule_map else None,
            active_from=t.active_from.isoformat(),
            active_until=t.active_until.isoformat() if t.active_until else None,
            is_archived=t.is_archived,
        )
        for t in templates
    ]


@router.get("/planned-ops/upcoming", response_model=list[UpcomingOccurrence])
def list_upcoming(request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    today = date.today()
    horizon = today + timedelta(days=90)

    rows = (
        db.query(OperationOccurrence, OperationTemplateModel)
        .join(OperationTemplateModel, OperationOccurrence.template_id == OperationTemplateModel.template_id)
        .filter(
            OperationOccurrence.account_id == user_id,
            OperationOccurrence.status == "ACTIVE",
            OperationOccurrence.scheduled_date <= horizon,
            OperationTemplateModel.is_archived == False,
        )
        .order_by(OperationOccurrence.scheduled_date.asc())
        .limit(50)
        .all()
    )

    return [
        UpcomingOccurrence(
            id=occ.id,
            template_id=tmpl.template_id,
            title=tmpl.title,
            kind=tmpl.kind,
            amount=str(tmpl.amount),
            scheduled_date=occ.scheduled_date.isoformat(),
            status=occ.status,
            is_overdue=occ.scheduled_date < today,
            wallet_id=tmpl.wallet_id,
            destination_wallet_id=tmpl.destination_wallet_id,
            category_id=tmpl.category_id,
        )
        for occ, tmpl in rows
    ]


class UpdateOccurrenceRequest(BaseModel):
    scheduled_date: str  # YYYY-MM-DD


@router.patch("/planned-ops/occurrences/{occurrence_id}")
def update_planned_op_occurrence(
    occurrence_id: int,
    body: UpdateOccurrenceRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = get_user_id(request, db)
    occ = _get_occurrence_or_404(occurrence_id, user_id, db)
    if occ.status != "ACTIVE":
        raise HTTPException(status_code=400, detail="Можно переносить только активные операции")
    try:
        new_date = date.fromisoformat(body.scheduled_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Некорректная дата")
    occ.scheduled_date = new_date
    db.commit()
    return {"ok": True}


@router.post("/planned-ops/occurrences/{occurrence_id}/skip")
def skip_occurrence(occurrence_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    occ = _get_occurrence_or_404(occurrence_id, user_id, db)
    occ.status = "SKIPPED"
    db.commit()
    return {"ok": True}


@router.post("/planned-ops/occurrences/{occurrence_id}/done")
def mark_occurrence_done(occurrence_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    occ = _get_occurrence_or_404(occurrence_id, user_id, db)
    occ.status = "DONE"
    occ.completed_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


@router.patch("/planned-ops/{template_id}")
def update_planned_op(template_id: int, body: PlannedOpUpdate, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    t = _get_template_or_404(template_id, user_id, db)
    if body.title is not None:
        t.title = body.title
    if body.amount is not None:
        t.amount = Decimal(body.amount)
    if body.active_until is not None:
        t.active_until = date.fromisoformat(body.active_until) if body.active_until else None
    db.commit()
    return {"ok": True}


@router.post("/planned-ops/{template_id}/archive")
def archive_planned_op(template_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    t = _get_template_or_404(template_id, user_id, db)
    t.is_archived = True
    db.commit()
    return {"ok": True}


@router.post("/planned-ops/{template_id}/restore")
def restore_planned_op(template_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    t = _get_template_or_404(template_id, user_id, db)
    t.is_archived = False
    db.commit()
    return {"ok": True}
