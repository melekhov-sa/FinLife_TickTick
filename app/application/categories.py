"""
Category use cases - business logic for category operations

Статьи (категории) для доходов и расходов
"""
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.infrastructure.eventlog.repository import EventLogRepository
from app.infrastructure.db.models import CategoryInfo, EventLog
from app.domain.category import (
    Category,
    CATEGORY_TYPE_INCOME,
    CATEGORY_TYPE_EXPENSE,
    SYSTEM_INCOME_CATEGORIES,
    SYSTEM_EXPENSE_CATEGORIES
)
from app.readmodels.projectors.categories import CategoriesProjector


class EnsureSystemCategoriesUseCase:
    """
    Use case: Создать системные категории при первом входе

    Системные категории нельзя изменить/удалить
    """

    def __init__(self, db: Session):
        self.db = db
        self.create_use_case = CreateCategoryUseCase(db)

    def execute(self, account_id: int, actor_user_id: int | None = None) -> None:
        """Создать системные категории если их нет"""
        # Доходы
        for title in SYSTEM_INCOME_CATEGORIES:
            existing = self.db.query(CategoryInfo).filter(
                CategoryInfo.account_id == account_id,
                CategoryInfo.title == title,
                CategoryInfo.category_type == CATEGORY_TYPE_INCOME,
                CategoryInfo.is_system == True
            ).first()
            if not existing:
                self.create_use_case.execute(
                    account_id=account_id,
                    title=title,
                    category_type=CATEGORY_TYPE_INCOME,
                    is_system=True,
                    actor_user_id=actor_user_id
                )

        # Расходы
        for title in SYSTEM_EXPENSE_CATEGORIES:
            existing = self.db.query(CategoryInfo).filter(
                CategoryInfo.account_id == account_id,
                CategoryInfo.title == title,
                CategoryInfo.category_type == CATEGORY_TYPE_EXPENSE,
                CategoryInfo.is_system == True
            ).first()
            if not existing:
                self.create_use_case.execute(
                    account_id=account_id,
                    title=title,
                    category_type=CATEGORY_TYPE_EXPENSE,
                    is_system=True,
                    actor_user_id=actor_user_id
                )


class CreateCategoryUseCase:
    """Use case: Создать новую категорию (статью)"""

    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(
        self,
        account_id: int,
        title: str,
        category_type: str,
        parent_id: int | None = None,
        is_system: bool = False,
        actor_user_id: int | None = None
    ) -> int:
        """
        Создать категорию

        Args:
            account_id: ID аккаунта
            title: Название категории
            category_type: INCOME или EXPENSE
            parent_id: ID родительской категории
            is_system: Системная категория (нельзя изменить/удалить)
            actor_user_id: Кто создаёт

        Returns:
            category_id: ID созданной категории
        """
        category_id = self._generate_category_id()

        event_payload = Category.create(
            account_id=account_id,
            category_id=category_id,
            title=title,
            category_type=category_type,
            parent_id=parent_id,
            is_system=is_system
        )

        self.event_repo.append_event(
            account_id=account_id,
            event_type="category_created",
            payload=event_payload,
            actor_user_id=actor_user_id,
            idempotency_key=f"category-create-{account_id}-{category_id}"
        )

        self.db.commit()
        self._run_projectors(account_id)

        return category_id

    def _generate_category_id(self) -> int:
        """Генерировать ID из event_log (source of truth)"""
        max_id_from_events = (
            self.db.query(
                func.max(
                    func.cast(EventLog.payload_json['category_id'], CategoryInfo.category_id.type)
                )
            )
            .filter(EventLog.event_type == 'category_created')
            .scalar() or 0
        )
        return max_id_from_events + 1

    def _run_projectors(self, account_id: int):
        projector = CategoriesProjector(self.db)
        projector.run(account_id, event_types=["category_created"])


class CategoryValidationError(ValueError):
    """Ошибка валидации категории"""
    pass


class UpdateCategoryUseCase:
    """Use case: Обновить категорию (переименовать, сменить parent)"""

    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(
        self,
        category_id: int,
        account_id: int,
        title: str | None = None,
        parent_id: int | None = ...,  # sentinel: ... means "not provided"
        actor_user_id: int | None = None
    ) -> None:
        category = self.db.query(CategoryInfo).filter(
            CategoryInfo.category_id == category_id,
            CategoryInfo.account_id == account_id
        ).first()

        if not category:
            raise CategoryValidationError(f"Категория #{category_id} не найдена")

        if category.is_system:
            raise CategoryValidationError("Нельзя редактировать системную категорию")

        if category.is_archived:
            raise CategoryValidationError("Нельзя редактировать архивированную категорию")

        changes = {}

        if title is not None:
            title = title.strip()
            if not title:
                raise CategoryValidationError("Название категории не может быть пустым")
            changes["title"] = title

        if parent_id is not ...:
            # Validate parent_id if set
            if parent_id is not None:
                parent = self.db.query(CategoryInfo).filter(
                    CategoryInfo.category_id == parent_id,
                    CategoryInfo.account_id == account_id,
                    CategoryInfo.category_type == category.category_type
                ).first()
                if not parent:
                    raise CategoryValidationError(f"Родительская категория #{parent_id} не найдена")
                if parent.category_id == category_id:
                    raise CategoryValidationError("Категория не может быть своим родителем")
            changes["parent_id"] = parent_id

        if not changes:
            return  # Нечего менять

        event_payload = Category.update(category_id, **changes)

        self.event_repo.append_event(
            account_id=account_id,
            event_type="category_updated",
            payload=event_payload,
            actor_user_id=actor_user_id
        )

        self.db.commit()

        projector = CategoriesProjector(self.db)
        projector.run(account_id, event_types=["category_updated"])


