"""
Tests for savings goals core: use-cases, invariants, projections
"""
import pytest
from decimal import Decimal

from app.application.goals import CreateGoalUseCase, UpdateGoalUseCase, EnsureSystemGoalUseCase, GoalValidationError
from app.application.wallets import CreateWalletUseCase
from app.application.transactions import CreateTransactionUseCase, TransactionValidationError
from app.infrastructure.db.models import GoalInfo, GoalWalletBalance, WalletBalance
from app.domain.goal import SYSTEM_GOAL_TITLE


# ============================================================================
# Goal CRUD
# ============================================================================


class TestCreateGoal:
    def test_create_goal_basic(self, db_session, sample_account_id):
        """Создание цели с базовыми параметрами"""
        uc = CreateGoalUseCase(db_session)
        goal_id = uc.execute(
            account_id=sample_account_id,
            title="Отпуск",
            currency="RUB",
            target_amount="100000"
        )

        goal = db_session.query(GoalInfo).filter(GoalInfo.goal_id == goal_id).first()
        assert goal is not None
        assert goal.title == "Отпуск"
        assert goal.currency == "RUB"
        assert goal.target_amount == Decimal("100000")
        assert goal.is_system is False
        assert goal.is_archived is False

    def test_create_goal_without_target(self, db_session, sample_account_id):
        """Создание цели без целевой суммы"""
        uc = CreateGoalUseCase(db_session)
        goal_id = uc.execute(
            account_id=sample_account_id,
            title="Подушка безопасности",
            currency="RUB"
        )

        goal = db_session.query(GoalInfo).filter(GoalInfo.goal_id == goal_id).first()
        assert goal is not None
        assert goal.target_amount is None

    def test_create_goal_empty_title_rejected(self, db_session, sample_account_id):
        """Пустое название отклоняется"""
        uc = CreateGoalUseCase(db_session)
        with pytest.raises(GoalValidationError, match="не может быть пустым"):
            uc.execute(account_id=sample_account_id, title="  ", currency="RUB")

    def test_create_goal_invalid_currency_rejected(self, db_session, sample_account_id):
        """Некорректный код валюты отклоняется"""
        uc = CreateGoalUseCase(db_session)
        with pytest.raises(GoalValidationError, match="Неверный код валюты"):
            uc.execute(account_id=sample_account_id, title="Test", currency="rub")

    def test_create_goal_negative_target_rejected(self, db_session, sample_account_id):
        """Отрицательная целевая сумма отклоняется"""
        uc = CreateGoalUseCase(db_session)
        with pytest.raises(GoalValidationError, match="не может быть отрицательной"):
            uc.execute(account_id=sample_account_id, title="Test", currency="RUB", target_amount="-100")


class TestUpdateGoal:
    def test_update_goal_title(self, db_session, sample_account_id):
        """Обновление названия цели"""
        create_uc = CreateGoalUseCase(db_session)
        goal_id = create_uc.execute(
            account_id=sample_account_id,
            title="Старое",
            currency="RUB"
        )

        update_uc = UpdateGoalUseCase(db_session)
        update_uc.execute(
            goal_id=goal_id,
            account_id=sample_account_id,
            title="Новое"
        )

        goal = db_session.query(GoalInfo).filter(GoalInfo.goal_id == goal_id).first()
        assert goal.title == "Новое"

    def test_update_system_goal_rejected(self, db_session, sample_account_id):
        """Нельзя редактировать системную цель"""
        create_uc = CreateGoalUseCase(db_session)
        goal_id = create_uc.execute(
            account_id=sample_account_id,
            title=SYSTEM_GOAL_TITLE,
            currency="RUB",
            is_system=True
        )

        update_uc = UpdateGoalUseCase(db_session)
        with pytest.raises(GoalValidationError, match="системную цель"):
            update_uc.execute(
                goal_id=goal_id,
                account_id=sample_account_id,
                title="Хитрое название"
            )


