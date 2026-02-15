"""Tests for Subscriptions module — CRUD, coverages, overlap, distribution."""
import pytest
from datetime import date, datetime
from decimal import Decimal

from app.infrastructure.db.models import (
    SubscriptionModel, SubscriptionMemberModel, SubscriptionCoverageModel,
    CategoryInfo, TransactionFeed, WalletBalance, ContactModel,
)
from app.application.subscriptions import (
    CreateSubscriptionUseCase, UpdateSubscriptionUseCase,
    ArchiveSubscriptionUseCase, UnarchiveSubscriptionUseCase,
    AddSubscriptionMemberUseCase, ArchiveMemberUseCase, UnarchiveMemberUseCase,
    UpdateMemberPaymentUseCase,
    CreateSubscriptionCoverageUseCase, CreateInitialCoverageUseCase,
    SubscriptionValidationError,
    validate_coverage_before_transaction, compute_subscription_detail,
    _compute_months,
)
from app.application.contacts import CreateContactUseCase

ACCOUNT = 1
_NOW = datetime(2026, 1, 1, 0, 0, 0)


@pytest.fixture
def wallet(db_session):
    w = WalletBalance(
        wallet_id=1, account_id=ACCOUNT,
        title="Наличные", currency="RUB", wallet_type="REGULAR",
        balance=100000, is_archived=False, created_at=_NOW,
    )
    db_session.add(w)
    db_session.flush()
    return w


@pytest.fixture
def expense_cat(db_session):
    c = CategoryInfo(
        category_id=10, account_id=ACCOUNT,
        title="Подписки", category_type="EXPENSE",
        is_system=False, is_archived=False, created_at=_NOW,
    )
    db_session.add(c)
    db_session.flush()
    return c


@pytest.fixture
def income_cat(db_session):
    c = CategoryInfo(
        category_id=20, account_id=ACCOUNT,
        title="Компенсации подписок", category_type="INCOME",
        is_system=False, is_archived=False, created_at=_NOW,
    )
    db_session.add(c)
    db_session.flush()
    return c


@pytest.fixture
def subscription(db_session, expense_cat, income_cat):
    sub_id = CreateSubscriptionUseCase(db_session).execute(
        account_id=ACCOUNT,
        name="YouTube Premium",
        expense_category_id=expense_cat.category_id,
        income_category_id=income_cat.category_id,
    )
    return db_session.query(SubscriptionModel).filter(
        SubscriptionModel.id == sub_id,
    ).first()


@pytest.fixture
def contact(db_session):
    cid = CreateContactUseCase(db_session).execute(
        account_id=ACCOUNT, name="Иван",
    )
    return db_session.query(ContactModel).filter(
        ContactModel.id == cid,
    ).first()


@pytest.fixture
def member(db_session, subscription, contact):
    mid = AddSubscriptionMemberUseCase(db_session).execute(
        account_id=ACCOUNT,
        subscription_id=subscription.id,
        contact_id=contact.id,
    )
    return db_session.query(SubscriptionMemberModel).filter(
        SubscriptionMemberModel.id == mid,
    ).first()


def _make_tx(db, tx_id, op_type, amount, category_id):
    """Helper: create a TransactionFeed record."""
    tx = TransactionFeed(
        transaction_id=tx_id, account_id=ACCOUNT,
        operation_type=op_type, amount=Decimal(str(amount)),
        currency="RUB", wallet_id=1, category_id=category_id,
        description="test", occurred_at=_NOW,
    )
    db.add(tx)
    db.flush()
    return tx


# ======================================================================
# 0. _compute_months helper
# ======================================================================

