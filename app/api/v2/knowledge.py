"""GET /api/v2/knowledge — knowledge base article list."""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.v2.deps import get_user_id
from app.application.knowledge import KnowledgeReadService
from app.infrastructure.db.session import get_db

router = APIRouter()

TYPE_LABELS = {
    "note":        "Заметка",
    "instruction": "Инструкция",
    "checklist":   "Чеклист",
    "template":    "Шаблон",
    "reference":   "Справка",
}

TYPE_EMOJI = {
    "note":        "📝",
    "instruction": "📋",
    "checklist":   "✅",
    "template":    "📄",
    "reference":   "📚",
}

STATUS_LABELS = {
    "draft":     "Черновик",
    "published": "Опубликована",
    "archived":  "Архив",
}


class ArticleTag(BaseModel):
    id: int
    name: str


class ArticleListItem(BaseModel):
    id: int
    title: str
    type: str
    type_label: str
    type_emoji: str
    status: str
    status_label: str
    pinned: bool
    updated_at: str
    tags: list[ArticleTag]


@router.get("/knowledge", response_model=list[ArticleListItem])
def get_knowledge(
    search: str | None = Query(default=None),
    type_filter: str | None = Query(default=None, alias="type"),
    status_filter: str | None = Query(default=None, alias="status"),
    user_id: int = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    svc = KnowledgeReadService(db)
    articles = svc.list_articles(
        account_id=user_id,
        type_filter=type_filter,
        status_filter=status_filter,
        search=search,
    )

    result = []
    for a in articles:
        tags = [ArticleTag(id=t["id"], name=t["name"]) for t in a.get("tags", [])]
        result.append(ArticleListItem(
            id=a["id"],
            title=a["title"],
            type=a["type"],
            type_label=TYPE_LABELS.get(a["type"], a["type"]),
            type_emoji=TYPE_EMOJI.get(a["type"], "📄"),
            status=a["status"],
            status_label=STATUS_LABELS.get(a["status"], a["status"]),
            pinned=a["pinned"],
            updated_at=a["updated_at"].isoformat() if hasattr(a["updated_at"], "isoformat") else str(a["updated_at"]),
            tags=tags,
        ))
    return result


class ArticleDetail(BaseModel):
    id: int
    title: str
    content_md: str
    type: str
    type_label: str
    type_emoji: str
    status: str
    status_label: str
    pinned: bool
    created_at: str
    updated_at: str
    tags: list[ArticleTag]
    tags_csv: str
    linked_projects: list[dict]


@router.get("/knowledge/{article_id}", response_model=ArticleDetail)
def get_article(
    article_id: int,
    user_id: int = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    svc = KnowledgeReadService(db)
    a = svc.get_article_detail(article_id, user_id)
    if not a:
        raise HTTPException(status_code=404, detail="Статья не найдена")

    return ArticleDetail(
        id=a["id"],
        title=a["title"],
        content_md=a["content_md"] or "",
        type=a["type"],
        type_label=TYPE_LABELS.get(a["type"], a["type"]),
        type_emoji=TYPE_EMOJI.get(a["type"], "📄"),
        status=a["status"],
        status_label=STATUS_LABELS.get(a["status"], a["status"]),
        pinned=a["pinned"],
        created_at=a["created_at"].isoformat() if hasattr(a["created_at"], "isoformat") else str(a["created_at"]),
        updated_at=a["updated_at"].isoformat() if hasattr(a["updated_at"], "isoformat") else str(a["updated_at"]),
        tags=[ArticleTag(id=t["id"], name=t["name"]) for t in a.get("tags", [])],
        tags_csv=a.get("tags_csv", ""),
        linked_projects=a.get("linked_projects", []),
    )
