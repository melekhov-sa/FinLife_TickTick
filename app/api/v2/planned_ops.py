from datetime import date, timedelta
from fastapi import APIRouter, Depends, Request, Query, HTTPException
from sqlalchemy.orm import Session

from app.infrastructure.db.session import get_db
from app.api.v2.deps import get_user_id
from app.infrastructure.db.models import OperationTemplateModel, OperationOccurrence, RecurrenceRuleModel, WalletBalance
from pydantic import BaseModel

router = APIRouter()


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


@router.get("/planned-ops", response_model=list[PlannedOpItem])
def list_planned_ops(
    request: Request,
    db: Session = Depends(get_db),
    archived: bool = Query(False),
):
    user_id = get_user_id(request, db)
    q = db.query(OperationTemplateModel).filter(
        OperationTemplateModel.account_id == user_id
    )
    if archived:
        q = q.filter(OperationTemplateModel.is_archived == True)
    else:
        q = q.filter(OperationTemplateModel.is_archived == False)
    templates = q.order_by(OperationTemplateModel.template_id.desc()).all()

    wallet_ids = {t.wallet_id for t in templates if t.wallet_id}
    if wallet_ids:
        wallets = db.query(WalletBalance).filter(WalletBalance.wallet_id.in_(wallet_ids)).all()
    else:
        wallets = []
    wallet_map = {w.wallet_id: w.title for w in wallets}

    rule_ids = [t.rule_id for t in templates if t.rule_id]
    if rule_ids:
        rules = db.query(RecurrenceRuleModel).filter(RecurrenceRuleModel.rule_id.in_(rule_ids)).all()
    else:
        rules = []
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
        .join(
            OperationTemplateModel,
            OperationOccurrence.template_id == OperationTemplateModel.template_id,
        )
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


@router.post("/planned-ops/occurrences/{occurrence_id}/done", status_code=200)
def mark_occurrence_done(occurrence_id: int, request: Request, db: Session = Depends(get_db)):
    """Mark a planned operation occurrence as DONE (called after creating the transaction)."""
    user_id = get_user_id(request, db)
    from datetime import datetime, timezone
    occ = db.query(OperationOccurrence).filter(
        OperationOccurrence.id == occurrence_id,
        OperationOccurrence.account_id == user_id,
    ).first()
    if not occ:
        raise HTTPException(status_code=404, detail="Occurrence not found")
    occ.status = "DONE"
    occ.completed_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}
