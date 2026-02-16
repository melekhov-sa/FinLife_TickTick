"""
Subscription use cases — CRUD подписок, участников, покрытий + расчёт окупаемости.

Модуль работает напрямую с ORM (без event sourcing).
"""
from datetime import date, timedelta
from decimal import Decimal
from sqlalchemy.orm import Session

from app.infrastructure.db.models import (
    SubscriptionModel, SubscriptionMemberModel, SubscriptionCoverageModel,
    TransactionFeed, ContactModel,
)


class SubscriptionValidationError(ValueError):
    pass


# ============================================================================
# Subscriptions CRUD
# ============================================================================


class CreateSubscriptionUseCase:
    def __init__(self, db: Session):
        self.db = db

    def execute(
        self,
        account_id: int,
        name: str,
        expense_category_id: int,
        income_category_id: int,
    ) -> int:
        name = name.strip()
        if not name:
            raise SubscriptionValidationError("Название не может быть пустым")

        sub = SubscriptionModel(
            account_id=account_id,
            name=name,
            expense_category_id=expense_category_id,
            income_category_id=income_category_id,
        )
        self.db.add(sub)
        self.db.flush()
        self.db.commit()
        return sub.id


class UpdateSubscriptionUseCase:
    def __init__(self, db: Session):
        self.db = db

    def execute(self, sub_id: int, account_id: int, **changes) -> None:
        sub = self.db.query(SubscriptionModel).filter(
            SubscriptionModel.id == sub_id,
            SubscriptionModel.account_id == account_id,
        ).first()
        if not sub:
            raise SubscriptionValidationError("Подписка не найдена")

        if "name" in changes:
            name = changes["name"].strip()
            if not name:
                raise SubscriptionValidationError("Название не может быть пустым")
            sub.name = name
        if "expense_category_id" in changes:
            sub.expense_category_id = changes["expense_category_id"]
        if "income_category_id" in changes:
            sub.income_category_id = changes["income_category_id"]
        self.db.commit()


class ArchiveSubscriptionUseCase:
    def __init__(self, db: Session):
        self.db = db

    def execute(self, sub_id: int, account_id: int) -> None:
        sub = self.db.query(SubscriptionModel).filter(
            SubscriptionModel.id == sub_id,
            SubscriptionModel.account_id == account_id,
        ).first()
        if not sub:
            raise SubscriptionValidationError("Подписка не найдена")
        if sub.is_archived:
            raise SubscriptionValidationError("Подписка уже в архиве")
        sub.is_archived = True
        self.db.commit()


class UnarchiveSubscriptionUseCase:
    def __init__(self, db: Session):
        self.db = db

    def execute(self, sub_id: int, account_id: int) -> None:
        sub = self.db.query(SubscriptionModel).filter(
            SubscriptionModel.id == sub_id,
            SubscriptionModel.account_id == account_id,
        ).first()
        if not sub:
            raise SubscriptionValidationError("Подписка не найдена")
        if not sub.is_archived:
            raise SubscriptionValidationError("Подписка не в архиве")
        sub.is_archived = False
        self.db.commit()


# ============================================================================
# Members CRUD
# ============================================================================


class AddSubscriptionMemberUseCase:
    def __init__(self, db: Session):
        self.db = db

    def execute(
        self,
        account_id: int,
        subscription_id: int,
        contact_id: int,
        payment_per_year: Decimal | None = None,
        payment_per_month: Decimal | None = None,
    ) -> int:
        sub = self.db.query(SubscriptionModel).filter(
            SubscriptionModel.id == subscription_id,
            SubscriptionModel.account_id == account_id,
        ).first()
        if not sub:
            raise SubscriptionValidationError("Подписка не найдена")

        contact = self.db.query(ContactModel).filter(
            ContactModel.id == contact_id,
            ContactModel.account_id == account_id,
        ).first()
        if not contact:
            raise SubscriptionValidationError("Контакт не найден")

        # Check duplicate: this contact already in this subscription
        existing = self.db.query(SubscriptionMemberModel).filter(
            SubscriptionMemberModel.subscription_id == subscription_id,
            SubscriptionMemberModel.contact_id == contact_id,
        ).first()
        if existing:
            raise SubscriptionValidationError("Этот контакт уже добавлен в подписку")

        member = SubscriptionMemberModel(
            subscription_id=subscription_id,
            contact_id=contact_id,
            account_id=account_id,
            payment_per_year=payment_per_year,
            payment_per_month=payment_per_month,
        )
        self.db.add(member)
        self.db.flush()
        self.db.commit()
        return member.id


