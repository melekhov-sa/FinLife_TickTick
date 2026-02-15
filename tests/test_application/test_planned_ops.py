"""Tests for Planned Operations — CRUD, versioning, archive/unarchive, confirm/skip."""
import pytest
from datetime import date, datetime
from decimal import Decimal

from app.infrastructure.db.models import (
    WalletBalance, CategoryInfo, OperationTemplateModel, OperationOccurrence,
)
from app.application.operation_templates import (
    CreateOperationTemplateUseCase,
    UpdateOperationTemplateUseCase,
    ArchiveOperationTemplateUseCase,
    UnarchiveOperationTemplateUseCase,
    ConfirmOperationOccurrenceUseCase,
    SkipOperationOccurrenceUseCase,
    OperationTemplateValidationError,
)

ACCOUNT = 1
_NOW = datetime(2026, 1, 1, 0, 0, 0)


@pytest.fixture
def wallets(db_session):
    regular = WalletBalance(
        wallet_id=1, account_id=ACCOUNT,
        title="Наличные", currency="RUB", wallet_type="REGULAR", balance=10000,
        is_archived=False, created_at=_NOW,
    )
    savings = WalletBalance(
        wallet_id=2, account_id=ACCOUNT,
        title="Накопления", currency="RUB", wallet_type="SAVINGS", balance=50000,
        is_archived=False, created_at=_NOW,
    )
    credit = WalletBalance(
        wallet_id=3, account_id=ACCOUNT,
        title="Кредитка", currency="RUB", wallet_type="CREDIT", balance=-5000,
        is_archived=False, created_at=_NOW,
    )
    db_session.add_all([regular, savings, credit])
    db_session.flush()
    return {"regular": regular, "savings": savings, "credit": credit}


@pytest.fixture
def category(db_session):
    cat = CategoryInfo(
        category_id=1, account_id=ACCOUNT,
        title="Зарплата", category_type="INCOME",
        is_system=False, is_archived=False,
        created_at=_NOW,
    )
    db_session.add(cat)
    db_session.flush()
    return cat


@pytest.fixture
def expense_category(db_session):
    cat = CategoryInfo(
        category_id=2, account_id=ACCOUNT,
        title="Еда", category_type="EXPENSE",
        is_system=False, is_archived=False,
        created_at=_NOW,
    )
    db_session.add(cat)
    db_session.flush()
    return cat


def _get_template(db, template_id):
    return db.query(OperationTemplateModel).filter(
        OperationTemplateModel.template_id == template_id,
    ).first()


# ======================================================================
# 1. Create EXPENSE
# ======================================================================

class TestCreateExpense:
    def test_create_expense_template(self, db_session, wallets, expense_category):
        tid = CreateOperationTemplateUseCase(db_session).execute(
            account_id=ACCOUNT, title="Обед", freq="MONTHLY",
            interval=1, start_date="2026-03-01", kind="EXPENSE",
            amount="500", wallet_id=1, category_id=2,
        )
        tmpl = _get_template(db_session, tid)
        assert tmpl is not None
        assert tmpl.title == "Обед"
        assert tmpl.kind == "EXPENSE"
        assert tmpl.amount == Decimal("500")
        assert tmpl.wallet_id == 1
        assert tmpl.category_id == 2
        assert tmpl.is_archived is False

    def test_expense_without_wallet_fails(self, db_session, wallets, expense_category):
        with pytest.raises(OperationTemplateValidationError, match="Кошелёк обязателен"):
            CreateOperationTemplateUseCase(db_session).execute(
                account_id=ACCOUNT, title="Обед", freq="MONTHLY",
                interval=1, start_date="2026-03-01", kind="EXPENSE",
                amount="500", wallet_id=None, category_id=2,
            )

    def test_expense_without_category_fails(self, db_session, wallets):
        with pytest.raises(OperationTemplateValidationError, match="Категория обязательна"):
            CreateOperationTemplateUseCase(db_session).execute(
                account_id=ACCOUNT, title="Обед", freq="MONTHLY",
                interval=1, start_date="2026-03-01", kind="EXPENSE",
                amount="500", wallet_id=1, category_id=None,
            )


# ======================================================================
# 2. Create INCOME
# ======================================================================