class TestEnsureSystemGoal:
    def test_creates_system_goal(self, db_session, sample_account_id):
        """Системная цель создаётся при первом вызове"""
        uc = EnsureSystemGoalUseCase(db_session)
        goal_id = uc.execute(account_id=sample_account_id, currency="RUB")

        goal = db_session.query(GoalInfo).filter(GoalInfo.goal_id == goal_id).first()
        assert goal is not None
        assert goal.title == SYSTEM_GOAL_TITLE
        assert goal.currency == "RUB"
        assert goal.is_system is True

    def test_idempotent(self, db_session, sample_account_id):
        """Повторный вызов не создаёт дубликат"""
        uc = EnsureSystemGoalUseCase(db_session)
        id1 = uc.execute(account_id=sample_account_id, currency="RUB")
        id2 = uc.execute(account_id=sample_account_id, currency="RUB")
        assert id1 == id2

    def test_separate_per_currency(self, db_session, sample_account_id):
        """Разные валюты — разные системные цели"""
        uc = EnsureSystemGoalUseCase(db_session)
        id_rub = uc.execute(account_id=sample_account_id, currency="RUB")
        id_usd = uc.execute(account_id=sample_account_id, currency="USD")
        assert id_rub != id_usd


# ============================================================================
# Transfer with goals
# ============================================================================


def _create_wallet(db_session, account_id, title, currency="RUB", wallet_type="REGULAR", initial_balance="0"):
    """Helper: создать кошелёк"""
    uc = CreateWalletUseCase(db_session)
    return uc.execute(
        account_id=account_id,
        title=title,
        currency=currency,
        wallet_type=wallet_type,
        initial_balance=initial_balance
    )


def _create_goal(db_session, account_id, title, currency="RUB", target_amount=None):
    """Helper: создать цель"""
    uc = CreateGoalUseCase(db_session)
    return uc.execute(
        account_id=account_id,
        title=title,
        currency=currency,
        target_amount=target_amount
    )