class ArchiveMemberUseCase:
    def __init__(self, db: Session):
        self.db = db

    def execute(self, member_id: int, account_id: int) -> None:
        m = self.db.query(SubscriptionMemberModel).filter(
            SubscriptionMemberModel.id == member_id,
            SubscriptionMemberModel.account_id == account_id,
        ).first()
        if not m:
            raise SubscriptionValidationError("Участник не найден")
        if m.is_archived:
            raise SubscriptionValidationError("Участник уже в архиве")
        m.is_archived = True
        self.db.commit()


class UnarchiveMemberUseCase:
    def __init__(self, db: Session):
        self.db = db

    def execute(self, member_id: int, account_id: int) -> None:
        m = self.db.query(SubscriptionMemberModel).filter(
            SubscriptionMemberModel.id == member_id,
            SubscriptionMemberModel.account_id == account_id,
        ).first()
        if not m:
            raise SubscriptionValidationError("Участник не найден")
        if not m.is_archived:
            raise SubscriptionValidationError("Участник не в архиве")
        m.is_archived = False
        self.db.commit()


class UpdateMemberPaymentUseCase:
    def __init__(self, db: Session):
        self.db = db

    def execute(
        self,
        member_id: int,
        account_id: int,
        payment_per_year: Decimal | None,
        payment_per_month: Decimal | None,
    ) -> None:
        m = self.db.query(SubscriptionMemberModel).filter(
            SubscriptionMemberModel.id == member_id,
            SubscriptionMemberModel.account_id == account_id,
        ).first()
        if not m:
            raise SubscriptionValidationError("Участник не найден")
        m.payment_per_year = payment_per_year
        m.payment_per_month = payment_per_month
        self.db.commit()


# ============================================================================
# Coverages
# ============================================================================


def _add_months(d: date, n: int) -> date:
    """Add n months to a date (1st-of-month safe)."""
    month = d.month - 1 + n
    year = d.year + month // 12
    month = month % 12 + 1
    return date(year, month, 1)


def _compute_months(start: date, end: date) -> int:
    """Billing months. end is inclusive (last paid day)."""
    end_excl = end + timedelta(days=1)
    months = (end_excl.year - start.year) * 12 + (end_excl.month - start.month)
    return max(months, 1)


def _coverage_overlaps(
    db: Session,
    subscription_id: int,
    payer_type: str,
    member_id: int | None,
    start_date: date,
    end_date: date,
    exclude_id: int | None = None,
) -> bool:
    """Check if a new coverage range overlaps existing ones (date-based)."""
    q = db.query(SubscriptionCoverageModel).filter(
        SubscriptionCoverageModel.subscription_id == subscription_id,
        SubscriptionCoverageModel.payer_type == payer_type,
    )
    if payer_type == "MEMBER":
        q = q.filter(SubscriptionCoverageModel.member_id == member_id)
    else:
        q = q.filter(SubscriptionCoverageModel.member_id.is_(None))

    if exclude_id:
        q = q.filter(SubscriptionCoverageModel.id != exclude_id)

    for cov in q.all():
        # Overlap: NOT (existing.end < new.start OR new.end < existing.start)
        if not (cov.end_date < start_date or end_date < cov.start_date):
            return True
    return False


