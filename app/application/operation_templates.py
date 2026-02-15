"""Operation Template use cases - planned financial operations"""
from datetime import date, timedelta
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


MONEY_FIELDS = {"kind", "amount", "wallet_id", "category_id"}


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
        if kind not in ("INCOME", "EXPENSE"):
            raise OperationTemplateValidationError(f"Неверный тип операции: {kind}")

        amt = Decimal(amount)
        if amt <= 0:
            raise OperationTemplateValidationError("Сумма должна быть больше нуля")

        if not wallet_id:
            raise OperationTemplateValidationError("Кошелёк обязателен для дохода/расхода")
        if not category_id:
            raise OperationTemplateValidationError("Категория обязательна для дохода/расхода")

        # --- CREDIT wallet check ---
        if wallet_id:
            credit = self.db.query(WalletBalance.wallet_id).filter(
                WalletBalance.wallet_id == wallet_id,
                WalletBalance.wallet_type == "CREDIT",
            ).first()
            if credit:
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


class UpdateOperationTemplateUseCase:
    """Update template. Light fields (title, note, work_category_id) — in-place.
    Money fields (kind, amount, wallet_id, category_id) — new version if confirmed occurrences exist."""
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(
        self,
        template_id: int,
        account_id: int,
        actor_user_id: int | None = None,
        version_from_date: str | None = None,
        **changes,
    ) -> int | None:
        """Returns new_template_id if version was created, else None."""
        tmpl = self.db.query(OperationTemplateModel).filter(
            OperationTemplateModel.template_id == template_id,
            OperationTemplateModel.account_id == account_id,
        ).first()
        if not tmpl:
            raise OperationTemplateValidationError(f"Шаблон #{template_id} не найден")

        # Validate money fields if changed
        new_kind = changes.get("kind", tmpl.kind)
        if new_kind not in ("INCOME", "EXPENSE"):
            raise OperationTemplateValidationError(f"Неверный тип операции: {new_kind}")

        new_amount = changes.get("amount")
        if new_amount is not None:
            amt = Decimal(str(new_amount))
            if amt <= 0:
                raise OperationTemplateValidationError("Сумма должна быть больше нуля")

        new_wallet_id = changes.get("wallet_id", tmpl.wallet_id)
        new_category_id = changes.get("category_id", tmpl.category_id)
        if not new_wallet_id:
            raise OperationTemplateValidationError("Кошелёк обязателен для дохода/расхода")
        if not new_category_id:
            raise OperationTemplateValidationError("Категория обязательна для дохода/расхода")

        # CREDIT wallet check
        if new_wallet_id and new_wallet_id != tmpl.wallet_id:
            credit = self.db.query(WalletBalance.wallet_id).filter(
                WalletBalance.wallet_id == new_wallet_id,
                WalletBalance.wallet_type == "CREDIT",
            ).first()
            if credit:
                raise OperationTemplateValidationError(
                    "Кредитные кошельки недоступны для плановых операций"
                )

        # Separate light and money changes
        money_changes = {k: v for k, v in changes.items() if k in MONEY_FIELDS}
        light_changes = {k: v for k, v in changes.items() if k not in MONEY_FIELDS}

        # Check if money fields actually changed
        actual_money_changes = {}
        for k, v in money_changes.items():
            current_val = getattr(tmpl, k)
            if k == "amount":
                if Decimal(str(v)) != current_val:
                    actual_money_changes[k] = v
            elif v != current_val:
                actual_money_changes[k] = v

        if not actual_money_changes:
            # Only light changes — simple in-place update
            if light_changes:
                payload = OperationTemplate.update(template_id, **light_changes)
                self.event_repo.append_event(
                    account_id=account_id,
                    event_type="operation_template_updated",
                    payload=payload,
                    actor_user_id=actor_user_id,
                )
                self.db.commit()
                OperationTemplatesProjector(self.db).run(account_id, event_types=["operation_template_updated"])
            return None

        # Money fields changed — check for confirmed/skipped occurrences
        has_confirmed = self.db.query(OperationOccurrence).filter(
            OperationOccurrence.template_id == template_id,
            OperationOccurrence.account_id == account_id,
            OperationOccurrence.status.in_(["DONE", "SKIPPED"]),
        ).first() is not None

        if not has_confirmed:
            # No confirmed — safe to update in-place
            all_changes = {**light_changes, **actual_money_changes}
            payload = OperationTemplate.update(template_id, **all_changes)
            self.event_repo.append_event(
                account_id=account_id,
                event_type="operation_template_updated",
                payload=payload,
                actor_user_id=actor_user_id,
            )
            self.db.commit()
            OperationTemplatesProjector(self.db).run(account_id, event_types=["operation_template_updated"])
            return None

        # Has confirmed — create new version
        if not version_from_date:
            raise OperationTemplateValidationError(
                "Укажите дату начала новой версии (есть подтверждённые вхождения)"
            )

        vfd = date.fromisoformat(version_from_date)
        close_until = (vfd - timedelta(days=1)).isoformat()

        # 1. Apply light changes to old template (if any)
        if light_changes:
            payload_light = OperationTemplate.update(template_id, **light_changes)
            self.event_repo.append_event(
                account_id=account_id,
                event_type="operation_template_updated",
                payload=payload_light,
                actor_user_id=actor_user_id,
            )

        # 2. Close old version
        payload_close = OperationTemplate.close_version(template_id, close_until)
        self.event_repo.append_event(
            account_id=account_id,
            event_type="operation_template_closed",
            payload=payload_close,
            actor_user_id=actor_user_id,
        )

        # 3. Create new version
        new_template_id = CreateOperationTemplateUseCase(self.db)._generate_id()
        new_payload = OperationTemplate.create(
            account_id=account_id,
            template_id=new_template_id,
            title=light_changes.get("title", tmpl.title),
            rule_id=tmpl.rule_id,
            active_from=version_from_date,
            kind=actual_money_changes.get("kind", tmpl.kind),
            amount=str(actual_money_changes.get("amount", tmpl.amount)),
            wallet_id=actual_money_changes.get("wallet_id", tmpl.wallet_id),
            category_id=actual_money_changes.get("category_id", tmpl.category_id),
            note=light_changes.get("note", tmpl.note),
            work_category_id=light_changes.get("work_category_id", tmpl.work_category_id),
        )
        self.event_repo.append_event(
            account_id=account_id,
            event_type="operation_template_created",
            payload=new_payload,
            actor_user_id=actor_user_id,
        )

        self.db.commit()
        OperationTemplatesProjector(self.db).run(
            account_id,
            event_types=["operation_template_updated", "operation_template_closed", "operation_template_created"],
        )
        return new_template_id


