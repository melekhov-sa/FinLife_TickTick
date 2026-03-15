"""GET /api/v2/subscriptions — subscription list with members and paid_until status."""
from datetime import date

from fastapi import APIRouter, Depends
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


@router.get("/subscriptions", response_model=list[SubscriptionItem])
def get_subscriptions(
    user_id: int = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    today = date.today()

    subs = (
        db.query(SubscriptionModel)
        .filter(
            SubscriptionModel.account_id == user_id,
            SubscriptionModel.is_archived == False,
        )
        .order_by(SubscriptionModel.name)
        .all()
    )

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
        ))

    return result