class TestComputeMonths:
    def test_full_months(self):
        # 01.01 -> 31.03 = 3 months
        assert _compute_months(date(2026, 1, 1), date(2026, 3, 31)) == 3

    def test_mid_month_to_mid_month(self):
        # 05.05 -> 04.07: end_excl=05.07, 7-5=2
        assert _compute_months(date(2025, 5, 5), date(2025, 7, 4)) == 2

    def test_full_year(self):
        # 01.01 -> 31.12 = 12 months
        assert _compute_months(date(2026, 1, 1), date(2026, 12, 31)) == 12

    def test_same_day_returns_1(self):
        assert _compute_months(date(2026, 1, 1), date(2026, 1, 1)) == 1

    def test_within_same_month_returns_1(self):
        assert _compute_months(date(2026, 3, 5), date(2026, 3, 20)) == 1


# ======================================================================
# 1. Create subscription
# ======================================================================

class TestCreateSubscription:
    def test_create_subscription(self, db_session, expense_cat, income_cat):
        sub_id = CreateSubscriptionUseCase(db_session).execute(
            account_id=ACCOUNT,
            name="Netflix",
            expense_category_id=expense_cat.category_id,
            income_category_id=income_cat.category_id,
        )
        sub = db_session.query(SubscriptionModel).filter(
            SubscriptionModel.id == sub_id,
        ).first()
        assert sub is not None
        assert sub.name == "Netflix"
        assert sub.is_archived is False

    def test_empty_name_fails(self, db_session, expense_cat, income_cat):
        with pytest.raises(SubscriptionValidationError, match="Название"):
            CreateSubscriptionUseCase(db_session).execute(
                account_id=ACCOUNT,
                name="  ",
                expense_category_id=expense_cat.category_id,
                income_category_id=income_cat.category_id,
            )


# ======================================================================
# 2. Archive / Unarchive subscription
# ======================================================================

class TestArchiveUnarchiveSubscription:
    def test_archive(self, db_session, subscription):
        ArchiveSubscriptionUseCase(db_session).execute(subscription.id, ACCOUNT)
        sub = db_session.query(SubscriptionModel).filter(
            SubscriptionModel.id == subscription.id,
        ).first()
        assert sub.is_archived is True

    def test_archive_already_archived_fails(self, db_session, subscription):
        ArchiveSubscriptionUseCase(db_session).execute(subscription.id, ACCOUNT)
        with pytest.raises(SubscriptionValidationError, match="уже в архиве"):
            ArchiveSubscriptionUseCase(db_session).execute(subscription.id, ACCOUNT)

    def test_unarchive(self, db_session, subscription):
        ArchiveSubscriptionUseCase(db_session).execute(subscription.id, ACCOUNT)
        UnarchiveSubscriptionUseCase(db_session).execute(subscription.id, ACCOUNT)
        sub = db_session.query(SubscriptionModel).filter(
            SubscriptionModel.id == subscription.id,
        ).first()
        assert sub.is_archived is False


# ======================================================================
# 3. Members
# ======================================================================