class CreateSubscriptionCoverageUseCase:
    def __init__(self, db: Session):
        self.db = db

    def execute(
        self,
        account_id: int,
        subscription_id: int,
        payer_type: str,
        member_id: int | None,
        transaction_id: int,
        start_date: date,
        end_date: date,
    ) -> int:
        # 1. end_date must be >= start_date
        if end_date < start_date:
            raise SubscriptionValidationError("Дата окончания должна быть >= даты начала")

        # 2. payer_type validation
        if payer_type not in ("SELF", "MEMBER"):
            raise SubscriptionValidationError("payer_type должен быть SELF или MEMBER")

        if payer_type == "SELF" and member_id is not None:
            raise SubscriptionValidationError("SELF оплата не должна указывать member_id")

        if payer_type == "MEMBER" and not member_id:
            raise SubscriptionValidationError("MEMBER оплата должна указывать member_id")

        # 3. Subscription exists
        sub = self.db.query(SubscriptionModel).filter(
            SubscriptionModel.id == subscription_id,
            SubscriptionModel.account_id == account_id,
        ).first()
        if not sub:
            raise SubscriptionValidationError("Подписка не найдена")

        # 4. Member exists (if MEMBER)
        if payer_type == "MEMBER":
            m = self.db.query(SubscriptionMemberModel).filter(
                SubscriptionMemberModel.id == member_id,
                SubscriptionMemberModel.subscription_id == subscription_id,
            ).first()
            if not m:
                raise SubscriptionValidationError("Участник не найден")

        # 5. Transaction exists and unique
        tx = self.db.query(TransactionFeed).filter(
            TransactionFeed.transaction_id == transaction_id,
            TransactionFeed.account_id == account_id,
        ).first()
        if not tx:
            raise SubscriptionValidationError("Операция не найдена")

        dup = self.db.query(SubscriptionCoverageModel).filter(
            SubscriptionCoverageModel.transaction_id == transaction_id,
        ).first()
        if dup:
            raise SubscriptionValidationError("Эта операция уже привязана к покрытию")

        # 6. Category validation
        if payer_type == "SELF":
            if tx.category_id != sub.expense_category_id:
                raise SubscriptionValidationError(
                    "Для SELF оплаты категория операции должна совпадать "
                    "со статьёй расхода подписки"
                )
        else:
            if tx.category_id != sub.income_category_id:
                raise SubscriptionValidationError(
                    "Для MEMBER компенсации категория операции должна совпадать "
                    "со статьёй дохода подписки"
                )

        # 7. Overlap check
        if _coverage_overlaps(self.db, subscription_id, payer_type, member_id,
                              start_date, end_date):
            raise SubscriptionValidationError(
                "Период покрытия пересекается с существующим"
            )

        # 8. Insert
        cov = SubscriptionCoverageModel(
            subscription_id=subscription_id,
            account_id=account_id,
            source_type="OPERATION",
            payer_type=payer_type,
            member_id=member_id,
            transaction_id=transaction_id,
            start_date=start_date,
            end_date=end_date,
        )
        self.db.add(cov)
        self.db.flush()
        self.db.commit()
        return cov.id


class CreateInitialCoverageUseCase:
    """Create an INITIAL coverage (no transaction, just marks 'paid until')."""

    def __init__(self, db: Session):
        self.db = db

    def execute(
        self,
        account_id: int,
        subscription_id: int,
        payer_type: str,
        member_id: int | None,
        start_date: date,
        end_date: date,
    ) -> int:
        if end_date < start_date:
            raise SubscriptionValidationError("Дата окончания должна быть >= даты начала")

        if payer_type not in ("SELF", "MEMBER"):
            raise SubscriptionValidationError("payer_type должен быть SELF или MEMBER")

        if payer_type == "SELF" and member_id is not None:
            raise SubscriptionValidationError("SELF оплата не должна указывать member_id")

        if payer_type == "MEMBER" and not member_id:
            raise SubscriptionValidationError("MEMBER оплата должна указывать member_id")

        sub = self.db.query(SubscriptionModel).filter(
            SubscriptionModel.id == subscription_id,
            SubscriptionModel.account_id == account_id,
        ).first()
        if not sub:
            raise SubscriptionValidationError("Подписка не найдена")

        if payer_type == "MEMBER":
            m = self.db.query(SubscriptionMemberModel).filter(
                SubscriptionMemberModel.id == member_id,
                SubscriptionMemberModel.subscription_id == subscription_id,
            ).first()
            if not m:
                raise SubscriptionValidationError("Участник не найден")

        if _coverage_overlaps(self.db, subscription_id, payer_type, member_id,
                              start_date, end_date):
            raise SubscriptionValidationError(
                "Период покрытия пересекается с существующим"
            )

        cov = SubscriptionCoverageModel(
            subscription_id=subscription_id,
            account_id=account_id,
            source_type="INITIAL",
            payer_type=payer_type,
            member_id=member_id,
            transaction_id=None,
            start_date=start_date,
            end_date=end_date,
        )
        self.db.add(cov)
        self.db.flush()
        self.db.commit()
        return cov.id


# ============================================================================
# Pre-creation validation (for transaction hook)
# ============================================================================


