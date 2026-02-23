"""
Knowledge Base use-cases and read service.
"""
from typing import List, Dict, Any

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.infrastructure.db.models import (
    ArticleModel, TagModel, ArticleTagModel, ArticleLinkModel, ProjectModel,
)


# ── Constants ──

ARTICLE_TYPES = ("note", "instruction", "checklist", "template", "reference")
ARTICLE_STATUSES = ("draft", "published", "archived")


# ── Errors ──

class KnowledgeValidationError(ValueError):
    pass


# ── Tag helper ──

def _sync_tags(db: Session, account_id: int, article_id: int, tags_csv: str) -> None:
    """Parse comma-separated tag names, create-or-get, replace article_tags."""
    db.query(ArticleTagModel).filter(
        ArticleTagModel.article_id == article_id,
    ).delete()

    if not tags_csv or not tags_csv.strip():
        return

    tag_names = sorted(set(
        name.strip().lower() for name in tags_csv.split(",") if name.strip()
    ))
    for name in tag_names:
        tag = db.query(TagModel).filter(
            TagModel.account_id == account_id,
            TagModel.name == name,
        ).first()
        if not tag:
            tag = TagModel(account_id=account_id, name=name)
            db.add(tag)
            db.flush()
        db.add(ArticleTagModel(article_id=article_id, tag_id=tag.id))


# ── Use Cases ──

class CreateArticleUseCase:
    def __init__(self, db: Session):
        self.db = db

    def execute(
        self,
        account_id: int,
        title: str,
        content_md: str = "",
        type: str = "note",
        status: str = "draft",
        pinned: bool = False,
        tags_csv: str = "",
    ) -> int:
        title = title.strip()
        if not title:
            raise KnowledgeValidationError("Название статьи не может быть пустым")
        if type not in ARTICLE_TYPES:
            raise KnowledgeValidationError(f"Недопустимый тип: {type}")
        if status not in ARTICLE_STATUSES:
            raise KnowledgeValidationError(f"Недопустимый статус: {status}")

        article = ArticleModel(
            account_id=account_id,
            title=title,
            content_md=content_md or "",
            type=type,
            status=status,
            pinned=pinned,
        )
        self.db.add(article)
        self.db.flush()
        _sync_tags(self.db, account_id, article.id, tags_csv)
        self.db.commit()
        return article.id


class UpdateArticleUseCase:
    def __init__(self, db: Session):
        self.db = db

    def execute(self, article_id: int, account_id: int, **changes) -> None:
        article = self._get(article_id, account_id)

        if "title" in changes:
            title = changes["title"].strip()
            if not title:
                raise KnowledgeValidationError("Название статьи не может быть пустым")
            article.title = title
        if "content_md" in changes:
            article.content_md = changes["content_md"] or ""
        if "type" in changes:
            if changes["type"] not in ARTICLE_TYPES:
                raise KnowledgeValidationError(f"Недопустимый тип: {changes['type']}")
            article.type = changes["type"]
        if "status" in changes:
            if changes["status"] not in ARTICLE_STATUSES:
                raise KnowledgeValidationError(f"Недопустимый статус: {changes['status']}")
            article.status = changes["status"]
        if "pinned" in changes:
            article.pinned = bool(changes["pinned"])
        if "tags_csv" in changes:
            _sync_tags(self.db, account_id, article.id, changes["tags_csv"])

        self.db.commit()

    def _get(self, aid: int, account_id: int) -> ArticleModel:
        a = self.db.query(ArticleModel).filter(
            ArticleModel.id == aid,
            ArticleModel.account_id == account_id,
        ).first()
        if not a:
            raise KnowledgeValidationError("Статья не найдена")
        return a