class TestMembers:
    def test_add_member(self, db_session, subscription):
        # Create a contact first
        cid = CreateContactUseCase(db_session).execute(
            account_id=ACCOUNT, name="Петя",
        )
        mid = AddSubscriptionMemberUseCase(db_session).execute(
            account_id=ACCOUNT,
            subscription_id=subscription.id,
            contact_id=cid,
        )
        m = db_session.query(SubscriptionMemberModel).filter(
            SubscriptionMemberModel.id == mid,
        ).first()
        assert m is not None
        assert m.contact_id == cid

    def test_duplicate_contact_in_subscription_fails(self, db_session, subscription, contact):
        # Add contact once
        AddSubscriptionMemberUseCase(db_session).execute(
            account_id=ACCOUNT,
            subscription_id=subscription.id,
            contact_id=contact.id,
        )
        # Try to add same contact again
        with pytest.raises(SubscriptionValidationError, match="уже добавлен"):
            AddSubscriptionMemberUseCase(db_session).execute(
                account_id=ACCOUNT,
                subscription_id=subscription.id,
                contact_id=contact.id,
            )

    def test_archive_member(self, db_session, subscription, member):
        ArchiveMemberUseCase(db_session).execute(member.id, ACCOUNT)
        m = db_session.query(SubscriptionMemberModel).filter(
            SubscriptionMemberModel.id == member.id,
        ).first()
        assert m.is_archived is True

    def test_add_member_with_payment(self, db_session, subscription):
        cid = CreateContactUseCase(db_session).execute(
            account_id=ACCOUNT, name="Маша",
        )
        mid = AddSubscriptionMemberUseCase(db_session).execute(
            account_id=ACCOUNT,
            subscription_id=subscription.id,
            contact_id=cid,
            payment_per_year=Decimal("1200"),
            payment_per_month=Decimal("100"),
        )
        m = db_session.query(SubscriptionMemberModel).get(mid)
        assert m.payment_per_year == Decimal("1200")
        assert m.payment_per_month == Decimal("100")

    def test_add_member_without_payment(self, db_session, subscription):
        cid = CreateContactUseCase(db_session).execute(
            account_id=ACCOUNT, name="Саша",
        )
        mid = AddSubscriptionMemberUseCase(db_session).execute(
            account_id=ACCOUNT,
            subscription_id=subscription.id,
            contact_id=cid,
        )
        m = db_session.query(SubscriptionMemberModel).get(mid)
        assert m.payment_per_year is None
        assert m.payment_per_month is None

    def test_update_member_payment(self, db_session, subscription, member):
        UpdateMemberPaymentUseCase(db_session).execute(
            member.id, ACCOUNT,
            payment_per_year=Decimal("2400"),
            payment_per_month=Decimal("200"),
        )
        db_session.refresh(member)
        assert member.payment_per_year == Decimal("2400")
        assert member.payment_per_month == Decimal("200")

    def test_update_member_payment_clear(self, db_session, subscription, member):
        # Set then clear
        UpdateMemberPaymentUseCase(db_session).execute(
            member.id, ACCOUNT,
            payment_per_year=Decimal("1000"),
            payment_per_month=None,
        )
        db_session.refresh(member)
        assert member.payment_per_year == Decimal("1000")
        assert member.payment_per_month is None

        UpdateMemberPaymentUseCase(db_session).execute(
            member.id, ACCOUNT,
            payment_per_year=None,
            payment_per_month=None,
        )
        db_session.refresh(member)
        assert member.payment_per_year is None
        assert member.payment_per_month is None

    def test_update_payment_not_found(self, db_session):
        with pytest.raises(SubscriptionValidationError, match="не найден"):
            UpdateMemberPaymentUseCase(db_session).execute(
                999, ACCOUNT,
                payment_per_year=Decimal("100"),
                payment_per_month=None,
            )


# ======================================================================
# 4. SELF coverage
# ======================================================================

