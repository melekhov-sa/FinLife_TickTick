"""Tests for Task Categories (WorkCategory) — new UX flows."""
import pytest
from app.infrastructure.db.models import WorkCategory
from app.application.work_categories import (
    CreateWorkCategoryUseCase,
    UpdateWorkCategoryUseCase,
    ArchiveWorkCategoryUseCase,
    UnarchiveWorkCategoryUseCase,
    WorkCategoryValidationError,
)

ACCOUNT = 1


def _create(db, title, emoji=None):
    """Create a work category and return its ID."""
    return CreateWorkCategoryUseCase(db).execute(
        account_id=ACCOUNT, title=title, emoji=emoji, actor_user_id=ACCOUNT,
    )


def _get(db, category_id):
    return db.query(WorkCategory).filter(WorkCategory.category_id == category_id).first()


def _active_list(db):
    return db.query(WorkCategory).filter(
        WorkCategory.account_id == ACCOUNT, WorkCategory.is_archived == False,
    ).order_by(WorkCategory.title).all()


def _archived_list(db):
    return db.query(WorkCategory).filter(
        WorkCategory.account_id == ACCOUNT, WorkCategory.is_archived == True,
    ).order_by(WorkCategory.title).all()


# ======================================================================
# 1. Создание
# ======================================================================

class TestCreate:
    def test_create_appears_in_active_list(self, db_session):
        """Новая категория появляется в активных."""
        cat_id = _create(db_session, "Работа", emoji="💼")
        active = _active_list(db_session)
        assert any(c.category_id == cat_id for c in active)
        cat = _get(db_session, cat_id)
        assert cat.title == "Работа"
        assert cat.emoji == "💼"
        assert cat.is_archived is False

    def test_create_not_in_archived(self, db_session):
        """Новая категория НЕ в архиве."""
        _create(db_session, "Учёба")
        archived = _archived_list(db_session)
        assert len(archived) == 0

    def test_create_empty_title_fails(self, db_session):
        """Пустое название — ошибка."""
        with pytest.raises(WorkCategoryValidationError):
            _create(db_session, "  ")

    def test_create_duplicate_title_fails(self, db_session):
        """Дубликат названия — ошибка."""
        _create(db_session, "Дом")
        with pytest.raises(WorkCategoryValidationError):
            _create(db_session, "Дом")


# ======================================================================
# 2. Поиск (q)
# ======================================================================

class TestSearch:
    def test_search_filters_correctly(self, db_session):
        """Поиск по подстроке названия фильтрует результат."""
        _create(db_session, "Работа")
        _create(db_session, "Учёба")
        _create(db_session, "Работа дома")

        # Simulating q= filter like route does
        q = "Работа"
        results = db_session.query(WorkCategory).filter(
            WorkCategory.account_id == ACCOUNT,
            WorkCategory.is_archived == False,
            WorkCategory.title.ilike(f"%{q}%"),
        ).all()
        assert len(results) == 2
        titles = {c.title for c in results}
        assert "Работа" in titles
        assert "Работа дома" in titles
        assert "Учёба" not in titles

    def test_search_empty_q_returns_all(self, db_session):
        _create(db_session, "A")
        _create(db_session, "B")
        results = db_session.query(WorkCategory).filter(
            WorkCategory.account_id == ACCOUNT,
            WorkCategory.is_archived == False,
        ).all()
        assert len(results) == 2


# ======================================================================
# 3. Архивирование
# ======================================================================

class TestArchive:
    def test_archive_removes_from_active(self, db_session):
        """Архивирование убирает из активных."""
        cat_id = _create(db_session, "Спорт")
        ArchiveWorkCategoryUseCase(db_session).execute(cat_id, ACCOUNT, actor_user_id=ACCOUNT)
        assert len(_active_list(db_session)) == 0

    def test_archive_appears_in_archived(self, db_session):
        """Архивированная категория в списке архивных."""
        cat_id = _create(db_session, "Спорт")
        ArchiveWorkCategoryUseCase(db_session).execute(cat_id, ACCOUNT, actor_user_id=ACCOUNT)
        archived = _archived_list(db_session)
        assert len(archived) == 1
        assert archived[0].category_id == cat_id

    def test_archive_already_archived_fails(self, db_session):
        """Двойная архивация — ошибка."""
        cat_id = _create(db_session, "Дом")
        ArchiveWorkCategoryUseCase(db_session).execute(cat_id, ACCOUNT, actor_user_id=ACCOUNT)
        with pytest.raises(WorkCategoryValidationError):
            ArchiveWorkCategoryUseCase(db_session).execute(cat_id, ACCOUNT, actor_user_id=ACCOUNT)


# ======================================================================
# 4. Разархивирование
# ======================================================================

