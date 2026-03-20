"""GET /api/v2/subscriptions — subscription list with members and paid_until status."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.v2.deps import get_user_id
from app.infrastructure.db.models import SubscriptionModel, SubscriptionMemberModel, ContactModel
from app.infrastructure.db.session import get_db

router = APIRouter()


class MemberItem(BaseModel):
    member_id: int
    contact_id: int
    contact_name: str
    paid_until: str | None
    days_left: int | None        # None if no paid_until
    payment_per_month: float | None


class SubscriptionItem(BaseModel):
    id: int
    name: str
    paid_until_self: str | None
    days_left_self: int | None
    members: list[MemberItem]
    total_members: int
    is_archived: bool


@router.get("/subscriptions", response_model=list[SubscriptionItem])
def get_subscriptions(
    user_id: int = Depends(get_user_id),
    db: Session = Depends(get_db),
    include_archived: bool = Query(False),
):
    today = date.today()

    q = db.query(SubscriptionModel).filter(SubscriptionModel.account_id == user_id)
    if not include_archived:
        q = q.filter(SubscriptionModel.is_archived == False)
    subs = q.order_by(SubscriptionModel.name).all()

    if not subs:
        return []

    sub_ids = [s.id for s in subs]

    # Load all active members for these subscriptions
    members_rows = (
        db.query(SubscriptionMemberModel)
        .filter(
            SubscriptionMemberModel.subscription_id.in_(sub_ids),
            SubscriptionMemberModel.is_archived == False,
        )
        .all()
    )

    contact_ids = {m.contact_id for m in members_rows}
    contacts: dict[int, ContactModel] = {}
    if contact_ids:
        rows = db.query(ContactModel).filter(ContactModel.id.in_(contact_ids)).all()
        contacts = {c.id: c for c in rows}

    # Group members by subscription
    members_by_sub: dict[int, list[SubscriptionMemberModel]] = {}
    for m in members_rows:
        members_by_sub.setdefault(m.subscription_id, []).append(m)

    result = []
    for s in subs:
        days_left_self: int | None = None
        if s.paid_until_self:
            days_left_self = (s.paid_until_self - today).days

        members: list[MemberItem] = []
        for m in members_by_sub.get(s.id, []):
            contact = contacts.get(m.contact_id)
            days_left: int | None = None
            if m.paid_until:
                days_left = (m.paid_until - today).days
            members.append(MemberItem(
                member_id=m.id,
                contact_id=m.contact_id,
                contact_name=contact.name if contact else f"#{m.contact_id}",
                paid_until=str(m.paid_until) if m.paid_until else None,
                days_left=days_left,
                payment_per_month=float(m.payment_per_month) if m.payment_per_month else None,
            ))

        # Sort members: expiring soonest first
        members.sort(key=lambda x: (x.days_left is None, x.days_left or 9999))

        result.append(SubscriptionItem(
            id=s.id,
            name=s.name,
            paid_until_self=str(s.paid_until_self) if s.paid_until_self else None,
            days_left_self=days_left_self,
            members=members,
            total_members=len(members),
            is_archived=s.is_archived,
        ))

    return result


# ── Create subscription ────────────────────────────────────────────────────

class CreateSubscriptionRequest(BaseModel):
    name: str
    expense_category_id: int
    income_category_id: int


@router.post("/subscriptions", status_code=201)
def create_subscription(
    body: CreateSubscriptionRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    from app.application.subscriptions import CreateSubscriptionUseCase, SubscriptionValidationError
    user_id = get_user_id(request)
    try:
        sub_id = CreateSubscriptionUseCase(db).execute(
            account_id=user_id,
            name=body.name,
            expense_category_id=body.expense_category_id,
            income_category_id=body.income_category_id,
        )
    except SubscriptionValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"id": sub_id}


# ── Update subscription ─────────────────────────────────────────────────────

class UpdateSubscriptionRequest(BaseModel):
    name: str | None = None
    paid_until_self: str | None = None   # "YYYY-MM-DD" or "" to clear


@router.patch("/subscriptions/{sub_id}")
def update_subscription(
    sub_id: int, body: UpdateSubscriptionRequest,
    request: Request, db: Session = Depends(get_db),
):
    user_id = get_user_id(request)
    sub = db.query(SubscriptionModel).filter(
        SubscriptionModel.id == sub_id, SubscriptionModel.account_id == user_id,
    ).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    fields = body.model_fields_set
    if "name" in fields and body.name:
        sub.name = body.name.strip()
    if "paid_until_self" in fields:
        if body.paid_until_self:
            sub.paid_until_self = date.fromisoformat(body.paid_until_self)
        else:
            sub.paid_until_self = None
    db.commit()
    return {"ok": True}


@router.delete("/subscriptions/{sub_id}", status_code=204)
def archive_subscription(sub_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request)
    sub = db.query(SubscriptionModel).filter(
        SubscriptionModel.id == sub_id, SubscriptionModel.account_id == user_id,
    ).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    sub.is_archived = True
    db.commit()


@router.post("/subscriptions/{sub_id}/restore")
def restore_subscription(sub_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request)
    sub = db.query(SubscriptionModel).filter(
        SubscriptionModel.id == sub_id, SubscriptionModel.account_id == user_id,
    ).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    sub.is_archived = False
    db.commit()
    return {"ok": True}


# ── Update / archive member ──────────────────────────────────────────────────

class UpdateMemberRequest(BaseModel):
    paid_until: str | None = None       # "YYYY-MM-DD" or "" to clear
    payment_per_month: float | None = None   # None to leave unchanged


@router.patch("/subscriptions/{sub_id}/members/{member_id}")
def update_member(
    sub_id: int, member_id: int, body: UpdateMemberRequest,
    request: Request, db: Session = Depends(get_db),
):
    user_id = get_user_id(request)
    member = db.query(SubscriptionMemberModel).filter(
        SubscriptionMemberModel.id == member_id,
        SubscriptionMemberModel.subscription_id == sub_id,
        SubscriptionMemberModel.account_id == user_id,
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    fields = body.model_fields_set
    if "paid_until" in fields:
        member.paid_until = date.fromisoformat(body.paid_until) if body.paid_until else None
    if "payment_per_month" in fields:
        member.payment_per_month = body.payment_per_month
    db.commit()
    return {"ok": True}


class CompensateRequest(BaseModel):
    member_id: int
    wallet_id: int
    amount: str  # Decimal as string
    new_paid_until: str  # ISO date string


@router.post("/subscriptions/{sub_id}/compensate")
def compensate_subscription(sub_id: int, body: CompensateRequest, request: Request, db: Session = Depends(get_db)):
    from app.application.subscriptions import CompensateSubscriptionUseCase
    user_id = get_user_id(request)

    from decimal import Decimal
    from datetime import date as date_type

    amount = Decimal(body.amount)
    paid_until = date_type.fromisoformat(body.new_paid_until)

    try:
        CompensateSubscriptionUseCase(db).execute(
            account_id=user_id,
            subscription_id=sub_id,
            wallet_id=body.wallet_id,
            amount=amount,
            member_id=body.member_id,
            new_paid_until=paid_until,
            actor_user_id=user_id,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"ok": True}


@router.delete("/subscriptions/{sub_id}/members/{member_id}", status_code=204)
def archive_member(
    sub_id: int, member_id: int,
    request: Request, db: Session = Depends(get_db),
):
    user_id = get_user_id(request)
    member = db.query(SubscriptionMemberModel).filter(
        SubscriptionMemberModel.id == member_id,
        SubscriptionMemberModel.subscription_id == sub_id,
        SubscriptionMemberModel.account_id == user_id,
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    member.is_archived = True
    db.commit()