class TestCreateIncome:
    def test_create_income_template(self, db_session, wallets, category):
        tid = CreateOperationTemplateUseCase(db_session).execute(
            account_id=ACCOUNT, title="Зарплата", freq="MONTHLY",
            interval=1, start_date="2026-03-01", kind="INCOME",
            amount="100000", wallet_id=1, category_id=1,
        )
        tmpl = _get_template(db_session, tid)
        assert tmpl is not None
        assert tmpl.kind == "INCOME"
        assert tmpl.amount == Decimal("100000")

    def test_income_without_category_fails(self, db_session, wallets):
        with pytest.raises(OperationTemplateValidationError, match="Категория обязательна"):
            CreateOperationTemplateUseCase(db_session).execute(
                account_id=ACCOUNT, title="ЗП", freq="MONTHLY",
                interval=1, start_date="2026-03-01", kind="INCOME",
                amount="100000", wallet_id=1, category_id=None,
            )


# ======================================================================
# 3. No TRANSFER
# ======================================================================

class TestNoTransfer:
    def test_transfer_kind_rejected(self, db_session, wallets, category):
        with pytest.raises(OperationTemplateValidationError, match="Неверный тип операции"):
            CreateOperationTemplateUseCase(db_session).execute(
                account_id=ACCOUNT, title="Перевод", freq="MONTHLY",
                interval=1, start_date="2026-03-01", kind="TRANSFER",
                amount="1000", wallet_id=1, category_id=1,
            )


# ======================================================================
# 4. Versioning
# ======================================================================

class TestVersioning:
    def test_no_confirmed_occurrences_updates_in_place(self, db_session, wallets, expense_category):
        """Without confirmed occurrences, money field changes are in-place."""
        tid = CreateOperationTemplateUseCase(db_session).execute(
            account_id=ACCOUNT, title="Обед", freq="MONTHLY",
            interval=1, start_date="2026-03-01", kind="EXPENSE",
            amount="500", wallet_id=1, category_id=2,
        )
        result = UpdateOperationTemplateUseCase(db_session).execute(
            template_id=tid, account_id=ACCOUNT,
            amount="700",
        )
        assert result is None  # no new version
        tmpl = _get_template(db_session, tid)
        assert tmpl.amount == Decimal("700")

    def test_confirmed_occurrences_creates_new_version(self, db_session, wallets, expense_category):
        """With confirmed occurrences, money field changes create a new version."""
        tid = CreateOperationTemplateUseCase(db_session).execute(
            account_id=ACCOUNT, title="Обед", freq="MONTHLY",
            interval=1, start_date="2026-03-01", kind="EXPENSE",
            amount="500", wallet_id=1, category_id=2,
        )
        # Simulate a confirmed occurrence
        db_session.add(OperationOccurrence(
            account_id=ACCOUNT, template_id=tid,
            scheduled_date=date(2026, 3, 1), status="DONE",
        ))
        db_session.flush()

        new_tid = UpdateOperationTemplateUseCase(db_session).execute(
            template_id=tid, account_id=ACCOUNT,
            version_from_date="2026-04-01",
            amount="700",
        )
        assert new_tid is not None
        assert new_tid != tid

    def test_new_version_closes_old_active_until(self, db_session, wallets, expense_category):
        """Old version gets active_until = version_from_date - 1 day."""
        tid = CreateOperationTemplateUseCase(db_session).execute(
            account_id=ACCOUNT, title="Обед", freq="MONTHLY",
            interval=1, start_date="2026-03-01", kind="EXPENSE",
            amount="500", wallet_id=1, category_id=2,
        )
        db_session.add(OperationOccurrence(
            account_id=ACCOUNT, template_id=tid,
            scheduled_date=date(2026, 3, 1), status="DONE",
        ))
        db_session.flush()

        UpdateOperationTemplateUseCase(db_session).execute(
            template_id=tid, account_id=ACCOUNT,
            version_from_date="2026-04-01",
            amount="700",
        )
        old = _get_template(db_session, tid)
        assert old.active_until == date(2026, 3, 31)

    def test_new_version_has_correct_active_from(self, db_session, wallets, expense_category):
        """New version starts at version_from_date."""
        tid = CreateOperationTemplateUseCase(db_session).execute(
            account_id=ACCOUNT, title="Обед", freq="MONTHLY",
            interval=1, start_date="2026-03-01", kind="EXPENSE",
            amount="500", wallet_id=1, category_id=2,
        )
        db_session.add(OperationOccurrence(
            account_id=ACCOUNT, template_id=tid,
            scheduled_date=date(2026, 3, 1), status="SKIPPED",
        ))
        db_session.flush()

        new_tid = UpdateOperationTemplateUseCase(db_session).execute(
            template_id=tid, account_id=ACCOUNT,
            version_from_date="2026-05-01",
            amount="800",
        )
        new_tmpl = _get_template(db_session, new_tid)
        assert new_tmpl.active_from == date(2026, 5, 1)
        assert new_tmpl.amount == Decimal("800")

    def test_light_changes_always_in_place(self, db_session, wallets, expense_category):
        """Title/note changes are always in-place, even with confirmed occurrences."""
        tid = CreateOperationTemplateUseCase(db_session).execute(
            account_id=ACCOUNT, title="Обед", freq="MONTHLY",
            interval=1, start_date="2026-03-01", kind="EXPENSE",
            amount="500", wallet_id=1, category_id=2,
        )
        db_session.add(OperationOccurrence(
            account_id=ACCOUNT, template_id=tid,
            scheduled_date=date(2026, 3, 1), status="DONE",
        ))
        db_session.flush()

        result = UpdateOperationTemplateUseCase(db_session).execute(
            template_id=tid, account_id=ACCOUNT,
            title="Ужин",
            note="В ресторане",
        )
        assert result is None  # no new version
        tmpl = _get_template(db_session, tid)
        assert tmpl.title == "Ужин"
        assert tmpl.note == "В ресторане"

    def test_version_from_date_required_with_confirmed(self, db_session, wallets, expense_category):
        """Money change with confirmed but no version_from_date raises error."""
        tid = CreateOperationTemplateUseCase(db_session).execute(
            account_id=ACCOUNT, title="Обед", freq="MONTHLY",
            interval=1, start_date="2026-03-01", kind="EXPENSE",
            amount="500", wallet_id=1, category_id=2,
        )
        db_session.add(OperationOccurrence(
            account_id=ACCOUNT, template_id=tid,
            scheduled_date=date(2026, 3, 1), status="DONE",
        ))
        db_session.flush()

        with pytest.raises(OperationTemplateValidationError, match="дату начала новой версии"):
            UpdateOperationTemplateUseCase(db_session).execute(
                template_id=tid, account_id=ACCOUNT,
                amount="700",
            )


