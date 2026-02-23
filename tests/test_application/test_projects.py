"""
Tests for Projects use-cases and read service.
"""
import pytest
from datetime import datetime, date
from decimal import Decimal

from app.infrastructure.db.models import ProjectModel, TaskModel, ProjectTagModel, TaskProjectTagModel
from app.application.projects import (
    CreateProjectUseCase, UpdateProjectUseCase,
    ChangeProjectStatusUseCase, DeleteProjectUseCase,
    AssignTaskToProjectUseCase, ChangeTaskBoardStatusUseCase,
    CreateTaskInProjectUseCase,
    CreateProjectTagUseCase, UpdateProjectTagUseCase, DeleteProjectTagUseCase,
    AddTagToTaskUseCase, RemoveTagFromTaskUseCase,
    ProjectReadService, ProjectValidationError,
)
from app.application.tasks_usecases import TaskValidationError


_NOW = datetime(2025, 10, 15, 12, 0, 0)


def _add_task(db, account_id, title, task_id=None, project_id=None, board_status="backlog"):
    tid = task_id or (db.query(TaskModel).count() + 1)
    t = TaskModel(
        task_id=tid, account_id=account_id,
        title=title, status="ACTIVE",
        project_id=project_id, board_status=board_status,
        created_at=_NOW,
    )
    db.add(t)
    db.flush()
    return t


# ── CreateProject ──

class TestCreateProject:
    def test_create_basic(self, db_session, sample_account_id):
        pid = CreateProjectUseCase(db_session).execute(
            account_id=sample_account_id, title="Проект Альфа",
        )
        assert pid > 0
        p = db_session.query(ProjectModel).get(pid)
        assert p.title == "Проект Альфа"
        assert p.status == "planned"
        assert p.account_id == sample_account_id

    def test_create_with_all_fields(self, db_session, sample_account_id):
        pid = CreateProjectUseCase(db_session).execute(
            account_id=sample_account_id,
            title="Проект Бета",
            description="Описание проекта",
            status="active",
            start_date=date(2025, 10, 1),
            due_date=date(2025, 12, 31),
        )
        p = db_session.query(ProjectModel).get(pid)
        assert p.description == "Описание проекта"
        assert p.status == "active"
        assert p.start_date == date(2025, 10, 1)
        assert p.due_date == date(2025, 12, 31)

    def test_empty_title_rejected(self, db_session, sample_account_id):
        with pytest.raises(ProjectValidationError, match="Название"):
            CreateProjectUseCase(db_session).execute(
                account_id=sample_account_id, title="   ",
            )

    def test_invalid_status_rejected(self, db_session, sample_account_id):
        with pytest.raises(ProjectValidationError, match="статус"):
            CreateProjectUseCase(db_session).execute(
                account_id=sample_account_id, title="Test", status="invalid",
            )


# ── UpdateProject ──

class TestUpdateProject:
    def test_update_title(self, db_session, sample_account_id):
        pid = CreateProjectUseCase(db_session).execute(
            account_id=sample_account_id, title="Old",
        )
        UpdateProjectUseCase(db_session).execute(
            project_id=pid, account_id=sample_account_id, title="New",
        )
        p = db_session.query(ProjectModel).get(pid)
        assert p.title == "New"

    def test_update_not_found(self, db_session, sample_account_id):
        with pytest.raises(ProjectValidationError, match="не найден"):
            UpdateProjectUseCase(db_session).execute(
                project_id=9999, account_id=sample_account_id, title="X",
            )


# ── ChangeProjectStatus ──

class TestChangeProjectStatus:
    def test_change_status(self, db_session, sample_account_id):
        pid = CreateProjectUseCase(db_session).execute(
            account_id=sample_account_id, title="Test",
        )
        ChangeProjectStatusUseCase(db_session).execute(pid, sample_account_id, "active")
        p = db_session.query(ProjectModel).get(pid)
        assert p.status == "active"

        ChangeProjectStatusUseCase(db_session).execute(pid, sample_account_id, "done")
        db_session.refresh(p)
        assert p.status == "done"

    def test_invalid_status(self, db_session, sample_account_id):
        pid = CreateProjectUseCase(db_session).execute(
            account_id=sample_account_id, title="Test",
        )
        with pytest.raises(ProjectValidationError, match="статус"):
            ChangeProjectStatusUseCase(db_session).execute(pid, sample_account_id, "bad")


