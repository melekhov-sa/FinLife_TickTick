"""Recurrence Rule use cases"""
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.infrastructure.eventlog.repository import EventLogRepository
from app.infrastructure.db.models import RecurrenceRuleModel, EventLog
from app.domain.recurrence_rule import RecurrenceRule
from app.domain.recurrence import VALID_FREQ
from app.readmodels.projectors.recurrence_rules import RecurrenceRulesProjector


class RecurrenceRuleValidationError(ValueError):
    pass


class CreateRecurrenceRuleUseCase:
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(
        self,
        account_id: int,
        freq: str,
        interval: int,
        start_date: str,
        until_date: str | None = None,
        count: int | None = None,
        by_weekday: str | None = None,
        by_monthday: int | None = None,
        monthday_clip_to_last_day: bool = True,
        by_month: int | None = None,
        by_monthday_for_year: int | None = None,
        dates_json: str | None = None,
        actor_user_id: int | None = None,
    ) -> int:
        if freq not in VALID_FREQ:
            raise RecurrenceRuleValidationError(f"Неверная частота: {freq}")
        if interval < 1:
            raise RecurrenceRuleValidationError("Интервал должен быть >= 1")

        rule_id = self._generate_id()
        payload = RecurrenceRule.create(
            account_id=account_id,
            rule_id=rule_id,
            freq=freq,
            interval=interval,
            start_date=start_date,
            until_date=until_date,
            count=count,
            by_weekday=by_weekday,
            by_monthday=by_monthday,
            monthday_clip_to_last_day=monthday_clip_to_last_day,
            by_month=by_month,
            by_monthday_for_year=by_monthday_for_year,
            dates_json=dates_json,
        )

        self.event_repo.append_event(
            account_id=account_id,
            event_type="recurrence_rule_created",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()

        RecurrenceRulesProjector(self.db).run(account_id, event_types=["recurrence_rule_created"])
        return rule_id

    def _generate_id(self) -> int:
        max_id = self.db.query(
            func.max(func.cast(EventLog.payload_json['rule_id'], RecurrenceRuleModel.rule_id.type))
        ).filter(EventLog.event_type == 'recurrence_rule_created').scalar() or 0
        return max_id + 1


class UpdateRecurrenceRuleUseCase:
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(self, rule_id: int, account_id: int, actor_user_id: int | None = None, **changes) -> None:
        rule = self.db.query(RecurrenceRuleModel).filter(
            RecurrenceRuleModel.rule_id == rule_id,
            RecurrenceRuleModel.account_id == account_id,
        ).first()
        if not rule:
            raise RecurrenceRuleValidationError(f"Правило #{rule_id} не найдено")

        payload = RecurrenceRule.update(rule_id, **changes)
        self.event_repo.append_event(
            account_id=account_id,
            event_type="recurrence_rule_updated",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        RecurrenceRulesProjector(self.db).run(account_id, event_types=["recurrence_rule_updated"])
