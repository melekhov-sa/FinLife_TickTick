"""
Tests for Knowledge Base use-cases and read service.
"""
import pytest

from app.infrastructure.db.models import ArticleModel, TagModel, ArticleTagModel, ArticleLinkModel, ProjectModel
from app.application.knowledge import (
    CreateArticleUseCase, UpdateArticleUseCase, DeleteArticleUseCase,
    AttachArticleToProjectUseCase, DetachArticleFromProjectUseCase,
    KnowledgeReadService, KnowledgeValidationError,
)


def _create_article(db, account_id, title="Test Article", **kwargs):
    return CreateArticleUseCase(db).execute(account_id=account_id, title=title, **kwargs)


def _create_project(db, account_id, title="Test Project"):
    p = ProjectModel(account_id=account_id, title=title, status="active")
    db.add(p)
    db.flush()
    return p.id


# ── CreateArticle ──

class TestCreateArticle:
    def test_create_basic(self, db_session, sample_account_id):
        aid = _create_article(db_session, sample_account_id)
        assert aid > 0
        a = db_session.query(ArticleModel).get(aid)
        assert a.title == "Test Article"
        assert a.type == "note"
        assert a.status == "draft"
        assert a.pinned is False
        assert a.content_md == ""

    def test_create_with_all_fields(self, db_session, sample_account_id):
        aid = _create_article(
            db_session, sample_account_id,
            title="Full Article",
            content_md="# Hello\nWorld",
            type="instruction",
            status="published",
            pinned=True,
        )
        a = db_session.query(ArticleModel).get(aid)
        assert a.title == "Full Article"
        assert a.content_md == "# Hello\nWorld"
        assert a.type == "instruction"
        assert a.status == "published"
        assert a.pinned is True

    def test_create_with_tags(self, db_session, sample_account_id):
        aid = _create_article(
            db_session, sample_account_id,
            tags_csv="python, finance, Python",
        )
        tags = (
            db_session.query(TagModel)
            .join(ArticleTagModel, ArticleTagModel.tag_id == TagModel.id)
            .filter(ArticleTagModel.article_id == aid)
            .order_by(TagModel.name)
            .all()
        )
        tag_names = [t.name for t in tags]
        assert tag_names == ["finance", "python"]  # deduplicated + lowercase + sorted

    def test_empty_title_rejected(self, db_session, sample_account_id):
        with pytest.raises(KnowledgeValidationError, match="пустым"):
            _create_article(db_session, sample_account_id, title="   ")

    def test_invalid_type_rejected(self, db_session, sample_account_id):
        with pytest.raises(KnowledgeValidationError, match="тип"):
            _create_article(db_session, sample_account_id, type="invalid")

    def test_invalid_status_rejected(self, db_session, sample_account_id):
        with pytest.raises(KnowledgeValidationError, match="статус"):
            _create_article(db_session, sample_account_id, status="invalid")


# ── UpdateArticle ──

class TestUpdateArticle:
    def test_update_title_and_tags(self, db_session, sample_account_id):
        aid = _create_article(db_session, sample_account_id, tags_csv="old")

        UpdateArticleUseCase(db_session).execute(
            aid, sample_account_id,
            title="Updated Title",
            tags_csv="new, fresh",
        )

        a = db_session.query(ArticleModel).get(aid)
        assert a.title == "Updated Title"

        tags = (
            db_session.query(TagModel)
            .join(ArticleTagModel, ArticleTagModel.tag_id == TagModel.id)
            .filter(ArticleTagModel.article_id == aid)
            .order_by(TagModel.name)
            .all()
        )
        assert [t.name for t in tags] == ["fresh", "new"]

    def test_update_content(self, db_session, sample_account_id):
        aid = _create_article(db_session, sample_account_id)
        UpdateArticleUseCase(db_session).execute(
            aid, sample_account_id,
            content_md="# New Content",
        )
        a = db_session.query(ArticleModel).get(aid)
        assert a.content_md == "# New Content"

    def test_update_not_found(self, db_session, sample_account_id):
        with pytest.raises(KnowledgeValidationError, match="не найдена"):
            UpdateArticleUseCase(db_session).execute(
                9999, sample_account_id, title="X",
            )