# ── DeleteProject ──

class TestDeleteProject:
    def test_archives_and_unlinks(self, db_session, sample_account_id):
        pid = CreateProjectUseCase(db_session).execute(
            account_id=sample_account_id, title="Del",
        )
        t = _add_task(db_session, sample_account_id, "Task in project", project_id=pid)

        DeleteProjectUseCase(db_session).execute(pid, sample_account_id)

        p = db_session.query(ProjectModel).get(pid)
        assert p.status == "archived"

        db_session.refresh(t)
        assert t.project_id is None


# ── AssignTaskToProject ──

class TestAssignTask:
    def test_assign_and_unassign(self, db_session, sample_account_id):
        pid = CreateProjectUseCase(db_session).execute(
            account_id=sample_account_id, title="Proj",
        )
        t = _add_task(db_session, sample_account_id, "Task")

        AssignTaskToProjectUseCase(db_session).execute(t.task_id, sample_account_id, pid)
        db_session.refresh(t)
        assert t.project_id == pid

        AssignTaskToProjectUseCase(db_session).execute(t.task_id, sample_account_id, None)
        db_session.refresh(t)
        assert t.project_id is None

    def test_assign_nonexistent_project(self, db_session, sample_account_id):
        t = _add_task(db_session, sample_account_id, "Task")
        with pytest.raises(ProjectValidationError, match="Проект не найден"):
            AssignTaskToProjectUseCase(db_session).execute(t.task_id, sample_account_id, 9999)


# ── ChangeTaskBoardStatus ──

class TestChangeTaskBoardStatus:
    def test_basic_change(self, db_session, sample_account_id):
        t = _add_task(db_session, sample_account_id, "Task")
        assert t.board_status == "backlog"

        ChangeTaskBoardStatusUseCase(db_session).execute(t.task_id, sample_account_id, "in_progress")
        db_session.refresh(t)
        assert t.board_status == "in_progress"

    def test_done_sets_completed_at(self, db_session, sample_account_id):
        t = _add_task(db_session, sample_account_id, "Task")
        assert t.completed_at is None

        ChangeTaskBoardStatusUseCase(db_session).execute(t.task_id, sample_account_id, "done")
        db_session.refresh(t)
        assert t.board_status == "done"
        assert t.completed_at is not None
        assert t.status == "DONE"

    def test_done_preserves_existing_completed_at(self, db_session, sample_account_id):
        t = _add_task(db_session, sample_account_id, "Task")
        t.completed_at = _NOW
        db_session.flush()

        ChangeTaskBoardStatusUseCase(db_session).execute(t.task_id, sample_account_id, "done")
        db_session.refresh(t)
        assert t.completed_at == _NOW

    def test_undone_keeps_completed_at(self, db_session, sample_account_id):
        t = _add_task(db_session, sample_account_id, "Task")
        ChangeTaskBoardStatusUseCase(db_session).execute(t.task_id, sample_account_id, "done")
        db_session.refresh(t)
        saved_ts = t.completed_at

        ChangeTaskBoardStatusUseCase(db_session).execute(t.task_id, sample_account_id, "todo")
        db_session.refresh(t)
        assert t.board_status == "todo"
        assert t.completed_at == saved_ts

    def test_invalid_board_status(self, db_session, sample_account_id):
        t = _add_task(db_session, sample_account_id, "Task")
        with pytest.raises(ProjectValidationError, match="board_status"):
            ChangeTaskBoardStatusUseCase(db_session).execute(t.task_id, sample_account_id, "invalid")


# ── ProjectReadService ──