class TestSelfCoverage:
    def test_create_self_coverage(self, db_session, wallet, subscription):
        tx = _make_tx(db_session, 100, "EXPENSE", 900, subscription.expense_category_id)
        cov_id = CreateSubscriptionCoverageUseCase(db_session).execute(
            account_id=ACCOUNT,
            subscription_id=subscription.id,
            payer_type="SELF",
            member_id=None,
            transaction_id=100,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 3, 31),
        )
        cov = db_session.query(SubscriptionCoverageModel).filter(
            SubscriptionCoverageModel.id == cov_id,
        ).first()
        assert cov is not None
        assert cov.end_date == date(2026, 3, 31)
        assert cov.payer_type == "SELF"

    def test_self_coverage_overlap_fails(self, db_session, wallet, subscription):
        tx1 = _make_tx(db_session, 101, "EXPENSE", 900, subscription.expense_category_id)
        CreateSubscriptionCoverageUseCase(db_session).execute(
            account_id=ACCOUNT,
            subscription_id=subscription.id,
            payer_type="SELF",
            member_id=None,
            transaction_id=101,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 3, 31),
        )
        # Overlapping: Feb 2026 falls in both
        tx2 = _make_tx(db_session, 102, "EXPENSE", 600, subscription.expense_category_id)
        with pytest.raises(SubscriptionValidationError, match="пересекается"):
            CreateSubscriptionCoverageUseCase(db_session).execute(
                account_id=ACCOUNT,
                subscription_id=subscription.id,
                payer_type="SELF",
                member_id=None,
                transaction_id=102,
                start_date=date(2026, 2, 1),
                end_date=date(2026, 3, 31),
            )

    def test_self_coverage_adjacent_ok(self, db_session, wallet, subscription):
        tx1 = _make_tx(db_session, 103, "EXPENSE", 300, subscription.expense_category_id)
        CreateSubscriptionCoverageUseCase(db_session).execute(
            account_id=ACCOUNT,
            subscription_id=subscription.id,
            payer_type="SELF",
            member_id=None,
            transaction_id=103,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 3, 31),
        )
        # Adjacent: starts the day after previous ends
        tx2 = _make_tx(db_session, 104, "EXPENSE", 300, subscription.expense_category_id)
        cov_id = CreateSubscriptionCoverageUseCase(db_session).execute(
            account_id=ACCOUNT,
            subscription_id=subscription.id,
            payer_type="SELF",
            member_id=None,
            transaction_id=104,
            start_date=date(2026, 4, 1),
            end_date=date(2026, 6, 30),
        )
        assert cov_id is not None

    def test_self_member_id_must_be_null(self, db_session, wallet, subscription, member):
        tx = _make_tx(db_session, 105, "EXPENSE", 300, subscription.expense_category_id)
        with pytest.raises(SubscriptionValidationError, match="member_id"):
            CreateSubscriptionCoverageUseCase(db_session).execute(
                account_id=ACCOUNT,
                subscription_id=subscription.id,
                payer_type="SELF",
                member_id=member.id,
                transaction_id=105,
                start_date=date(2026, 1, 1),
                end_date=date(2026, 1, 31),
            )


# ======================================================================
# 5. MEMBER coverage
# ======================================================================

class TestMemberCoverage:
    def test_create_member_coverage(self, db_session, wallet, subscription, member):
        tx = _make_tx(db_session, 200, "INCOME", 300, subscription.income_category_id)
        cov_id = CreateSubscriptionCoverageUseCase(db_session).execute(
            account_id=ACCOUNT,
            subscription_id=subscription.id,
            payer_type="MEMBER",
            member_id=member.id,
            transaction_id=200,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 3, 31),
        )
        cov = db_session.query(SubscriptionCoverageModel).filter(
            SubscriptionCoverageModel.id == cov_id,
        ).first()
        assert cov is not None
        assert cov.payer_type == "MEMBER"
        assert cov.member_id == member.id

    def test_member_coverage_overlap_fails(self, db_session, wallet, subscription, member):
        tx1 = _make_tx(db_session, 201, "INCOME", 300, subscription.income_category_id)
        CreateSubscriptionCoverageUseCase(db_session).execute(
            account_id=ACCOUNT,
            subscription_id=subscription.id,
            payer_type="MEMBER",
            member_id=member.id,
            transaction_id=201,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 3, 31),
        )
        tx2 = _make_tx(db_session, 202, "INCOME", 300, subscription.income_category_id)
        with pytest.raises(SubscriptionValidationError, match="пересекается"):
            CreateSubscriptionCoverageUseCase(db_session).execute(
                account_id=ACCOUNT,
                subscription_id=subscription.id,
                payer_type="MEMBER",
                member_id=member.id,
                transaction_id=202,
                start_date=date(2026, 2, 1),
                end_date=date(2026, 3, 31),
            )

    def test_member_requires_member_id(self, db_session, wallet, subscription):
        tx = _make_tx(db_session, 203, "INCOME", 300, subscription.income_category_id)
        with pytest.raises(SubscriptionValidationError, match="member_id"):
            CreateSubscriptionCoverageUseCase(db_session).execute(
                account_id=ACCOUNT,
                subscription_id=subscription.id,
                payer_type="MEMBER",
                member_id=None,
                transaction_id=203,
                start_date=date(2026, 1, 1),
                end_date=date(2026, 1, 31),
            )


