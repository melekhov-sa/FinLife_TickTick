"""
Wish use cases - business logic for wishes operations
"""
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.infrastructure.eventlog.repository import EventLogRepository
from app.infrastructure.db.models import WishModel, EventLog
from app.domain.wish import Wish, WISH_STATUSES, WISH_TYPES
from app.readmodels.projectors.wishes import WishesProjector


class WishValidationError(ValueError):
    """Ошибка валидации хотелки"""
    pass


class CreateWishUseCase:
    """Use case: Создать новую хотелку"""

    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(
        self,
        account_id: int,
        title: str,
        wish_type: str,
        status: str = "IDEA",
        target_date: str | None = None,
        target_month: str | None = None,
        estimated_amount: Decimal | None = None,
        is_recurring: bool = False,
        notes: str | None = None,
        actor_user_id: int | None = None
    ) -> int:
        """Создать хотелку"""
        wish_id = self._generate_wish_id()

        event_payload = Wish.create(
            account_id=account_id,
            wish_id=wish_id,
            title=title,
            wish_type=wish_type,
            status=status,
            target_date=target_date,
            target_month=target_month,
            estimated_amount=str(estimated_amount) if estimated_amount else None,
            is_recurring=is_recurring,
            notes=notes
        )

        self.event_repo.append_event(
            account_id=account_id,
            event_type="wish_created",
            payload=event_payload,
            actor_user_id=actor_user_id,
            idempotency_key=f"wish-create-{account_id}-{wish_id}"
        )

        self.db.commit()
        self._run_projectors(account_id)

        return wish_id

    def _generate_wish_id(self) -> int:
        """Генерировать ID из event_log"""
        max_id_from_events = (
            self.db.query(
                func.max(
                    func.cast(EventLog.payload_json['wish_id'], WishModel.wish_id.type)
                )
            )
            .filter(EventLog.event_type == 'wish_created')
            .scalar() or 0
        )
        return max_id_from_events + 1

    def _run_projectors(self, account_id: int):
        projector = WishesProjector(self.db)
        projector.run(account_id, event_types=["wish_created"])


class UpdateWishUseCase:
    """Use case: Обновить хотелку"""

    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(
        self,
        wish_id: int,
        account_id: int,
        actor_user_id: int | None = None,
        **changes
    ) -> None:
        """Обновить хотелку"""
        wish = self.db.query(WishModel).filter(
            WishModel.wish_id == wish_id,
            WishModel.account_id == account_id
        ).first()

        if not wish:
            raise WishValidationError(f"Хотелка #{wish_id} не найдена")

        event_payload = Wish.update(wish_id, **changes)

        self.event_repo.append_event(
            account_id=account_id,
            event_type="wish_updated",
            payload=event_payload,
            actor_user_id=actor_user_id
        )

        self.db.commit()

        projector = WishesProjector(self.db)
        projector.run(account_id, event_types=["wish_updated"])


class CompleteWishesUseCase:
    """Use case: Отметить хотелки выполненными (массово для режима Закупка)"""

    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(
        self,
        wish_ids: list[int],
        account_id: int,
        actor_user_id: int | None = None
    ) -> None:
        """Отметить хотелки выполненными"""
        for wish_id in wish_ids:
            wish = self.db.query(WishModel).filter(
                WishModel.wish_id == wish_id,
                WishModel.account_id == account_id
            ).first()

            if not wish:
                continue

            event_payload = Wish.complete(
                wish_id=wish_id,
                is_recurring=wish.is_recurring,
                current_status=wish.status
            )

            self.event_repo.append_event(
                account_id=account_id,
                event_type="wish_completed",
                payload=event_payload,
                actor_user_id=actor_user_id
            )

        self.db.commit()

        projector = WishesProjector(self.db)
        projector.run(account_id, event_types=["wish_completed"])