class TestProjectReadService:
    def test_list_excludes_archived(self, db_session, sample_account_id):
        CreateProjectUseCase(db_session).execute(
            account_id=sample_account_id, title="Active", status="active",
        )
        CreateProjectUseCase(db_session).execute(
            account_id=sample_account_id, title="Archived", status="archived",
        )
        svc = ProjectReadService(db_session)
        projects = svc.list_projects(sample_account_id)
        assert len(projects) == 1
        assert projects[0]["title"] == "Active"

    def test_list_filter_by_status(self, db_session, sample_account_id):
        CreateProjectUseCase(db_session).execute(
            account_id=sample_account_id, title="P1", status="planned",
        )
        CreateProjectUseCase(db_session).execute(
            account_id=sample_account_id, title="P2", status="active",
        )
        svc = ProjectReadService(db_session)
        projects = svc.list_projects(sample_account_id, status_filter="active")
        assert len(projects) == 1
        assert projects[0]["title"] == "P2"

    def test_progress_calculation(self, db_session, sample_account_id):
        pid = CreateProjectUseCase(db_session).execute(
            account_id=sample_account_id, title="Proj",
        )
        _add_task(db_session, sample_account_id, "T1", task_id=1, project_id=pid, board_status="done")
        _add_task(db_session, sample_account_id, "T2", task_id=2, project_id=pid, board_status="done")
        _add_task(db_session, sample_account_id, "T3", task_id=3, project_id=pid, board_status="todo")
        _add_task(db_session, sample_account_id, "T4", task_id=4, project_id=pid, board_status="backlog")

        svc = ProjectReadService(db_session)
        projects = svc.list_projects(sample_account_id)
        assert len(projects) == 1
        p = projects[0]
        assert p["total_tasks"] == 4
        assert p["done_tasks"] == 2
        assert p["progress"] == 50

    def test_empty_project_zero_progress(self, db_session, sample_account_id):
        pid = CreateProjectUseCase(db_session).execute(
            account_id=sample_account_id, title="Empty",
        )
        svc = ProjectReadService(db_session)
        projects = svc.list_projects(sample_account_id)
        assert projects[0]["progress"] == 0

    def test_detail_groups_by_board_status(self, db_session, sample_account_id):
        pid = CreateProjectUseCase(db_session).execute(
            account_id=sample_account_id, title="Proj",
        )
        _add_task(db_session, sample_account_id, "Backlog", task_id=1, project_id=pid, board_status="backlog")
        _add_task(db_session, sample_account_id, "Todo", task_id=2, project_id=pid, board_status="todo")
        _add_task(db_session, sample_account_id, "Done", task_id=3, project_id=pid, board_status="done")

        svc = ProjectReadService(db_session)
        detail = svc.get_project_detail(pid, sample_account_id)

        assert detail is not None
        assert len(detail["groups"]["backlog"]) == 1
        assert len(detail["groups"]["todo"]) == 1
        assert len(detail["groups"]["done"]) == 1
        assert len(detail["groups"]["in_progress"]) == 0
        assert len(detail["groups"]["waiting"]) == 0

    def test_detail_not_found(self, db_session, sample_account_id):
        svc = ProjectReadService(db_session)
        assert svc.get_project_detail(9999, sample_account_id) is None


# ── CreateTaskInProject ──