class TestTransferWithGoals:
    def test_regular_to_savings_requires_to_goal_id(self, db_session, sample_account_id):
        """REGULAR → SAVINGS без to_goal_id — отклоняется"""
        regular_id = _create_wallet(db_session, sample_account_id, "Основной", initial_balance="10000")
        savings_id = _create_wallet(db_session, sample_account_id, "Накопления", wallet_type="SAVINGS")

        tx_uc = CreateTransactionUseCase(db_session)
        with pytest.raises(TransactionValidationError, match="to_goal_id"):
            tx_uc.execute_transfer(
                account_id=sample_account_id,
                from_wallet_id=regular_id,
                to_wallet_id=savings_id,
                amount=Decimal("1000"),
                currency="RUB",
                description="На отпуск"
            )

    def test_savings_to_regular_requires_from_goal_id(self, db_session, sample_account_id):
        """SAVINGS → REGULAR без from_goal_id — отклоняется"""
        regular_id = _create_wallet(db_session, sample_account_id, "Основной")
        savings_id = _create_wallet(db_session, sample_account_id, "Накопления", wallet_type="SAVINGS")

        tx_uc = CreateTransactionUseCase(db_session)
        with pytest.raises(TransactionValidationError, match="from_goal_id"):
            tx_uc.execute_transfer(
                account_id=sample_account_id,
                from_wallet_id=savings_id,
                to_wallet_id=regular_id,
                amount=Decimal("1000"),
                currency="RUB",
                description="Вывод"
            )

    def test_savings_to_savings_requires_both_goal_ids(self, db_session, sample_account_id):
        """SAVINGS → SAVINGS без обоих goal_id — отклоняется"""
        s1 = _create_wallet(db_session, sample_account_id, "Накопления 1", wallet_type="SAVINGS")
        s2 = _create_wallet(db_session, sample_account_id, "Накопления 2", wallet_type="SAVINGS")

        goal_id = _create_goal(db_session, sample_account_id, "Цель A")

        tx_uc = CreateTransactionUseCase(db_session)
        # Missing to_goal_id
        with pytest.raises(TransactionValidationError, match="to_goal_id"):
            tx_uc.execute_transfer(
                account_id=sample_account_id,
                from_wallet_id=s1,
                to_wallet_id=s2,
                amount=Decimal("100"),
                currency="RUB",
                description="Перевод",
                from_goal_id=goal_id
            )

    def test_regular_to_savings_with_goal_ok(self, db_session, sample_account_id):
        """REGULAR → SAVINGS с to_goal_id — успешно, goal balance обновляется"""
        regular_id = _create_wallet(db_session, sample_account_id, "Основной", initial_balance="10000")
        savings_id = _create_wallet(db_session, sample_account_id, "Накопления", wallet_type="SAVINGS")
        goal_id = _create_goal(db_session, sample_account_id, "Отпуск")

        tx_uc = CreateTransactionUseCase(db_session)
        tx_uc.execute_transfer(
            account_id=sample_account_id,
            from_wallet_id=regular_id,
            to_wallet_id=savings_id,
            amount=Decimal("5000"),
            currency="RUB",
            description="На отпуск",
            to_goal_id=goal_id
        )

        # Проверить goal_wallet_balance
        gwb = db_session.query(GoalWalletBalance).filter(
            GoalWalletBalance.goal_id == goal_id,
            GoalWalletBalance.wallet_id == savings_id
        ).first()
        assert gwb is not None
        assert gwb.amount == Decimal("5000")

        # Проверить wallet balances
        regular = db_session.query(WalletBalance).filter(WalletBalance.wallet_id == regular_id).first()
        savings = db_session.query(WalletBalance).filter(WalletBalance.wallet_id == savings_id).first()
        assert regular.balance == Decimal("5000")
        assert savings.balance == Decimal("5000")

    def test_savings_to_regular_with_goal_ok(self, db_session, sample_account_id):
        """SAVINGS → REGULAR с from_goal_id — успешно"""
        regular_id = _create_wallet(db_session, sample_account_id, "Основной", initial_balance="10000")
        savings_id = _create_wallet(db_session, sample_account_id, "Накопления", wallet_type="SAVINGS")
        goal_id = _create_goal(db_session, sample_account_id, "Отпуск")

        tx_uc = CreateTransactionUseCase(db_session)
        # Сначала пополняем
        tx_uc.execute_transfer(
            account_id=sample_account_id,
            from_wallet_id=regular_id,
            to_wallet_id=savings_id,
            amount=Decimal("5000"),
            currency="RUB",
            description="Пополнение",
            to_goal_id=goal_id
        )

        # Затем выводим
        tx_uc.execute_transfer(
            account_id=sample_account_id,
            from_wallet_id=savings_id,
            to_wallet_id=regular_id,
            amount=Decimal("2000"),
            currency="RUB",
            description="Вывод",
            from_goal_id=goal_id
        )

        gwb = db_session.query(GoalWalletBalance).filter(
            GoalWalletBalance.goal_id == goal_id,
            GoalWalletBalance.wallet_id == savings_id
        ).first()
        assert gwb.amount == Decimal("3000")

    def test_insufficient_goal_balance_rejected(self, db_session, sample_account_id):
        """Недостаточно средств в цели — отклоняется"""
        regular_id = _create_wallet(db_session, sample_account_id, "Основной", initial_balance="10000")
        savings_id = _create_wallet(db_session, sample_account_id, "Накопления", wallet_type="SAVINGS")
        goal_id = _create_goal(db_session, sample_account_id, "Отпуск")

        tx_uc = CreateTransactionUseCase(db_session)
        # Пополняем на 1000
        tx_uc.execute_transfer(
            account_id=sample_account_id,
            from_wallet_id=regular_id,
            to_wallet_id=savings_id,
            amount=Decimal("1000"),
            currency="RUB",
            description="Пополнение",
            to_goal_id=goal_id
        )

        # Пытаемся вывести 2000
        with pytest.raises(TransactionValidationError, match="Недостаточно средств"):
            tx_uc.execute_transfer(
                account_id=sample_account_id,
                from_wallet_id=savings_id,
                to_wallet_id=regular_id,
                amount=Decimal("2000"),
                currency="RUB",
                description="Вывод",
                from_goal_id=goal_id
            )

    def test_goal_currency_mismatch_rejected(self, db_session, sample_account_id):
        """Валюта цели не совпадает с валютой кошелька — отклоняется"""
        regular_id = _create_wallet(db_session, sample_account_id, "Рубли", currency="RUB", initial_balance="10000")
        savings_id = _create_wallet(db_session, sample_account_id, "Рубли Накопления", currency="RUB", wallet_type="SAVINGS")
        usd_goal = _create_goal(db_session, sample_account_id, "USD Goal", currency="USD")

        tx_uc = CreateTransactionUseCase(db_session)
        with pytest.raises(TransactionValidationError, match="Валюта цели"):
            tx_uc.execute_transfer(
                account_id=sample_account_id,
                from_wallet_id=regular_id,
                to_wallet_id=savings_id,
                amount=Decimal("1000"),
                currency="RUB",
                description="Пополнение",
                to_goal_id=usd_goal
            )

    def test_regular_to_regular_no_goal_required(self, db_session, sample_account_id):
        """REGULAR → REGULAR — goal_id не требуется"""
        r1 = _create_wallet(db_session, sample_account_id, "Карта", initial_balance="5000")
        r2 = _create_wallet(db_session, sample_account_id, "Наличные")

        tx_uc = CreateTransactionUseCase(db_session)
        tx_id = tx_uc.execute_transfer(
            account_id=sample_account_id,
            from_wallet_id=r1,
            to_wallet_id=r2,
            amount=Decimal("1000"),
            currency="RUB",
            description="Снятие"
        )
        assert tx_id > 0

    def test_from_goal_id_on_regular_wallet_rejected(self, db_session, sample_account_id):
        """from_goal_id на обычном кошельке — отклоняется"""
        r1 = _create_wallet(db_session, sample_account_id, "Карта", initial_balance="5000")
        r2 = _create_wallet(db_session, sample_account_id, "Наличные")
        goal_id = _create_goal(db_session, sample_account_id, "Фейк")

        tx_uc = CreateTransactionUseCase(db_session)
        with pytest.raises(TransactionValidationError, match="только для накопительного"):
            tx_uc.execute_transfer(
                account_id=sample_account_id,
                from_wallet_id=r1,
                to_wallet_id=r2,
                amount=Decimal("1000"),
                currency="RUB",
                description="Перевод",
                from_goal_id=goal_id
            )