def validate_coverage_before_transaction(
    db: Session,
    account_id: int,
    subscription_id: int,
    payer_type: str,
    member_id: int | None,
    start_date: date,
    end_date: date,
) -> None:
    """Validate coverage data BEFORE creating the transaction.

    Raises SubscriptionValidationError if data is invalid.
    Does NOT insert anything — just validates.
    """
    if end_date < start_date:
        raise SubscriptionValidationError("Дата окончания должна быть >= даты начала")

    if payer_type not in ("SELF", "MEMBER"):
        raise SubscriptionValidationError("payer_type должен быть SELF или MEMBER")

    if payer_type == "SELF" and member_id is not None:
        raise SubscriptionValidationError("SELF оплата не должна указывать member_id")

    if payer_type == "MEMBER" and not member_id:
        raise SubscriptionValidationError("MEMBER оплата должна указывать member_id")

    sub = db.query(SubscriptionModel).filter(
        SubscriptionModel.id == subscription_id,
        SubscriptionModel.account_id == account_id,
    ).first()
    if not sub:
        raise SubscriptionValidationError("Подписка не найдена")

    if payer_type == "MEMBER":
        m = db.query(SubscriptionMemberModel).filter(
            SubscriptionMemberModel.id == member_id,
            SubscriptionMemberModel.subscription_id == subscription_id,
        ).first()
        if not m:
            raise SubscriptionValidationError("Участник не найден")

    if _coverage_overlaps(db, subscription_id, payer_type, member_id,
                          start_date, end_date):
        raise SubscriptionValidationError(
            "Период покрытия пересекается с существующим"
        )


# ============================================================================
# Detail calculation
# ============================================================================


def compute_subscription_detail(
    db: Session,
    sub: SubscriptionModel,
    selected_month: date,
) -> dict:
    """Compute subscription detail for a given month.

    INITIAL coverages affect only paid_until (not monthly cost/income).
    OPERATION coverages affect both paid_until and monthly cost/income.

    Returns dict with:
        cost_month: Decimal — SELF cost distributed to this month (OPERATION only)
        income_month: Decimal — MEMBER income distributed to this month (OPERATION only)
        net: Decimal — income_month - cost_month
        paid_until_self: date | None — max end month among ALL SELF coverages
        members_paid_until: list[dict] — [{member, paid_until}, ...]
        coverage_log: list — all coverages with tx info
    """
    selected_month = selected_month.replace(day=1)

    coverages = db.query(SubscriptionCoverageModel).filter(
        SubscriptionCoverageModel.subscription_id == sub.id,
    ).all()

    # Gather transaction amounts (only OPERATION coverages have transactions)
    tx_ids = [c.transaction_id for c in coverages if c.transaction_id is not None]
    tx_map = {}
    if tx_ids:
        txs = db.query(TransactionFeed).filter(
            TransactionFeed.transaction_id.in_(tx_ids),
        ).all()
        tx_map = {t.transaction_id: t for t in txs}

    cost_month = Decimal("0")
    income_month = Decimal("0")
    max_self_end = None

    members = db.query(SubscriptionMemberModel).filter(
        SubscriptionMemberModel.subscription_id == sub.id,
    ).all()
    member_map = {m.id: m for m in members}

    # Build contact_map for resolving names
    contact_ids = list({m.contact_id for m in members})
    contact_map = {}
    if contact_ids:
        contacts = db.query(ContactModel).filter(
            ContactModel.id.in_(contact_ids),
        ).all()
        contact_map = {c.id: c for c in contacts}

    member_ends: dict[int, date] = {}

    for cov in coverages:
        months_count = _compute_months(cov.start_date, cov.end_date)

        # Monthly cost/income — ONLY from OPERATION coverages
        if cov.source_type == "OPERATION" and cov.transaction_id is not None:
            tx = tx_map.get(cov.transaction_id)
            if tx:
                per_month = tx.amount / months_count
                start_month_norm = cov.start_date.replace(day=1)
                cov_end_month = _add_months(start_month_norm, months_count)
                if start_month_norm <= selected_month < cov_end_month:
                    if cov.payer_type == "SELF":
                        cost_month += per_month
                    else:
                        income_month += per_month

        # Paid-until tracking — ALL coverages (INITIAL + OPERATION)
        if cov.payer_type == "SELF":
            if max_self_end is None or cov.end_date > max_self_end:
                max_self_end = cov.end_date
        elif cov.member_id:
            prev = member_ends.get(cov.member_id)
            if prev is None or cov.end_date > prev:
                member_ends[cov.member_id] = cov.end_date

    members_paid_until = []
    for m in members:
        end = member_ends.get(m.id)
        members_paid_until.append({
            "member": m,
            "contact": contact_map.get(m.contact_id),
            "paid_until": end,
        })

    # Build coverage log with tx info
    coverage_log = []
    for cov in coverages:
        tx = tx_map.get(cov.transaction_id) if cov.transaction_id else None
        months_count = _compute_months(cov.start_date, cov.end_date)
        member = member_map.get(cov.member_id) if cov.member_id else None
        contact = contact_map.get(member.contact_id) if member else None
        coverage_log.append({
            "coverage": cov,
            "tx": tx,
            "months_count": months_count,
            "member": member,
            "contact": contact,
        })
    coverage_log.sort(key=lambda x: x["coverage"].start_date, reverse=True)

    return {
        "cost_month": cost_month,
        "income_month": income_month,
        "net": income_month - cost_month,
        "paid_until_self": max_self_end,
        "members_paid_until": members_paid_until,
        "coverage_log": coverage_log,
        "contact_map": contact_map,
    }