class TestCreateTaskInProject:
    def test_create_task_in_project(self, db_session, sample_account_id):
        pid = CreateProjectUseCase(db_session).execute(
            account_id=sample_account_id, title="Proj",
        )
        task_id = CreateTaskInProjectUseCase(db_session).execute(
            account_id=sample_account_id,
            project_id=pid,
            title="New task",
        )
        assert task_id > 0
        t = db_session.query(TaskModel).filter(TaskModel.task_id == task_id).first()
        assert t is not None
        assert t.project_id == pid
        assert t.board_status == "backlog"
        assert t.title == "New task"
        assert t.status == "ACTIVE"

    def test_create_with_due_date(self, db_session, sample_account_id):
        pid = CreateProjectUseCase(db_session).execute(
            account_id=sample_account_id, title="Proj",
        )
        task_id = CreateTaskInProjectUseCase(db_session).execute(
            account_id=sample_account_id,
            project_id=pid,
            title="Dated task",
            due_kind="DATE",
            due_date="2026-03-15",
        )
        t = db_session.query(TaskModel).filter(TaskModel.task_id == task_id).first()
        assert t.due_kind == "DATE"
        assert t.due_date == date(2026, 3, 15)

    def test_project_not_found(self, db_session, sample_account_id):
        with pytest.raises(ProjectValidationError, match="Проект не найден"):
            CreateTaskInProjectUseCase(db_session).execute(
                account_id=sample_account_id,
                project_id=9999,
                title="Task",
            )

    def test_empty_title_rejected(self, db_session, sample_account_id):
        pid = CreateProjectUseCase(db_session).execute(
            account_id=sample_account_id, title="Proj",
        )
        with pytest.raises(TaskValidationError, match="пустым"):
            CreateTaskInProjectUseCase(db_session).execute(
                account_id=sample_account_id,
                project_id=pid,
                title="   ",
            )

    def test_task_appears_in_project_detail(self, db_session, sample_account_id):
        pid = CreateProjectUseCase(db_session).execute(
            account_id=sample_account_id, title="Proj",
        )
        CreateTaskInProjectUseCase(db_session).execute(
            account_id=sample_account_id,
            project_id=pid,
            title="Board task",
        )
        svc = ProjectReadService(db_session)
        detail = svc.get_project_detail(pid, sample_account_id)
        assert detail["total_tasks"] == 1
        assert len(detail["groups"]["backlog"]) == 1
        assert detail["groups"]["backlog"][0]["title"] == "Board task"


# ── ProjectTags ──