class TestUnarchive:
    def test_unarchive_returns_to_active(self, db_session):
        """Разархивирование возвращает в активные."""
        cat_id = _create(db_session, "Музыка")
        ArchiveWorkCategoryUseCase(db_session).execute(cat_id, ACCOUNT, actor_user_id=ACCOUNT)
        assert len(_active_list(db_session)) == 0

        UnarchiveWorkCategoryUseCase(db_session).execute(cat_id, ACCOUNT, actor_user_id=ACCOUNT)
        active = _active_list(db_session)
        assert len(active) == 1
        assert active[0].title == "Музыка"

    def test_unarchive_removes_from_archived(self, db_session):
        """После разархивирования — не в архиве."""
        cat_id = _create(db_session, "Чтение")
        ArchiveWorkCategoryUseCase(db_session).execute(cat_id, ACCOUNT, actor_user_id=ACCOUNT)
        UnarchiveWorkCategoryUseCase(db_session).execute(cat_id, ACCOUNT, actor_user_id=ACCOUNT)
        assert len(_archived_list(db_session)) == 0

    def test_unarchive_not_archived_fails(self, db_session):
        """Разархивирование активной — ошибка."""
        cat_id = _create(db_session, "Кулинария")
        with pytest.raises(WorkCategoryValidationError):
            UnarchiveWorkCategoryUseCase(db_session).execute(cat_id, ACCOUNT, actor_user_id=ACCOUNT)


# ======================================================================
# 5. Удаление отсутствует
# ======================================================================

class TestNoDelete:
    def test_no_delete_method(self, db_session):
        """Эндпоинта удаления нет — категории только архивируются."""
        # Проверяем что в use cases нет Delete класса
        import app.application.work_categories as wc_module
        class_names = [name for name in dir(wc_module) if "Delete" in name]
        assert class_names == [], f"Delete use cases found: {class_names}"


# ======================================================================
# 6. Обновление (edit page flow)
# ======================================================================

class TestUpdate:
    def test_update_title_and_emoji(self, db_session):
        """Изменение названия и эмодзи через UpdateWorkCategoryUseCase."""
        cat_id = _create(db_session, "Старое", emoji="🏠")
        UpdateWorkCategoryUseCase(db_session).execute(
            category_id=cat_id, account_id=ACCOUNT,
            title="Новое", emoji="🚀", actor_user_id=ACCOUNT,
        )
        cat = _get(db_session, cat_id)
        assert cat.title == "Новое"
        assert cat.emoji == "🚀"

    def test_update_archived_category_allowed(self, db_session):
        """Можно редактировать архивную категорию (для edit page)."""
        cat_id = _create(db_session, "Архивная")
        ArchiveWorkCategoryUseCase(db_session).execute(cat_id, ACCOUNT, actor_user_id=ACCOUNT)
        # Should NOT raise
        UpdateWorkCategoryUseCase(db_session).execute(
            category_id=cat_id, account_id=ACCOUNT,
            title="Обновлённая архивная", actor_user_id=ACCOUNT,
        )
        cat = _get(db_session, cat_id)
        assert cat.title == "Обновлённая архивная"
        assert cat.is_archived is True

    def test_edit_flow_archive_and_update(self, db_session):
        """Полный флоу: обновить + архивировать (как на edit page)."""
        cat_id = _create(db_session, "Работа", emoji="💼")
        # Simulate edit page: update title, then archive
        UpdateWorkCategoryUseCase(db_session).execute(
            category_id=cat_id, account_id=ACCOUNT,
            title="Работа (старая)", actor_user_id=ACCOUNT,
        )
        ArchiveWorkCategoryUseCase(db_session).execute(cat_id, ACCOUNT, actor_user_id=ACCOUNT)

        cat = _get(db_session, cat_id)
        assert cat.title == "Работа (старая)"
        assert cat.is_archived is True

    def test_edit_flow_unarchive_and_update(self, db_session):
        """Полный флоу: разархивировать + обновить (как на edit page)."""
        cat_id = _create(db_session, "Спорт", emoji="⚽")
        ArchiveWorkCategoryUseCase(db_session).execute(cat_id, ACCOUNT, actor_user_id=ACCOUNT)

        # Simulate edit page: unarchive first, then update
        UnarchiveWorkCategoryUseCase(db_session).execute(cat_id, ACCOUNT, actor_user_id=ACCOUNT)
        UpdateWorkCategoryUseCase(db_session).execute(
            category_id=cat_id, account_id=ACCOUNT,
            title="Фитнес", emoji="🏋️", actor_user_id=ACCOUNT,
        )

        cat = _get(db_session, cat_id)
        assert cat.title == "Фитнес"
        assert cat.emoji == "🏋️"
        assert cat.is_archived is False
