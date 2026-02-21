"""Tests for Task Presets (quick templates) feature"""
import pytest
from datetime import datetime, timezone
from sqlalchemy import func
from app.infrastructure.db.models import User, TaskPresetModel, WorkCategory


# ── helpers ──

def _create_user(db, email="test@example.com", enable_task_templates=False):
    now = datetime.now(timezone.utc)
    user = User(
        email=email,
        password_hash="fakehash",
        created_at=now,
        enable_task_templates=enable_task_templates,
    )
    db.add(user)
    db.flush()
    return user


def _create_preset(db, account_id, name="Preset", title_template="Title", **kwargs):
    now = datetime.now(timezone.utc)
    preset = TaskPresetModel(
        account_id=account_id,
        name=name,
        title_template=title_template,
        created_at=now,
        **kwargs,
    )
    db.add(preset)
    db.flush()
    return preset


def _create_work_category(db, account_id, title="Work Cat"):
    now = datetime.now(timezone.utc)
    cat = WorkCategory(
        account_id=account_id,
        title=title,
        created_at=now,
    )
    db.add(cat)
    db.flush()
    return cat


# ── tests ──

class TestTaskPresetSetting:
    """Test enable_task_templates user setting."""

    def test_setting_default_false(self, db_session):
        user = _create_user(db_session)
        assert user.enable_task_templates is False

    def test_setting_enabled(self, db_session):
        user = _create_user(db_session, enable_task_templates=True)
        assert user.enable_task_templates is True

    def test_toggle_setting(self, db_session):
        user = _create_user(db_session)
        assert user.enable_task_templates is False
        user.enable_task_templates = True
        db_session.flush()
        fetched = db_session.query(User).filter(User.id == user.id).first()
        assert fetched.enable_task_templates is True


class TestTaskPresetCRUD:
    """Test CRUD operations on TaskPresetModel."""

    def test_create_preset(self, db_session):
        user = _create_user(db_session)
        preset = _create_preset(
            db_session,
            account_id=user.id,
            name="Оплата ЖКХ",
            title_template="Оплатить ЖКХ за месяц",
            description_template="Квитанция в почтовом ящике",
            sort_order=1,
        )
        assert preset.id is not None
        fetched = db_session.query(TaskPresetModel).filter(
            TaskPresetModel.id == preset.id
        ).first()
        assert fetched.name == "Оплата ЖКХ"
        assert fetched.title_template == "Оплатить ЖКХ за месяц"
        assert fetched.description_template == "Квитанция в почтовом ящике"
        assert fetched.is_active is True
        assert fetched.sort_order == 1

    def test_create_preset_with_category(self, db_session):
        user = _create_user(db_session)
        cat = _create_work_category(db_session, user.id, title="Дом")
        preset = _create_preset(
            db_session,
            account_id=user.id,
            name="Уборка",
            title_template="Генеральная уборка",
            default_task_category_id=cat.category_id,
        )
        fetched = db_session.query(TaskPresetModel).filter(
            TaskPresetModel.id == preset.id
        ).first()
        assert fetched.default_task_category_id == cat.category_id

    def test_edit_preset(self, db_session):
        user = _create_user(db_session)
        preset = _create_preset(db_session, account_id=user.id, name="Old")
        preset.name = "New Name"
        preset.title_template = "New Title"
        preset.description_template = "New Desc"
        db_session.flush()
        fetched = db_session.query(TaskPresetModel).filter(
            TaskPresetModel.id == preset.id
        ).first()
        assert fetched.name == "New Name"
        assert fetched.title_template == "New Title"
        assert fetched.description_template == "New Desc"

    def test_deactivate_preset(self, db_session):
        user = _create_user(db_session)
        preset = _create_preset(db_session, account_id=user.id)
        assert preset.is_active is True
        preset.is_active = False
        db_session.flush()

        active = db_session.query(TaskPresetModel).filter(
            TaskPresetModel.account_id == user.id,
            TaskPresetModel.is_active == True,
        ).all()
        assert len(active) == 0

        inactive = db_session.query(TaskPresetModel).filter(
            TaskPresetModel.account_id == user.id,
            TaskPresetModel.is_active == False,
        ).all()
        assert len(inactive) == 1

    def test_reorder_presets(self, db_session):
        user = _create_user(db_session)
        p1 = _create_preset(db_session, account_id=user.id, name="First", sort_order=0)
        p2 = _create_preset(db_session, account_id=user.id, name="Second", sort_order=1)
        p3 = _create_preset(db_session, account_id=user.id, name="Third", sort_order=2)

        # Swap p2 and p3 (move p3 up)
        p2.sort_order, p3.sort_order = p3.sort_order, p2.sort_order
        db_session.flush()

        ordered = db_session.query(TaskPresetModel).filter(
            TaskPresetModel.account_id == user.id,
        ).order_by(TaskPresetModel.sort_order, TaskPresetModel.id).all()
        assert [p.name for p in ordered] == ["First", "Third", "Second"]

    def test_only_own_presets(self, db_session):
        user1 = _create_user(db_session, email="u1@test.com")
        user2 = _create_user(db_session, email="u2@test.com")
        _create_preset(db_session, account_id=user1.id, name="User1 Preset")
        _create_preset(db_session, account_id=user2.id, name="User2 Preset")

        u1_presets = db_session.query(TaskPresetModel).filter(
            TaskPresetModel.account_id == user1.id,
        ).all()
        u2_presets = db_session.query(TaskPresetModel).filter(
            TaskPresetModel.account_id == user2.id,
        ).all()
        assert len(u1_presets) == 1
        assert u1_presets[0].name == "User1 Preset"
        assert len(u2_presets) == 1
        assert u2_presets[0].name == "User2 Preset"

    def test_active_presets_filtered(self, db_session):
        """When loading presets for form, only active ones should appear."""
        user = _create_user(db_session, enable_task_templates=True)
        _create_preset(db_session, account_id=user.id, name="Active", is_active=True, sort_order=0)
        _create_preset(db_session, account_id=user.id, name="Inactive", is_active=False, sort_order=1)

        active = db_session.query(TaskPresetModel).filter(
            TaskPresetModel.account_id == user.id,
            TaskPresetModel.is_active == True,
        ).order_by(TaskPresetModel.sort_order).all()
        assert len(active) == 1
        assert active[0].name == "Active"