# ============================================================================
# Subscriptions overview (progress bars)
# ============================================================================


def _progress_info(coverages: list, today: date) -> dict | None:
    """Compute paid_until + progress from a list of coverages for one payer."""
    if not coverages:
        return None
    # paid_until = max end_date
    best = max(coverages, key=lambda c: c.end_date)
    paid_until = best.end_date
    start = best.start_date
    total_days = (paid_until - start).days + 1
    days_left = (paid_until - today).days
    # Progress bar shows "days remaining" (100% = fully paid, 0% = expired)
    pct = max(0, min(100, (days_left + 1) / total_days * 100)) if total_days > 0 else 0
    return {
        "paid_until": paid_until,
        "pct": round(pct, 1),
        "days_left": days_left,
        "expired": days_left < 0,
    }


def compute_subscriptions_overview(
    db: Session,
    account_id: int,
    sub_ids: list[int],
    today: date | None = None,
) -> dict:
    """Compute paid_until + progress for SELF and members for multiple subscriptions.

    Returns dict[sub_id] → {
        "self": { paid_until, pct, days_left, expired } | None,
        "members": [ { contact_name, paid_until, pct, days_left, expired } ],
    }
    """
    if today is None:
        today = date.today()

    if not sub_ids:
        return {}

    # 1. Batch load coverages
    coverages = db.query(SubscriptionCoverageModel).filter(
        SubscriptionCoverageModel.subscription_id.in_(sub_ids),
    ).all()

    # 2. Batch load members + contacts
    members = db.query(SubscriptionMemberModel).filter(
        SubscriptionMemberModel.subscription_id.in_(sub_ids),
        SubscriptionMemberModel.is_archived == False,
    ).all()
    member_map = {m.id: m for m in members}

    contact_ids = list({m.contact_id for m in members})
    contact_map = {}
    if contact_ids:
        contacts = db.query(ContactModel).filter(
            ContactModel.id.in_(contact_ids),
        ).all()
        contact_map = {c.id: c for c in contacts}

    # 3. Group coverages by (sub_id, payer_type, member_id)
    # SELF coverages per sub
    self_covs: dict[int, list] = {}
    # MEMBER coverages per (sub_id, member_id)
    member_covs: dict[tuple[int, int], list] = {}

    for cov in coverages:
        if cov.payer_type == "SELF":
            self_covs.setdefault(cov.subscription_id, []).append(cov)
        elif cov.member_id:
            key = (cov.subscription_id, cov.member_id)
            member_covs.setdefault(key, []).append(cov)

    # 4. Group members by sub_id
    members_by_sub: dict[int, list] = {}
    for m in members:
        members_by_sub.setdefault(m.subscription_id, []).append(m)

    # 5. Build result
    result = {}
    for sub_id in sub_ids:
        self_info = _progress_info(self_covs.get(sub_id, []), today)

        members_info = []
        for m in members_by_sub.get(sub_id, []):
            key = (sub_id, m.id)
            info = _progress_info(member_covs.get(key, []), today)
            contact = contact_map.get(m.contact_id)
            members_info.append({
                "contact_name": contact.name if contact else "?",
                **(info or {"paid_until": None, "pct": 0, "days_left": 0, "expired": False}),
                "has_data": info is not None,
                "payment_per_year": m.payment_per_year,
                "payment_per_month": m.payment_per_month,
            })

        result[sub_id] = {
            "self": self_info,
            "members": members_info,
        }

    return result