class TestSavingsWalletInitialBalance:
    def test_savings_initial_balance_goes_to_system_goal(self, db_session, sample_account_id):
        """При создании SAVINGS с initial_balance > 0 — баланс уходит в 'Без цели'"""
        savings_id = _create_wallet(
            db_session, sample_account_id, "Накопления",
            wallet_type="SAVINGS", initial_balance="50000"
        )

        # Проверить что системная цель создалась
        system_goal = db_session.query(GoalInfo).filter(
            GoalInfo.account_id == sample_account_id,
            GoalInfo.is_system == True,
            GoalInfo.currency == "RUB"
        ).first()
        assert system_goal is not None
        assert system_goal.title == SYSTEM_GOAL_TITLE

        # Проверить что баланс goal_wallet_balances == initial_balance
        gwb = db_session.query(GoalWalletBalance).filter(
            GoalWalletBalance.goal_id == system_goal.goal_id,
            GoalWalletBalance.wallet_id == savings_id
        ).first()
        assert gwb is not None
        assert gwb.amount == Decimal("50000")

    def test_savings_zero_balance_no_gwb(self, db_session, sample_account_id):
        """При создании SAVINGS с initial_balance = 0 — gwb не создаётся"""
        savings_id = _create_wallet(
            db_session, sample_account_id, "Пустой",
            wallet_type="SAVINGS", initial_balance="0"
        )

        gwb_count = db_session.query(GoalWalletBalance).filter(
            GoalWalletBalance.wallet_id == savings_id
        ).count()
        assert gwb_count == 0