class ArchiveOperationTemplateUseCase:
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(self, template_id: int, account_id: int, actor_user_id: int | None = None) -> None:
        tmpl = self.db.query(OperationTemplateModel).filter(
            OperationTemplateModel.template_id == template_id,
            OperationTemplateModel.account_id == account_id,
        ).first()
        if not tmpl:
            raise OperationTemplateValidationError(f"Шаблон #{template_id} не найден")
        if tmpl.is_archived:
            raise OperationTemplateValidationError("Шаблон уже в архиве")

        payload = OperationTemplate.archive(template_id)
        self.event_repo.append_event(
            account_id=account_id,
            event_type="operation_template_archived",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        OperationTemplatesProjector(self.db).run(account_id, event_types=["operation_template_archived"])


class UnarchiveOperationTemplateUseCase:
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(self, template_id: int, account_id: int, actor_user_id: int | None = None) -> None:
        tmpl = self.db.query(OperationTemplateModel).filter(
            OperationTemplateModel.template_id == template_id,
            OperationTemplateModel.account_id == account_id,
        ).first()
        if not tmpl:
            raise OperationTemplateValidationError(f"Шаблон #{template_id} не найден")
        if not tmpl.is_archived:
            raise OperationTemplateValidationError("Шаблон уже активен")

        payload = OperationTemplate.unarchive(template_id)
        self.event_repo.append_event(
            account_id=account_id,
            event_type="operation_template_unarchived",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        OperationTemplatesProjector(self.db).run(account_id, event_types=["operation_template_unarchived"])


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
    ) -> int:
        occ = self.db.query(OperationOccurrence).filter(
            OperationOccurrence.id == occurrence_id,
            OperationOccurrence.account_id == account_id,
        ).first()
        if not occ:
            raise OperationTemplateValidationError(f"Occurrence #{occurrence_id} не найден")
        if occ.status != "ACTIVE":
            raise OperationTemplateValidationError("Можно подтвердить только активную операцию")

        tmpl = self.db.query(OperationTemplateModel).filter(
            OperationTemplateModel.template_id == occ.template_id,
        ).first()
        if not tmpl:
            raise OperationTemplateValidationError("Шаблон операции не найден")

        amount = override_amount if override_amount is not None else tmpl.amount
        wallet_id = override_wallet_id if override_wallet_id is not None else tmpl.wallet_id
        category_id = override_category_id if override_category_id is not None else tmpl.category_id
        description = override_description if override_description is not None else tmpl.title

        tx_uc = CreateTransactionUseCase(self.db)
        wallet = self.db.query(WalletBalance).filter(
            WalletBalance.wallet_id == wallet_id
        ).first()
        currency = wallet.currency if wallet else "RUB"

        if tmpl.kind == "INCOME":
            transaction_id = tx_uc.execute_income(
                account_id=account_id,
                wallet_id=wallet_id,
                amount=amount,
                currency=currency,
                category_id=category_id,
                description=description,
                actor_user_id=actor_user_id,
            )
        else:  # EXPENSE
            transaction_id = tx_uc.execute_expense(
                account_id=account_id,
                wallet_id=wallet_id,
                amount=amount,
                currency=currency,
                category_id=category_id,
                description=description,
                actor_user_id=actor_user_id,
            )

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