# ======================================================================
# 6. Monthly distribution
# ======================================================================

class TestMonthlyDistribution:
    def test_amount_split_evenly(self, db_session, wallet, subscription):
        tx = _make_tx(db_session, 300, "EXPENSE", 900, subscription.expense_category_id)
        CreateSubscriptionCoverageUseCase(db_session).execute(
            account_id=ACCOUNT,
            subscription_id=subscription.id,
            payer_type="SELF",
            member_id=None,
            transaction_id=300,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 3, 31),
        )
        # Check each of the 3 months
        for m in [1, 2, 3]:
            detail = compute_subscription_detail(
                db_session, subscription, date(2026, m, 1),
            )
            assert detail["cost_month"] == Decimal("300")  # 900 / 3

        # Month 4 should be 0
        detail = compute_subscription_detail(
            db_session, subscription, date(2026, 4, 1),
        )
        assert detail["cost_month"] == Decimal("0")


# ======================================================================
# 7. Paid until
# ======================================================================

class TestPaidUntil:
    def test_paid_until_self(self, db_session, wallet, subscription):
        tx = _make_tx(db_session, 400, "EXPENSE", 600, subscription.expense_category_id)
        CreateSubscriptionCoverageUseCase(db_session).execute(
            account_id=ACCOUNT,
            subscription_id=subscription.id,
            payer_type="SELF",
            member_id=None,
            transaction_id=400,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 3, 31),
        )
        detail = compute_subscription_detail(
            db_session, subscription, date(2026, 1, 1),
        )
        # paid_until = end_date = 2026-03-31
        assert detail["paid_until_self"] == date(2026, 3, 31)

    def test_paid_until_member(self, db_session, wallet, subscription, member):
        tx = _make_tx(db_session, 401, "INCOME", 300, subscription.income_category_id)
        CreateSubscriptionCoverageUseCase(db_session).execute(
            account_id=ACCOUNT,
            subscription_id=subscription.id,
            payer_type="MEMBER",
            member_id=member.id,
            transaction_id=401,
            start_date=date(2026, 2, 1),
            end_date=date(2026, 3, 31),
        )
        detail = compute_subscription_detail(
            db_session, subscription, date(2026, 1, 1),
        )
        assert len(detail["members_paid_until"]) == 1
        assert detail["members_paid_until"][0]["paid_until"] == date(2026, 3, 31)


# ======================================================================
# 8. Duplicate transaction
# ======================================================================

class TestDuplicateTransaction:
    def test_same_transaction_id_twice_fails(self, db_session, wallet, subscription):
        tx = _make_tx(db_session, 500, "EXPENSE", 300, subscription.expense_category_id)
        CreateSubscriptionCoverageUseCase(db_session).execute(
            account_id=ACCOUNT,
            subscription_id=subscription.id,
            payer_type="SELF",
            member_id=None,
            transaction_id=500,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 1, 31),
        )
        with pytest.raises(SubscriptionValidationError, match="уже привязана"):
            CreateSubscriptionCoverageUseCase(db_session).execute(
                account_id=ACCOUNT,
                subscription_id=subscription.id,
                payer_type="SELF",
                member_id=None,
                transaction_id=500,
                start_date=date(2026, 5, 1),
                end_date=date(2026, 5, 31),
            )


# ======================================================================
# 9. Category validation
# ======================================================================