# ── DeleteArticle ──

class TestDeleteArticle:
    def test_hard_delete(self, db_session, sample_account_id):
        aid = _create_article(db_session, sample_account_id, tags_csv="tag1")
        pid = _create_project(db_session, sample_account_id)
        AttachArticleToProjectUseCase(db_session).execute(aid, sample_account_id, pid)

        DeleteArticleUseCase(db_session).execute(aid, sample_account_id)

        assert db_session.query(ArticleModel).get(aid) is None
        assert db_session.query(ArticleTagModel).filter(
            ArticleTagModel.article_id == aid,
        ).count() == 0
        assert db_session.query(ArticleLinkModel).filter(
            ArticleLinkModel.article_id == aid,
        ).count() == 0

    def test_delete_not_found(self, db_session, sample_account_id):
        with pytest.raises(KnowledgeValidationError, match="не найдена"):
            DeleteArticleUseCase(db_session).execute(9999, sample_account_id)


# ── Attach / Detach ──

class TestAttachDetach:
    def test_attach_to_project(self, db_session, sample_account_id):
        aid = _create_article(db_session, sample_account_id)
        pid = _create_project(db_session, sample_account_id)

        AttachArticleToProjectUseCase(db_session).execute(aid, sample_account_id, pid)

        link = db_session.query(ArticleLinkModel).filter(
            ArticleLinkModel.article_id == aid,
            ArticleLinkModel.entity_type == "project",
            ArticleLinkModel.entity_id == pid,
        ).first()
        assert link is not None

    def test_attach_duplicate_ignored(self, db_session, sample_account_id):
        aid = _create_article(db_session, sample_account_id)
        pid = _create_project(db_session, sample_account_id)

        AttachArticleToProjectUseCase(db_session).execute(aid, sample_account_id, pid)
        AttachArticleToProjectUseCase(db_session).execute(aid, sample_account_id, pid)

        count = db_session.query(ArticleLinkModel).filter(
            ArticleLinkModel.article_id == aid,
            ArticleLinkModel.entity_type == "project",
        ).count()
        assert count == 1

    def test_detach_from_project(self, db_session, sample_account_id):
        aid = _create_article(db_session, sample_account_id)
        pid = _create_project(db_session, sample_account_id)

        AttachArticleToProjectUseCase(db_session).execute(aid, sample_account_id, pid)
        DetachArticleFromProjectUseCase(db_session).execute(aid, sample_account_id, pid)

        count = db_session.query(ArticleLinkModel).filter(
            ArticleLinkModel.article_id == aid,
        ).count()
        assert count == 0

    def test_attach_nonexistent_project(self, db_session, sample_account_id):
        aid = _create_article(db_session, sample_account_id)
        with pytest.raises(KnowledgeValidationError, match="Проект не найден"):
            AttachArticleToProjectUseCase(db_session).execute(aid, sample_account_id, 9999)


# ── KnowledgeReadService ──