class ArchiveCategoryUseCase:
    """Use case: Архивировать категорию"""

    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(
        self,
        category_id: int,
        account_id: int,
        actor_user_id: int | None = None
    ) -> None:
        """Архивировать категорию"""
        category = self.db.query(CategoryInfo).filter(
            CategoryInfo.category_id == category_id,
            CategoryInfo.account_id == account_id
        ).first()

        if not category:
            raise CategoryValidationError(f"Категория #{category_id} не найдена")

        if category.is_system:
            raise CategoryValidationError("Нельзя архивировать системную категорию")

        if category.is_archived:
            raise CategoryValidationError("Категория уже архивирована")

        event_payload = Category.archive(category_id)

        self.event_repo.append_event(
            account_id=account_id,
            event_type="category_archived",
            payload=event_payload,
            actor_user_id=actor_user_id,
            idempotency_key=f"category-archive-{account_id}-{category_id}"
        )

        self.db.commit()
        self._run_projectors(account_id)

    def _run_projectors(self, account_id: int):
        projector = CategoriesProjector(self.db)
        projector.run(account_id, event_types=["category_archived"])


class UnarchiveCategoryUseCase:
    """Use case: Восстановить категорию из архива"""

    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventLogRepository(db)

    def execute(
        self,
        category_id: int,
        account_id: int,
        actor_user_id: int | None = None
    ) -> None:
        """Восстановить категорию из архива"""
        category = self.db.query(CategoryInfo).filter(
            CategoryInfo.category_id == category_id,
            CategoryInfo.account_id == account_id
        ).first()

        if not category:
            raise CategoryValidationError(f"Категория #{category_id} не найдена")

        if category.is_system:
            raise CategoryValidationError("Системная категория не может быть в архиве")

        if not category.is_archived:
            raise CategoryValidationError("Категория не архивирована")

        event_payload = Category.unarchive(category_id)

        self.event_repo.append_event(
            account_id=account_id,
            event_type="category_unarchived",
            payload=event_payload,
            actor_user_id=actor_user_id,
            idempotency_key=f"category-unarchive-{account_id}-{category_id}"
        )

        self.db.commit()
        self._run_projectors(account_id)

    def _run_projectors(self, account_id: int):
        projector = CategoriesProjector(self.db)
        projector.run(account_id, event_types=["category_unarchived"])


class ListCategoriesService:
    """Service: Получить список категорий с фильтрацией"""

    def __init__(self, db: Session):
        self.db = db

    def execute(
        self,
        account_id: int,
        kind: str | None = None,  # "expense" or "income"
        status: str = "active",  # "active", "archived", "all"
        search_query: str | None = None
    ) -> dict:
        """
        Получить список категорий с фильтрацией

        Returns:
            {
                "categories": [...],
                "counts": {"expense_active": N, "income_active": M}
            }
        """
        # Base query
        query = self.db.query(CategoryInfo).filter(
            CategoryInfo.account_id == account_id
        )

        # Filter by kind
        if kind == "expense":
            category_type = CATEGORY_TYPE_EXPENSE
        elif kind == "income":
            category_type = CATEGORY_TYPE_INCOME
        else:
            category_type = None

        if category_type:
            query = query.filter(CategoryInfo.category_type == category_type)

        # Filter by status
        if status == "active":
            query = query.filter(CategoryInfo.is_archived == False)
        elif status == "archived":
            query = query.filter(CategoryInfo.is_archived == True)
        # else: "all" - no filter

        # Search by title
        if search_query:
            search_pattern = f"%{search_query.strip()}%"
            query = query.filter(CategoryInfo.title.ilike(search_pattern))

        # Sort: system first, then by parent hierarchy
        query = query.order_by(
            CategoryInfo.is_system.desc(),
            CategoryInfo.title.asc()
        )

        all_categories = query.all()

        # Build hierarchical list: parents first, then children
        categories = self._build_hierarchical_list(all_categories)

        # Calculate counts for tabs
        expense_active_count = self.db.query(func.count(CategoryInfo.category_id)).filter(
            CategoryInfo.account_id == account_id,
            CategoryInfo.category_type == CATEGORY_TYPE_EXPENSE,
            CategoryInfo.is_archived == False
        ).scalar() or 0

        income_active_count = self.db.query(func.count(CategoryInfo.category_id)).filter(
            CategoryInfo.account_id == account_id,
            CategoryInfo.category_type == CATEGORY_TYPE_INCOME,
            CategoryInfo.is_archived == False
        ).scalar() or 0

        return {
            "categories": categories,
            "counts": {
                "expense_active": expense_active_count,
                "income_active": income_active_count
            }
        }

    def _build_hierarchical_list(self, all_categories: list) -> list:
        """Build hierarchical list of categories: parents, then children."""
        # Separate parents and children
        parents = []
        children_by_parent = {}

        for cat in all_categories:
            if cat.parent_id is None:
                parents.append(cat)
            else:
                if cat.parent_id not in children_by_parent:
                    children_by_parent[cat.parent_id] = []
                children_by_parent[cat.parent_id].append(cat)

        # Build result: parent, then its children
        result = []
        for parent in parents:
            result.append(parent)
            if parent.category_id in children_by_parent:
                # Add children sorted by title
                children = sorted(children_by_parent[parent.category_id], key=lambda c: c.title)
                result.extend(children)

        # Add orphaned children (whose parent is not in the list)
        all_parent_ids = {p.category_id for p in parents}
        for parent_id, children in children_by_parent.items():
            if parent_id not in all_parent_ids:
                result.extend(sorted(children, key=lambda c: c.title))

        return result