class TestCategoryValidation:
    def test_self_requires_expense_category(self, db_session, wallet, subscription):
        # Transaction with INCOME category but payer_type=SELF
        tx = _make_tx(db_session, 600, "EXPENSE", 300, subscription.income_category_id)
        with pytest.raises(SubscriptionValidationError, match="статьёй расхода"):
            CreateSubscriptionCoverageUseCase(db_session).execute(
                account_id=ACCOUNT,
                subscription_id=subscription.id,
                payer_type="SELF",
                member_id=None,
                transaction_id=600,
                start_date=date(2026, 1, 1),
                end_date=date(2026, 1, 31),
            )

    def test_member_requires_income_category(self, db_session, wallet, subscription, member):
        # Transaction with EXPENSE category but payer_type=MEMBER
        tx = _make_tx(db_session, 601, "INCOME", 300, subscription.expense_category_id)
        with pytest.raises(SubscriptionValidationError, match="статьёй дохода"):
            CreateSubscriptionCoverageUseCase(db_session).execute(
                account_id=ACCOUNT,
                subscription_id=subscription.id,
                payer_type="MEMBER",
                member_id=member.id,
                transaction_id=601,
                start_date=date(2026, 1, 1),
                end_date=date(2026, 1, 31),
            )


# ======================================================================
# 10. INITIAL coverage — SELF
# ======================================================================

class TestInitialCoverageSelf:
    def test_create_initial_self(self, db_session, subscription):
        cov_id = CreateInitialCoverageUseCase(db_session).execute(
            account_id=ACCOUNT,
            subscription_id=subscription.id,
            payer_type="SELF",
            member_id=None,
            start_date=date(2025, 7, 1),
            end_date=date(2025, 12, 31),
        )
        cov = db_session.query(SubscriptionCoverageModel).filter(
            SubscriptionCoverageModel.id == cov_id,
        ).first()
        assert cov is not None
        assert cov.source_type == "INITIAL"
        assert cov.transaction_id is None
        assert cov.payer_type == "SELF"
        assert cov.end_date == date(2025, 12, 31)

    def test_initial_affects_paid_until(self, db_session, subscription):
        """INITIAL SELF coverage should update paid_until_self."""
        CreateInitialCoverageUseCase(db_session).execute(
            account_id=ACCOUNT,
            subscription_id=subscription.id,
            payer_type="SELF",
            member_id=None,
            start_date=date(2025, 7, 1),
            end_date=date(2025, 12, 31),
        )
        detail = compute_subscription_detail(
            db_session, subscription, date(2026, 1, 1),
        )
        # paid_until = end_date = 2025-12-31
        assert detail["paid_until_self"] == date(2025, 12, 31)

    def test_initial_does_not_affect_monthly(self, db_session, subscription):
        """INITIAL coverage must NOT contribute to monthly cost/income."""
        CreateInitialCoverageUseCase(db_session).execute(
            account_id=ACCOUNT,
            subscription_id=subscription.id,
            payer_type="SELF",
            member_id=None,
            start_date=date(2025, 7, 1),
            end_date=date(2025, 12, 31),
        )
        # Month within the INITIAL range
        detail = compute_subscription_detail(
            db_session, subscription, date(2025, 9, 1),
        )
        assert detail["cost_month"] == Decimal("0")
        assert detail["income_month"] == Decimal("0")
        assert detail["net"] == Decimal("0")


# ======================================================================
# 11. INITIAL coverage — MEMBER
# ======================================================================

