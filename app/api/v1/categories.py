"""
Category API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.infrastructure.db.models import User, CategoryInfo
from app.application.categories import CreateCategoryUseCase, ArchiveCategoryUseCase
from app.domain.category import CATEGORY_TYPE_INCOME, CATEGORY_TYPE_EXPENSE


router = APIRouter(prefix="/api/v1/categories", tags=["categories"])


# === Request/Response models ===

class CreateCategoryRequest(BaseModel):
    title: str
    category_type: str  # INCOME, EXPENSE
    parent_id: int | None = None

    @field_validator("category_type")
    @classmethod
    def validate_category_type(cls, v: str) -> str:
        """Валидация типа категории"""
        if v not in [CATEGORY_TYPE_INCOME, CATEGORY_TYPE_EXPENSE]:
            raise ValueError(f"category_type должен быть INCOME или EXPENSE, получено: {v}")
        return v


class CategoryResponse(BaseModel):
    category_id: int
    title: str
    category_type: str
    parent_id: int | None
    is_archived: bool
    is_system: bool
    sort_order: int


# === Helper function ===

def _get_current_user(request: Request, db: Session) -> User:
    """Get current user from session"""
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user


# === Endpoints ===

@router.post("/", response_model=CategoryResponse)
def create_category(
    request: Request,
    req: CreateCategoryRequest,
    db: Session = Depends(get_db)
):
    """Создать новую категорию"""
    user = _get_current_user(request, db)

    use_case = CreateCategoryUseCase(db)
    category_id = use_case.execute(
        account_id=user.id,
        title=req.title,
        category_type=req.category_type,
        parent_id=req.parent_id,
        is_system=False,  # Пользовательские категории
        actor_user_id=user.id
    )

    # Получить category из read model
    category = db.query(CategoryInfo).filter(
        CategoryInfo.category_id == category_id
    ).first()

    if not category:
        raise HTTPException(status_code=500, detail="Category creation failed")

    return CategoryResponse(
        category_id=category.category_id,
        title=category.title,
        category_type=category.category_type,
        parent_id=category.parent_id,
        is_archived=category.is_archived,
        is_system=category.is_system,
        sort_order=category.sort_order
    )


@router.get("/", response_model=list[CategoryResponse])
def list_categories(
    request: Request,
    db: Session = Depends(get_db),
    category_type: str | None = None,  # Фильтр по типу (INCOME/EXPENSE)
    include_archived: bool = False
):
    """Список всех категорий"""
    user = _get_current_user(request, db)

    query = db.query(CategoryInfo).filter(
        CategoryInfo.account_id == user.id
    )

    # Фильтр по типу категории
    if category_type:
        if category_type not in [CATEGORY_TYPE_INCOME, CATEGORY_TYPE_EXPENSE]:
            raise HTTPException(
                status_code=400,
                detail=f"Неверный category_type: {category_type}. Используйте INCOME или EXPENSE"
            )
        query = query.filter(CategoryInfo.category_type == category_type)

    if not include_archived:
        query = query.filter(CategoryInfo.is_archived == False)

    # Сортировка: сначала системные, потом по sort_order, потом по названию
    query = query.order_by(
        CategoryInfo.is_system.desc(),
        CategoryInfo.sort_order.asc(),
        CategoryInfo.title.asc()
    )

    categories = query.all()

    return [
        CategoryResponse(
            category_id=c.category_id,
            title=c.title,
            category_type=c.category_type,
            parent_id=c.parent_id,
            is_archived=c.is_archived,
            is_system=c.is_system,
            sort_order=c.sort_order
        )
        for c in categories
    ]


@router.post("/{category_id}/archive")
def archive_category(
    request: Request,
    category_id: int,
    db: Session = Depends(get_db)
):
    """Архивировать категорию"""
    user = _get_current_user(request, db)

    # Проверить что категория существует и принадлежит пользователю
    category = db.query(CategoryInfo).filter(
        CategoryInfo.category_id == category_id,
        CategoryInfo.account_id == user.id
    ).first()

    if not category:
        raise HTTPException(status_code=404, detail="Категория не найдена")

    # Проверить что это не системная категория
    if category.is_system:
        raise HTTPException(
            status_code=400,
            detail="Нельзя архивировать системную категорию"
        )

    use_case = ArchiveCategoryUseCase(db)
    use_case.execute(
        category_id=category_id,
        account_id=user.id,
        actor_user_id=user.id
    )

    return {"status": "archived"}