# ======================================================================
# 5. Archive / Unarchive
# ======================================================================

class TestArchiveUnarchive:
    def test_archive_sets_is_archived(self, db_session, wallets, expense_category):
        tid = CreateOperationTemplateUseCase(db_session).execute(
            account_id=ACCOUNT, title="Обед", freq="MONTHLY",
            interval=1, start_date="2026-03-01", kind="EXPENSE",
            amount="500", wallet_id=1, category_id=2,
        )
        ArchiveOperationTemplateUseCase(db_session).execute(tid, ACCOUNT)
        tmpl = _get_template(db_session, tid)
        assert tmpl.is_archived is True

    def test_archive_already_archived_fails(self, db_session, wallets, expense_category):
        tid = CreateOperationTemplateUseCase(db_session).execute(
            account_id=ACCOUNT, title="Обед", freq="MONTHLY",
            interval=1, start_date="2026-03-01", kind="EXPENSE",
            amount="500", wallet_id=1, category_id=2,
        )
        ArchiveOperationTemplateUseCase(db_session).execute(tid, ACCOUNT)
        with pytest.raises(OperationTemplateValidationError, match="уже в архиве"):
            ArchiveOperationTemplateUseCase(db_session).execute(tid, ACCOUNT)

    def test_unarchive_restores(self, db_session, wallets, expense_category):
        tid = CreateOperationTemplateUseCase(db_session).execute(
            account_id=ACCOUNT, title="Обед", freq="MONTHLY",
            interval=1, start_date="2026-03-01", kind="EXPENSE",
            amount="500", wallet_id=1, category_id=2,
        )
        ArchiveOperationTemplateUseCase(db_session).execute(tid, ACCOUNT)
        UnarchiveOperationTemplateUseCase(db_session).execute(tid, ACCOUNT)
        tmpl = _get_template(db_session, tid)
        assert tmpl.is_archived is False

    def test_unarchive_already_active_fails(self, db_session, wallets, expense_category):
        tid = CreateOperationTemplateUseCase(db_session).execute(
            account_id=ACCOUNT, title="Обед", freq="MONTHLY",
            interval=1, start_date="2026-03-01", kind="EXPENSE",
            amount="500", wallet_id=1, category_id=2,
        )
        with pytest.raises(OperationTemplateValidationError, match="уже активен"):
            UnarchiveOperationTemplateUseCase(db_session).execute(tid, ACCOUNT)