class TestProjectTags:
    def test_create_project_tag(self, db_session, sample_account_id):
        pid = CreateProjectUseCase(db_session).execute(
            account_id=sample_account_id, title="Proj",
        )
        tag_id = CreateProjectTagUseCase(db_session).execute(pid, sample_account_id, "Bug", "orange")
        assert tag_id > 0
        tag = db_session.query(ProjectTagModel).get(tag_id)
        assert tag.name == "Bug"
        assert tag.color == "orange"
        assert tag.project_id == pid

    def test_tag_unique_per_project(self, db_session, sample_account_id):
        pid = CreateProjectUseCase(db_session).execute(
            account_id=sample_account_id, title="Proj",
        )
        CreateProjectTagUseCase(db_session).execute(pid, sample_account_id, "Bug")
        with pytest.raises(ProjectValidationError, match="уже существует"):
            CreateProjectTagUseCase(db_session).execute(pid, sample_account_id, "Bug")

    def test_same_name_different_projects(self, db_session, sample_account_id):
        pid1 = CreateProjectUseCase(db_session).execute(
            account_id=sample_account_id, title="Proj1",
        )
        pid2 = CreateProjectUseCase(db_session).execute(
            account_id=sample_account_id, title="Proj2",
        )
        t1 = CreateProjectTagUseCase(db_session).execute(pid1, sample_account_id, "Bug")
        t2 = CreateProjectTagUseCase(db_session).execute(pid2, sample_account_id, "Bug")
        assert t1 != t2

    def test_update_tag(self, db_session, sample_account_id):
        pid = CreateProjectUseCase(db_session).execute(
            account_id=sample_account_id, title="Proj",
        )
        tag_id = CreateProjectTagUseCase(db_session).execute(pid, sample_account_id, "Bug", "orange")
        UpdateProjectTagUseCase(db_session).execute(tag_id, pid, sample_account_id, name="Feature", color="blue")
        tag = db_session.query(ProjectTagModel).get(tag_id)
        assert tag.name == "Feature"
        assert tag.color == "blue"

    def test_add_tag_to_task_same_project(self, db_session, sample_account_id):
        pid = CreateProjectUseCase(db_session).execute(
            account_id=sample_account_id, title="Proj",
        )
        task_id = CreateTaskInProjectUseCase(db_session).execute(
            account_id=sample_account_id, project_id=pid, title="Task",
        )
        tag_id = CreateProjectTagUseCase(db_session).execute(pid, sample_account_id, "Bug")
        AddTagToTaskUseCase(db_session).execute(task_id, tag_id, pid, sample_account_id)

        link = db_session.query(TaskProjectTagModel).filter(
            TaskProjectTagModel.task_id == task_id,
            TaskProjectTagModel.project_tag_id == tag_id,
        ).first()
        assert link is not None

    def test_add_tag_to_task_different_project(self, db_session, sample_account_id):
        pid1 = CreateProjectUseCase(db_session).execute(
            account_id=sample_account_id, title="Proj1",
        )
        pid2 = CreateProjectUseCase(db_session).execute(
            account_id=sample_account_id, title="Proj2",
        )
        task_id = CreateTaskInProjectUseCase(db_session).execute(
            account_id=sample_account_id, project_id=pid1, title="Task",
        )
        tag_id = CreateProjectTagUseCase(db_session).execute(pid2, sample_account_id, "Bug")
        with pytest.raises(ProjectValidationError, match="разным проектам"):
            AddTagToTaskUseCase(db_session).execute(task_id, tag_id, pid2, sample_account_id)

    def test_delete_tag_removes_links(self, db_session, sample_account_id):
        pid = CreateProjectUseCase(db_session).execute(
            account_id=sample_account_id, title="Proj",
        )
        task_id = CreateTaskInProjectUseCase(db_session).execute(
            account_id=sample_account_id, project_id=pid, title="Task",
        )
        tag_id = CreateProjectTagUseCase(db_session).execute(pid, sample_account_id, "Bug")
        AddTagToTaskUseCase(db_session).execute(task_id, tag_id, pid, sample_account_id)

        DeleteProjectTagUseCase(db_session).execute(tag_id, pid, sample_account_id)

        assert db_session.query(ProjectTagModel).get(tag_id) is None
        assert db_session.query(TaskProjectTagModel).filter(
            TaskProjectTagModel.project_tag_id == tag_id,
        ).count() == 0

    def test_filter_tasks_by_tag(self, db_session, sample_account_id):
        pid = CreateProjectUseCase(db_session).execute(
            account_id=sample_account_id, title="Proj",
        )
        t1 = CreateTaskInProjectUseCase(db_session).execute(
            account_id=sample_account_id, project_id=pid, title="Tagged",
        )
        CreateTaskInProjectUseCase(db_session).execute(
            account_id=sample_account_id, project_id=pid, title="Untagged",
        )
        tag_id = CreateProjectTagUseCase(db_session).execute(pid, sample_account_id, "Bug")
        AddTagToTaskUseCase(db_session).execute(t1, tag_id, pid, sample_account_id)

        svc = ProjectReadService(db_session)

        # Without filter: 2 tasks
        detail_all = svc.get_project_detail(pid, sample_account_id)
        assert detail_all["total_tasks"] == 2

        # With filter: only tagged task
        detail_filtered = svc.get_project_detail(pid, sample_account_id, tag_filter=tag_id)
        assert detail_filtered["total_tasks"] == 1
        all_tasks = []
        for group in detail_filtered["groups"].values():
            all_tasks.extend(group)
        assert len(all_tasks) == 1
        assert all_tasks[0]["title"] == "Tagged"

    def test_tags_in_project_detail(self, db_session, sample_account_id):
        pid = CreateProjectUseCase(db_session).execute(
            account_id=sample_account_id, title="Proj",
        )
        task_id = CreateTaskInProjectUseCase(db_session).execute(
            account_id=sample_account_id, project_id=pid, title="Task",
        )
        tag_id = CreateProjectTagUseCase(db_session).execute(pid, sample_account_id, "Bug", "orange")
        AddTagToTaskUseCase(db_session).execute(task_id, tag_id, pid, sample_account_id)

        svc = ProjectReadService(db_session)
        detail = svc.get_project_detail(pid, sample_account_id)

        # Project tags are listed
        assert len(detail["project_tags"]) == 1
        assert detail["project_tags"][0]["name"] == "Bug"

        # Task has tags
        task = detail["groups"]["backlog"][0]
        assert len(task["tags"]) == 1
        assert task["tags"][0]["name"] == "Bug"
        assert task["tags"][0]["color"] == "orange"
        assert tag_id in task["tag_ids"]