class TestInitialCoverageMember:
    def test_create_initial_member(self, db_session, subscription, member):
        cov_id = CreateInitialCoverageUseCase(db_session).execute(
            account_id=ACCOUNT,
            subscription_id=subscription.id,
            payer_type="MEMBER",
            member_id=member.id,
            start_date=date(2025, 10, 1),
            end_date=date(2025, 12, 31),
        )
        cov = db_session.query(SubscriptionCoverageModel).filter(
            SubscriptionCoverageModel.id == cov_id,
        ).first()
        assert cov is not None
        assert cov.source_type == "INITIAL"
        assert cov.payer_type == "MEMBER"
        assert cov.member_id == member.id

    def test_initial_member_affects_paid_until(self, db_session, subscription, member):
        CreateInitialCoverageUseCase(db_session).execute(
            account_id=ACCOUNT,
            subscription_id=subscription.id,
            payer_type="MEMBER",
            member_id=member.id,
            start_date=date(2025, 10, 1),
            end_date=date(2025, 12, 31),
        )
        detail = compute_subscription_detail(
            db_session, subscription, date(2026, 1, 1),
        )
        assert len(detail["members_paid_until"]) == 1
        # paid_until = end_date = 2025-12-31
        assert detail["members_paid_until"][0]["paid_until"] == date(2025, 12, 31)


# ======================================================================
# 12. INITIAL + OPERATION overlap
# ======================================================================

class TestInitialOperationOverlap:
    def test_initial_and_operation_overlap_fails(self, db_session, wallet, subscription):
        """INITIAL and OPERATION coverages must not overlap."""
        # Create INITIAL SELF for Jan-Mar 2026
        CreateInitialCoverageUseCase(db_session).execute(
            account_id=ACCOUNT,
            subscription_id=subscription.id,
            payer_type="SELF",
            member_id=None,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 3, 31),
        )
        # Try to create OPERATION SELF that overlaps (Feb 2026)
        tx = _make_tx(db_session, 700, "EXPENSE", 600, subscription.expense_category_id)
        with pytest.raises(SubscriptionValidationError, match="пересекается"):
            CreateSubscriptionCoverageUseCase(db_session).execute(
                account_id=ACCOUNT,
                subscription_id=subscription.id,
                payer_type="SELF",
                member_id=None,
                transaction_id=700,
                start_date=date(2026, 2, 1),
                end_date=date(2026, 3, 31),
            )

    def test_operation_then_initial_overlap_fails(self, db_session, wallet, subscription):
        """OPERATION first, then INITIAL that overlaps should fail."""
        tx = _make_tx(db_session, 701, "EXPENSE", 300, subscription.expense_category_id)
        CreateSubscriptionCoverageUseCase(db_session).execute(
            account_id=ACCOUNT,
            subscription_id=subscription.id,
            payer_type="SELF",
            member_id=None,
            transaction_id=701,
            start_date=date(2026, 4, 1),
            end_date=date(2026, 6, 30),
        )
        # Try INITIAL that overlaps
        with pytest.raises(SubscriptionValidationError, match="пересекается"):
            CreateInitialCoverageUseCase(db_session).execute(
                account_id=ACCOUNT,
                subscription_id=subscription.id,
                payer_type="SELF",
                member_id=None,
                start_date=date(2026, 3, 1),
                end_date=date(2026, 5, 31),
            )

    def test_initial_adjacent_to_operation_ok(self, db_session, wallet, subscription):
        """INITIAL ending the day before OPERATION starts should be fine."""
        # INITIAL Jan 1 - Mar 31 2026
        CreateInitialCoverageUseCase(db_session).execute(
            account_id=ACCOUNT,
            subscription_id=subscription.id,
            payer_type="SELF",
            member_id=None,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 3, 31),
        )
        # OPERATION Apr 1 - Jun 30 2026 (adjacent, no overlap)
        tx = _make_tx(db_session, 702, "EXPENSE", 900, subscription.expense_category_id)
        cov_id = CreateSubscriptionCoverageUseCase(db_session).execute(
            account_id=ACCOUNT,
            subscription_id=subscription.id,
            payer_type="SELF",
            member_id=None,
            transaction_id=702,
            start_date=date(2026, 4, 1),
            end_date=date(2026, 6, 30),
        )
        assert cov_id is not None


# ======================================================================
# 13. source_type / transaction_id consistency
# ======================================================================