# ======================================================================
# 6. Confirm occurrence
# ======================================================================

class TestConfirmOccurrence:
    def test_confirm_marks_done(self, db_session, wallets, expense_category):
        tid = CreateOperationTemplateUseCase(db_session).execute(
            account_id=ACCOUNT, title="Обед", freq="MONTHLY",
            interval=1, start_date="2026-03-01", kind="EXPENSE",
            amount="500", wallet_id=1, category_id=2,
        )
        occ = OperationOccurrence(
            account_id=ACCOUNT, template_id=tid,
            scheduled_date=date(2026, 3, 1), status="ACTIVE",
        )
        db_session.add(occ)
        db_session.flush()

        tx_id = ConfirmOperationOccurrenceUseCase(db_session).execute(
            occ.id, ACCOUNT, actor_user_id=ACCOUNT,
        )
        assert tx_id > 0
        db_session.expire_all()
        updated_occ = db_session.query(OperationOccurrence).filter(
            OperationOccurrence.id == occ.id,
        ).first()
        assert updated_occ.status == "DONE"
        assert updated_occ.transaction_id == tx_id

    def test_confirm_already_done_fails(self, db_session, wallets, expense_category):
        tid = CreateOperationTemplateUseCase(db_session).execute(
            account_id=ACCOUNT, title="Обед", freq="MONTHLY",
            interval=1, start_date="2026-03-01", kind="EXPENSE",
            amount="500", wallet_id=1, category_id=2,
        )
        occ = OperationOccurrence(
            account_id=ACCOUNT, template_id=tid,
            scheduled_date=date(2026, 3, 1), status="DONE",
        )
        db_session.add(occ)
        db_session.flush()

        with pytest.raises(OperationTemplateValidationError, match="только активную"):
            ConfirmOperationOccurrenceUseCase(db_session).execute(
                occ.id, ACCOUNT, actor_user_id=ACCOUNT,
            )


# ======================================================================
# 7. Skip occurrence
# ======================================================================

class TestSkipOccurrence:
    def test_skip_marks_skipped(self, db_session, wallets, expense_category):
        tid = CreateOperationTemplateUseCase(db_session).execute(
            account_id=ACCOUNT, title="Обед", freq="MONTHLY",
            interval=1, start_date="2026-03-01", kind="EXPENSE",
            amount="500", wallet_id=1, category_id=2,
        )
        occ = OperationOccurrence(
            account_id=ACCOUNT, template_id=tid,
            scheduled_date=date(2026, 3, 1), status="ACTIVE",
        )
        db_session.add(occ)
        db_session.flush()

        SkipOperationOccurrenceUseCase(db_session).execute(
            occ.id, ACCOUNT, actor_user_id=ACCOUNT,
        )
        db_session.expire_all()
        updated_occ = db_session.query(OperationOccurrence).filter(
            OperationOccurrence.id == occ.id,
        ).first()
        assert updated_occ.status == "SKIPPED"


# ======================================================================
# 8. Credit wallet restriction
# ======================================================================

class TestCreditWalletRestriction:
    def test_credit_wallet_rejected(self, db_session, wallets, expense_category):
        with pytest.raises(OperationTemplateValidationError, match="Кредитные кошельки"):
            CreateOperationTemplateUseCase(db_session).execute(
                account_id=ACCOUNT, title="С кредитки", freq="MONTHLY",
                interval=1, start_date="2026-03-01", kind="EXPENSE",
                amount="500", wallet_id=3, category_id=2,
            )


# ======================================================================
# 9. Amount validation
# ======================================================================

class TestAmountValidation:
    def test_zero_amount_fails(self, db_session, wallets, expense_category):
        with pytest.raises(OperationTemplateValidationError, match="больше нуля"):
            CreateOperationTemplateUseCase(db_session).execute(
                account_id=ACCOUNT, title="Ноль", freq="MONTHLY",
                interval=1, start_date="2026-03-01", kind="EXPENSE",
                amount="0", wallet_id=1, category_id=2,
            )

    def test_negative_amount_fails(self, db_session, wallets, expense_category):
        with pytest.raises(OperationTemplateValidationError, match="больше нуля"):
            CreateOperationTemplateUseCase(db_session).execute(
                account_id=ACCOUNT, title="Минус", freq="MONTHLY",
                interval=1, start_date="2026-03-01", kind="EXPENSE",
                amount="-100", wallet_id=1, category_id=2,
            )
