"""Operation Template use cases - planned financial operations"""
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.infrastructure.eventlog.repository import EventLogRepository
from app.infrastructure.db.models import OperationTemplateModel, OperationOccurrence, WalletBalance, EventLog, CategoryInfo
from app.domain.operation_template import OperationTemplate
from app.domain.operation_occurrence import OperationOccurrenceEvent
from app.readmodels.projectors.operation_templates import OperationTemplatesProjector
from app.application.recurrence_rules import CreateRecurrenceRuleUseCase
from app.application.transactions import CreateTransactionUseCase


class OperationTemplateValidationError(ValueError):
    pass


class CreateOperationTemplateUseCase:
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(
        self,
        account_id: int,
        title: str,
        freq: str,
        interval: int,
        start_date: str,
        kind: str,
        amount: str,
        wallet_id: int | None = None,
        category_id: int | None = None,
        from_wallet_id: int | None = None,
        to_wallet_id: int | None = None,
        note: str | None = None,
        active_until: str | None = None,
        work_category_id: int | None = None,
        by_weekday: str | None = None,
        by_monthday: int | None = None,
        actor_user_id: int | None = None,
    ) -> int:
        title = title.strip()
        if not title:
            raise OperationTemplateValidationError("Название не может быть пустым")
        if kind not in ("INCOME", "EXPENSE", "TRANSFER"):
            raise OperationTemplateValidationError(f"Неверный тип операции: {kind}")

        amt = Decimal(amount)
        if amt <= 0:
            raise OperationTemplateValidationError("Сумма должна быть больше нуля")

        # --- Strict validation by kind ---
        if kind in ("INCOME", "EXPENSE"):
            if not wallet_id:
                raise OperationTemplateValidationError("Кошелёк обязателен для дохода/расхода")
            if not category_id:
                raise OperationTemplateValidationError("Категория обязательна для дохода/расхода")
            # Ignore transfer fields
            from_wallet_id = None
            to_wallet_id = None
        else:  # TRANSFER
            if not from_wallet_id:
                raise OperationTemplateValidationError("Кошелёк-источник обязателен для перевода")
            if not to_wallet_id:
                raise OperationTemplateValidationError("Кошелёк-получатель обязателен для перевода")
            if from_wallet_id == to_wallet_id:
                raise OperationTemplateValidationError("Нельзя переводить в тот же кошелёк")
            # Ignore income/expense fields
            wallet_id = None
            category_id = None

        # --- CREDIT wallet check ---
        wallet_ids_to_check = [w for w in (wallet_id, from_wallet_id, to_wallet_id) if w]
        if wallet_ids_to_check:
            credit_wallets = self.db.query(WalletBalance.wallet_id).filter(
                WalletBalance.wallet_id.in_(wallet_ids_to_check),
                WalletBalance.wallet_type == "CREDIT",
            ).all()
            if credit_wallets:
                raise OperationTemplateValidationError(
                    "Кредитные кошельки недоступны для плановых операций"
                )

        rule_uc = CreateRecurrenceRuleUseCase(self.db)
        rule_id = rule_uc.execute(
            account_id=account_id,
            freq=freq,
            interval=interval,
            start_date=start_date,
            until_date=active_until,
            by_weekday=by_weekday,
            by_monthday=by_monthday,
            actor_user_id=actor_user_id,
        )

        template_id = self._generate_id()
        payload = OperationTemplate.create(
            account_id=account_id,
            template_id=template_id,
            title=title,
            rule_id=rule_id,
            active_from=start_date,
            kind=kind,
            amount=amount,
            wallet_id=wallet_id,
            category_id=category_id,
            from_wallet_id=from_wallet_id,
            to_wallet_id=to_wallet_id,
            note=note,
            active_until=active_until,
            work_category_id=work_category_id,
        )

        self.event_repo.append_event(
            account_id=account_id,
            event_type="operation_template_created",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        OperationTemplatesProjector(self.db).run(account_id, event_types=["operation_template_created"])
        return template_id

    def _generate_id(self) -> int:
        max_id = self.db.query(
            func.max(func.cast(EventLog.payload_json['template_id'], OperationTemplateModel.template_id.type))
        ).filter(EventLog.event_type == 'operation_template_created').scalar() or 0
        return max_id + 1


class ConfirmOperationOccurrenceUseCase:
    """Confirm a planned operation - creates a real transaction."""
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(
        self, occurrence_id: int, account_id: int,
        actor_user_id: int | None = None,
        override_amount: Decimal | None = None,
        override_wallet_id: int | None = None,
        override_category_id: int | None = None,
        override_description: str | None = None,
        override_from_wallet_id: int | None = None,
        override_to_wallet_id: int | None = None,
    ) -> int:
        occ = self.db.query(OperationOccurrence).filter(
            OperationOccurrence.id == occurrence_id,
            OperationOccurrence.account_id == account_id,
        ).first()
        if not occ:
            raise OperationTemplateValidationError(f"Occurrence #{occurrence_id} не найден")
        if occ.status != "ACTIVE":
            raise OperationTemplateValidationError("Можно подтвердить только активную операцию")

        # Get template details
        tmpl = self.db.query(OperationTemplateModel).filter(
            OperationTemplateModel.template_id == occ.template_id,
        ).first()
        if not tmpl:
            raise OperationTemplateValidationError("Шаблон операции не найден")

        # Apply overrides (user form values take priority over template defaults)
        amount = override_amount if override_amount is not None else tmpl.amount
        wallet_id = override_wallet_id if override_wallet_id is not None else tmpl.wallet_id
        category_id = override_category_id if override_category_id is not None else tmpl.category_id
        description = override_description if override_description is not None else tmpl.title
        from_wallet_id = override_from_wallet_id if override_from_wallet_id is not None else tmpl.from_wallet_id
        to_wallet_id = override_to_wallet_id if override_to_wallet_id is not None else tmpl.to_wallet_id

        # Create real transaction
        tx_uc = CreateTransactionUseCase(self.db)
        if tmpl.kind == "INCOME":
            wallet = self.db.query(WalletBalance).filter(
                WalletBalance.wallet_id == wallet_id
            ).first()
            transaction_id = tx_uc.execute_income(
                account_id=account_id,
                wallet_id=wallet_id,
                amount=amount,
                currency=wallet.currency if wallet else "RUB",
                category_id=category_id,
                description=description,
                actor_user_id=actor_user_id,
            )
        elif tmpl.kind == "EXPENSE":
            wallet = self.db.query(WalletBalance).filter(
                WalletBalance.wallet_id == wallet_id
            ).first()
            transaction_id = tx_uc.execute_expense(
                account_id=account_id,
                wallet_id=wallet_id,
                amount=amount,
                currency=wallet.currency if wallet else "RUB",
                category_id=category_id,
                description=description,
                actor_user_id=actor_user_id,
            )
        else:  # TRANSFER
            from_wallet = self.db.query(WalletBalance).filter(
                WalletBalance.wallet_id == from_wallet_id
            ).first()
            transaction_id = tx_uc.execute_transfer(
                account_id=account_id,
                from_wallet_id=from_wallet_id,
                to_wallet_id=to_wallet_id,
                amount=amount,
                currency=from_wallet.currency if from_wallet else "RUB",
                description=description,
                actor_user_id=actor_user_id,
            )

        # Record confirmation event
        payload = OperationOccurrenceEvent.confirm(
            tmpl.template_id, occurrence_id, occ.scheduled_date.isoformat(), transaction_id
        )
        self.event_repo.append_event(
            account_id=account_id,
            event_type="operation_occurrence_confirmed",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        OperationTemplatesProjector(self.db).run(account_id, event_types=["operation_occurrence_confirmed"])
        return transaction_id


class SkipOperationOccurrenceUseCase:
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(self, occurrence_id: int, account_id: int, actor_user_id: int | None = None) -> None:
        occ = self.db.query(OperationOccurrence).filter(
            OperationOccurrence.id == occurrence_id,
            OperationOccurrence.account_id == account_id,
        ).first()
        if not occ:
            raise OperationTemplateValidationError(f"Occurrence #{occurrence_id} не найден")

        tmpl = self.db.query(OperationTemplateModel).filter(
            OperationTemplateModel.template_id == occ.template_id,
        ).first()

        payload = OperationOccurrenceEvent.skip(
            occ.template_id, occurrence_id, occ.scheduled_date.isoformat()
        )
        self.event_repo.append_event(
            account_id=account_id,
            event_type="operation_occurrence_skipped",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        OperationTemplatesProjector(self.db).run(account_id, event_types=["operation_occurrence_skipped"])