class DeleteArticleUseCase:
    """Hard delete article (cascade handles tags/links)."""

    def __init__(self, db: Session):
        self.db = db

    def execute(self, article_id: int, account_id: int) -> None:
        article = self.db.query(ArticleModel).filter(
            ArticleModel.id == article_id,
            ArticleModel.account_id == account_id,
        ).first()
        if not article:
            raise KnowledgeValidationError("Статья не найдена")
        # Manually delete associations for SQLite compat (no FK cascade)
        self.db.query(ArticleTagModel).filter(
            ArticleTagModel.article_id == article_id,
        ).delete()
        self.db.query(ArticleLinkModel).filter(
            ArticleLinkModel.article_id == article_id,
        ).delete()
        self.db.delete(article)
        self.db.commit()


class PublishArticleUseCase:
    def __init__(self, db: Session):
        self.db = db

    def execute(self, article_id: int, account_id: int) -> None:
        article = self.db.query(ArticleModel).filter(
            ArticleModel.id == article_id,
            ArticleModel.account_id == account_id,
        ).first()
        if not article:
            raise KnowledgeValidationError("Статья не найдена")
        article.status = "published"
        self.db.commit()


class ArchiveArticleUseCase:
    def __init__(self, db: Session):
        self.db = db

    def execute(self, article_id: int, account_id: int) -> None:
        article = self.db.query(ArticleModel).filter(
            ArticleModel.id == article_id,
            ArticleModel.account_id == account_id,
        ).first()
        if not article:
            raise KnowledgeValidationError("Статья не найдена")
        article.status = "archived"
        self.db.commit()


class AttachArticleToProjectUseCase:
    def __init__(self, db: Session):
        self.db = db

    def execute(self, article_id: int, account_id: int, project_id: int) -> None:
        article = self.db.query(ArticleModel).filter(
            ArticleModel.id == article_id,
            ArticleModel.account_id == account_id,
        ).first()
        if not article:
            raise KnowledgeValidationError("Статья не найдена")

        project = self.db.query(ProjectModel).filter(
            ProjectModel.id == project_id,
            ProjectModel.account_id == account_id,
        ).first()
        if not project:
            raise KnowledgeValidationError("Проект не найден")

        existing = self.db.query(ArticleLinkModel).filter(
            ArticleLinkModel.article_id == article_id,
            ArticleLinkModel.entity_type == "project",
            ArticleLinkModel.entity_id == project_id,
        ).first()
        if existing:
            return

        link = ArticleLinkModel(
            article_id=article_id,
            entity_type="project",
            entity_id=project_id,
        )
        self.db.add(link)
        self.db.commit()


class DetachArticleFromProjectUseCase:
    def __init__(self, db: Session):
        self.db = db

    def execute(self, article_id: int, account_id: int, project_id: int) -> None:
        article = self.db.query(ArticleModel).filter(
            ArticleModel.id == article_id,
            ArticleModel.account_id == account_id,
        ).first()
        if not article:
            raise KnowledgeValidationError("Статья не найдена")

        self.db.query(ArticleLinkModel).filter(
            ArticleLinkModel.article_id == article_id,
            ArticleLinkModel.entity_type == "project",
            ArticleLinkModel.entity_id == project_id,
        ).delete()
        self.db.commit()


# ── Read Service ──