class TestKnowledgeReadService:
    def test_list_excludes_archived(self, db_session, sample_account_id):
        _create_article(db_session, sample_account_id, title="Active", status="published")
        _create_article(db_session, sample_account_id, title="Archived", status="archived")

        svc = KnowledgeReadService(db_session)
        articles = svc.list_articles(sample_account_id)
        assert len(articles) == 1
        assert articles[0]["title"] == "Active"

    def test_list_filter_by_type(self, db_session, sample_account_id):
        _create_article(db_session, sample_account_id, title="Note", type="note")
        _create_article(db_session, sample_account_id, title="Instr", type="instruction")

        svc = KnowledgeReadService(db_session)
        articles = svc.list_articles(sample_account_id, type_filter="instruction")
        assert len(articles) == 1
        assert articles[0]["title"] == "Instr"

    def test_list_filter_by_status(self, db_session, sample_account_id):
        _create_article(db_session, sample_account_id, title="Draft", status="draft")
        _create_article(db_session, sample_account_id, title="Pub", status="published")

        svc = KnowledgeReadService(db_session)
        articles = svc.list_articles(sample_account_id, status_filter="published")
        assert len(articles) == 1
        assert articles[0]["title"] == "Pub"

    def test_list_filter_by_tag(self, db_session, sample_account_id):
        _create_article(db_session, sample_account_id, title="Tagged", tags_csv="finance")
        _create_article(db_session, sample_account_id, title="Untagged")

        svc = KnowledgeReadService(db_session)
        articles = svc.list_articles(sample_account_id, tag_filter="finance")
        assert len(articles) == 1
        assert articles[0]["title"] == "Tagged"

    def test_search_by_title(self, db_session, sample_account_id):
        _create_article(db_session, sample_account_id, title="Python Guide")
        _create_article(db_session, sample_account_id, title="Other")

        svc = KnowledgeReadService(db_session)
        articles = svc.list_articles(sample_account_id, search="python")
        assert len(articles) == 1
        assert articles[0]["title"] == "Python Guide"

    def test_search_by_content(self, db_session, sample_account_id):
        _create_article(db_session, sample_account_id, title="A", content_md="Hello world")
        _create_article(db_session, sample_account_id, title="B", content_md="Goodbye")

        svc = KnowledgeReadService(db_session)
        articles = svc.list_articles(sample_account_id, search="hello")
        assert len(articles) == 1
        assert articles[0]["title"] == "A"

    def test_pinned_first(self, db_session, sample_account_id):
        _create_article(db_session, sample_account_id, title="Normal")
        _create_article(db_session, sample_account_id, title="Pinned", pinned=True)

        svc = KnowledgeReadService(db_session)
        articles = svc.list_articles(sample_account_id)
        assert articles[0]["title"] == "Pinned"
        assert articles[0]["pinned"] is True

    def test_get_article_detail(self, db_session, sample_account_id):
        aid = _create_article(
            db_session, sample_account_id,
            title="Detail",
            content_md="Content",
            tags_csv="tag1, tag2",
        )
        pid = _create_project(db_session, sample_account_id, title="Linked Project")
        AttachArticleToProjectUseCase(db_session).execute(aid, sample_account_id, pid)

        svc = KnowledgeReadService(db_session)
        detail = svc.get_article_detail(aid, sample_account_id)

        assert detail is not None
        assert detail["title"] == "Detail"
        assert detail["content_md"] == "Content"
        assert len(detail["tags"]) == 2
        assert detail["tags_csv"] == "tag1, tag2"
        assert len(detail["linked_projects"]) == 1
        assert detail["linked_projects"][0]["title"] == "Linked Project"

    def test_get_article_detail_not_found(self, db_session, sample_account_id):
        svc = KnowledgeReadService(db_session)
        assert svc.get_article_detail(9999, sample_account_id) is None

    def test_articles_for_entity(self, db_session, sample_account_id):
        aid = _create_article(db_session, sample_account_id, title="Linked")
        _create_article(db_session, sample_account_id, title="Not Linked")
        pid = _create_project(db_session, sample_account_id)

        AttachArticleToProjectUseCase(db_session).execute(aid, sample_account_id, pid)

        svc = KnowledgeReadService(db_session)
        articles = svc.get_articles_for_entity(sample_account_id, "project", pid)
        assert len(articles) == 1
        assert articles[0]["title"] == "Linked"

    def test_get_all_tags(self, db_session, sample_account_id):
        _create_article(db_session, sample_account_id, tags_csv="beta, alpha")
        _create_article(db_session, sample_account_id, tags_csv="alpha, gamma")

        svc = KnowledgeReadService(db_session)
        tags = svc.get_all_tags(sample_account_id)
        assert tags == ["alpha", "beta", "gamma"]