class TestSourceTypeValidation:
    def test_operation_has_source_type_operation(self, db_session, wallet, subscription):
        tx = _make_tx(db_session, 800, "EXPENSE", 300, subscription.expense_category_id)
        cov_id = CreateSubscriptionCoverageUseCase(db_session).execute(
            account_id=ACCOUNT,
            subscription_id=subscription.id,
            payer_type="SELF",
            member_id=None,
            transaction_id=800,
            start_date=date(2026, 7, 1),
            end_date=date(2026, 7, 31),
        )
        cov = db_session.query(SubscriptionCoverageModel).filter(
            SubscriptionCoverageModel.id == cov_id,
        ).first()
        assert cov.source_type == "OPERATION"
        assert cov.transaction_id == 800

    def test_initial_has_null_transaction(self, db_session, subscription):
        cov_id = CreateInitialCoverageUseCase(db_session).execute(
            account_id=ACCOUNT,
            subscription_id=subscription.id,
            payer_type="SELF",
            member_id=None,
            start_date=date(2026, 8, 1),
            end_date=date(2026, 8, 31),
        )
        cov = db_session.query(SubscriptionCoverageModel).filter(
            SubscriptionCoverageModel.id == cov_id,
        ).first()
        assert cov.source_type == "INITIAL"
        assert cov.transaction_id is None


# ======================================================================
# 14. Combined INITIAL + OPERATION detail
# ======================================================================

class TestCombinedDetail:
    def test_initial_plus_operation_paid_until(self, db_session, wallet, subscription):
        """paid_until_self should reflect max of INITIAL and OPERATION end dates."""
        # INITIAL Jan-Jun 2026
        CreateInitialCoverageUseCase(db_session).execute(
            account_id=ACCOUNT,
            subscription_id=subscription.id,
            payer_type="SELF",
            member_id=None,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 6, 30),
        )
        # OPERATION Jul-Sep 2026
        tx = _make_tx(db_session, 900, "EXPENSE", 900, subscription.expense_category_id)
        CreateSubscriptionCoverageUseCase(db_session).execute(
            account_id=ACCOUNT,
            subscription_id=subscription.id,
            payer_type="SELF",
            member_id=None,
            transaction_id=900,
            start_date=date(2026, 7, 1),
            end_date=date(2026, 9, 30),
        )
        detail = compute_subscription_detail(
            db_session, subscription, date(2026, 7, 1),
        )
        # paid_until_self = max(Jun 30, Sep 30) = Sep 30
        assert detail["paid_until_self"] == date(2026, 9, 30)
        # Monthly cost in Jul should be 900/3 = 300 (only OPERATION)
        assert detail["cost_month"] == Decimal("300")

    def test_initial_month_has_zero_cost(self, db_session, wallet, subscription):
        """A month covered only by INITIAL should show 0 cost."""
        # INITIAL Jan-Mar 2026
        CreateInitialCoverageUseCase(db_session).execute(
            account_id=ACCOUNT,
            subscription_id=subscription.id,
            payer_type="SELF",
            member_id=None,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 3, 31),
        )
        # OPERATION Apr-Jun 2026
        tx = _make_tx(db_session, 901, "EXPENSE", 600, subscription.expense_category_id)
        CreateSubscriptionCoverageUseCase(db_session).execute(
            account_id=ACCOUNT,
            subscription_id=subscription.id,
            payer_type="SELF",
            member_id=None,
            transaction_id=901,
            start_date=date(2026, 4, 1),
            end_date=date(2026, 6, 30),
        )
        # February — within INITIAL only
        detail_feb = compute_subscription_detail(
            db_session, subscription, date(2026, 2, 1),
        )
        assert detail_feb["cost_month"] == Decimal("0")

        # May — within OPERATION
        detail_may = compute_subscription_detail(
            db_session, subscription, date(2026, 5, 1),
        )
        assert detail_may["cost_month"] == Decimal("200")  # 600/3