class KnowledgeReadService:
    """Read-only queries for knowledge base."""

    def __init__(self, db: Session):
        self.db = db

    def list_articles(
        self,
        account_id: int,
        type_filter: str | None = None,
        status_filter: str | None = None,
        tag_filter: str | None = None,
        search: str | None = None,
    ) -> List[Dict[str, Any]]:
        q = self.db.query(ArticleModel).filter(
            ArticleModel.account_id == account_id,
        )

        if status_filter and status_filter in ARTICLE_STATUSES:
            q = q.filter(ArticleModel.status == status_filter)
        else:
            q = q.filter(ArticleModel.status != "archived")

        if type_filter and type_filter in ARTICLE_TYPES:
            q = q.filter(ArticleModel.type == type_filter)

        if tag_filter:
            q = (
                q.join(ArticleTagModel)
                .join(TagModel, ArticleTagModel.tag_id == TagModel.id)
                .filter(
                    TagModel.name == tag_filter.strip().lower(),
                    TagModel.account_id == account_id,
                )
            )

        if search and search.strip():
            pattern = f"%{search.strip()}%"
            q = q.filter(or_(
                ArticleModel.title.ilike(pattern),
                ArticleModel.content_md.ilike(pattern),
            ))

        articles = q.order_by(
            ArticleModel.pinned.desc(),
            ArticleModel.updated_at.desc(),
        ).all()

        article_ids = [a.id for a in articles]
        tags_map = self._tags_for_articles(article_ids) if article_ids else {}

        return [
            {
                "id": a.id,
                "title": a.title,
                "type": a.type,
                "status": a.status,
                "pinned": a.pinned,
                "created_at": a.created_at,
                "updated_at": a.updated_at,
                "tags": tags_map.get(a.id, []),
            }
            for a in articles
        ]

    def get_article_detail(
        self,
        article_id: int,
        account_id: int,
    ) -> Dict[str, Any] | None:
        article = self.db.query(ArticleModel).filter(
            ArticleModel.id == article_id,
            ArticleModel.account_id == account_id,
        ).first()
        if not article:
            return None

        tags = (
            self.db.query(TagModel)
            .join(ArticleTagModel, ArticleTagModel.tag_id == TagModel.id)
            .filter(ArticleTagModel.article_id == article_id)
            .order_by(TagModel.name)
            .all()
        )

        links = (
            self.db.query(ArticleLinkModel)
            .filter(ArticleLinkModel.article_id == article_id)
            .all()
        )

        project_ids = [lnk.entity_id for lnk in links if lnk.entity_type == "project"]
        linked_projects = []
        if project_ids:
            projects = self.db.query(ProjectModel).filter(
                ProjectModel.id.in_(project_ids),
                ProjectModel.account_id == account_id,
            ).all()
            linked_projects = [
                {"id": p.id, "title": p.title, "status": p.status}
                for p in projects
            ]

        return {
            "id": article.id,
            "title": article.title,
            "content_md": article.content_md,
            "type": article.type,
            "status": article.status,
            "pinned": article.pinned,
            "created_at": article.created_at,
            "updated_at": article.updated_at,
            "tags": [{"id": t.id, "name": t.name} for t in tags],
            "tags_csv": ", ".join(t.name for t in tags),
            "linked_projects": linked_projects,
        }

    def get_articles_for_entity(
        self,
        account_id: int,
        entity_type: str,
        entity_id: int,
    ) -> List[Dict[str, Any]]:
        """Get articles linked to a specific entity (e.g., project)."""
        articles = (
            self.db.query(ArticleModel)
            .join(ArticleLinkModel)
            .filter(
                ArticleLinkModel.entity_type == entity_type,
                ArticleLinkModel.entity_id == entity_id,
                ArticleModel.account_id == account_id,
            )
            .order_by(ArticleModel.updated_at.desc())
            .all()
        )
        return [
            {"id": a.id, "title": a.title, "type": a.type, "status": a.status}
            for a in articles
        ]

    def get_all_tags(self, account_id: int) -> List[str]:
        """All tag names for filter/autocomplete."""
        tags = (
            self.db.query(TagModel.name)
            .filter(TagModel.account_id == account_id)
            .order_by(TagModel.name)
            .all()
        )
        return [t.name for t in tags]

    def _tags_for_articles(self, article_ids: List[int]) -> Dict[int, List[str]]:
        rows = (
            self.db.query(ArticleTagModel.article_id, TagModel.name)
            .join(TagModel, ArticleTagModel.tag_id == TagModel.id)
            .filter(ArticleTagModel.article_id.in_(article_ids))
            .order_by(TagModel.name)
            .all()
        )
        result: Dict[int, List[str]] = {}
        for article_id, tag_name in rows:
            result.setdefault(article_id, []).append(tag_name)
        return result
