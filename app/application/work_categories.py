"""Work Category use cases"""
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.infrastructure.eventlog.repository import EventLogRepository
from app.infrastructure.db.models import WorkCategory, EventLog
from app.domain.work_category import WorkCategory as WorkCategoryDomain
from app.readmodels.projectors.work_categories import WorkCategoriesProjector


class WorkCategoryValidationError(ValueError):
    pass


class CreateWorkCategoryUseCase:
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(self, account_id: int, title: str, emoji: str | None = None, actor_user_id: int | None = None) -> int:
        title = title.strip()
        if not title:
            raise WorkCategoryValidationError("Название категории не может быть пустым")

        # Check unique
        existing = self.db.query(WorkCategory).filter(
            WorkCategory.account_id == account_id,
            WorkCategory.title == title,
        ).first()
        if existing:
            raise WorkCategoryValidationError(f"Категория '{title}' уже существует")

        category_id = self._generate_id()
        payload = WorkCategoryDomain.create(account_id, category_id, title, emoji)

        self.event_repo.append_event(
            account_id=account_id,
            event_type="work_category_created",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()

        WorkCategoriesProjector(self.db).run(account_id, event_types=["work_category_created"])
        return category_id

    def _generate_id(self) -> int:
        max_id = self.db.query(
            func.max(func.cast(EventLog.payload_json['category_id'], WorkCategory.category_id.type))
        ).filter(EventLog.event_type == 'work_category_created').scalar() or 0
        return max_id + 1


class UpdateWorkCategoryUseCase:
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(self, category_id: int, account_id: int, title: str | None = None,
                emoji: str | None = ..., actor_user_id: int | None = None) -> None:
        cat = self.db.query(WorkCategory).filter(
            WorkCategory.category_id == category_id,
            WorkCategory.account_id == account_id,
        ).first()
        if not cat:
            raise WorkCategoryValidationError(f"Категория #{category_id} не найдена")

        changes = {}
        if title is not None:
            title = title.strip()
            if not title:
                raise WorkCategoryValidationError("Название не может быть пустым")
            changes["title"] = title
        if emoji is not ...:
            changes["emoji"] = emoji

        if not changes:
            return

        payload = WorkCategoryDomain.update(category_id, **changes)
        self.event_repo.append_event(
            account_id=account_id,
            event_type="work_category_updated",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        WorkCategoriesProjector(self.db).run(account_id, event_types=["work_category_updated"])


class UnarchiveWorkCategoryUseCase:
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(self, category_id: int, account_id: int, actor_user_id: int | None = None) -> None:
        cat = self.db.query(WorkCategory).filter(
            WorkCategory.category_id == category_id,
            WorkCategory.account_id == account_id,
        ).first()
        if not cat:
            raise WorkCategoryValidationError(f"Категория #{category_id} не найдена")
        if not cat.is_archived:
            raise WorkCategoryValidationError("Категория не в архиве")

        payload = WorkCategoryDomain.unarchive(category_id)
        self.event_repo.append_event(
            account_id=account_id,
            event_type="work_category_unarchived",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        WorkCategoriesProjector(self.db).run(account_id, event_types=["work_category_unarchived"])


class ArchiveWorkCategoryUseCase:
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(self, category_id: int, account_id: int, actor_user_id: int | None = None) -> None:
        cat = self.db.query(WorkCategory).filter(
            WorkCategory.category_id == category_id,
            WorkCategory.account_id == account_id,
        ).first()
        if not cat:
            raise WorkCategoryValidationError(f"Категория #{category_id} не найдена")
        if cat.is_archived:
            raise WorkCategoryValidationError("Категория уже в архиве")

        payload = WorkCategoryDomain.archive(category_id)
        self.event_repo.append_event(
            account_id=account_id,
            event_type="work_category_archived",
            payload=payload,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        WorkCategoriesProjector(self.db).run(account_id, event_types=["work_category_archived"])
