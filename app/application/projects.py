"""
Projects use-cases and read service.
"""
from datetime import datetime, date as date_type
from typing import List, Dict, Any

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.infrastructure.db.models import (
    ProjectModel, TaskModel, ProjectTagModel, TaskProjectTagModel,
)
from app.application.tasks_usecases import CreateTaskUseCase


# ── Constants ──

PROJECT_STATUSES = ("planned", "active", "paused", "done", "archived")
BOARD_STATUSES = ("backlog", "todo", "in_progress", "waiting", "done")

BOARD_STATUS_ORDER = {s: i for i, s in enumerate(BOARD_STATUSES)}

TAG_COLORS = ("gray", "blue", "green", "orange", "purple")


# ── Errors ──

class ProjectValidationError(ValueError):
    pass


# ── Use Cases ──

class CreateProjectUseCase:
    def __init__(self, db: Session):
        self.db = db

    def execute(
        self,
        account_id: int,
        title: str,
        description: str | None = None,
        status: str = "planned",
        start_date: date_type | None = None,
        due_date: date_type | None = None,
    ) -> int:
        title = title.strip()
        if not title:
            raise ProjectValidationError("Название проекта не может быть пустым")
        if status not in PROJECT_STATUSES:
            raise ProjectValidationError(f"Недопустимый статус: {status}")

        project = ProjectModel(
            account_id=account_id,
            title=title,
            description=(description or "").strip() or None,
            status=status,
            start_date=start_date,
            due_date=due_date,
        )
        self.db.add(project)
        self.db.flush()
        self.db.commit()
        return project.id


class UpdateProjectUseCase:
    def __init__(self, db: Session):
        self.db = db

    def execute(self, project_id: int, account_id: int, **changes) -> None:
        project = self._get(project_id, account_id)

        if "title" in changes:
            title = changes["title"].strip()
            if not title:
                raise ProjectValidationError("Название проекта не может быть пустым")
            project.title = title
        if "description" in changes:
            project.description = (changes["description"] or "").strip() or None
        if "status" in changes:
            if changes["status"] not in PROJECT_STATUSES:
                raise ProjectValidationError(f"Недопустимый статус: {changes['status']}")
            project.status = changes["status"]
        if "start_date" in changes:
            project.start_date = changes["start_date"]
        if "due_date" in changes:
            project.due_date = changes["due_date"]

        self.db.commit()

    def _get(self, pid: int, aid: int) -> ProjectModel:
        p = self.db.query(ProjectModel).filter(
            ProjectModel.id == pid,
            ProjectModel.account_id == aid,
        ).first()
        if not p:
            raise ProjectValidationError("Проект не найден")
        return p


class ChangeProjectStatusUseCase:
    def __init__(self, db: Session):
        self.db = db

    def execute(self, project_id: int, account_id: int, new_status: str) -> None:
        if new_status not in PROJECT_STATUSES:
            raise ProjectValidationError(f"Недопустимый статус: {new_status}")

        project = self.db.query(ProjectModel).filter(
            ProjectModel.id == project_id,
            ProjectModel.account_id == account_id,
        ).first()
        if not project:
            raise ProjectValidationError("Проект не найден")

        project.status = new_status
        self.db.commit()


class DeleteProjectUseCase:
    """Soft-delete: set status to archived and unlink tasks."""

    def __init__(self, db: Session):
        self.db = db

    def execute(self, project_id: int, account_id: int) -> None:
        project = self.db.query(ProjectModel).filter(
            ProjectModel.id == project_id,
            ProjectModel.account_id == account_id,
        ).first()
        if not project:
            raise ProjectValidationError("Проект не найден")

        # Unlink all tasks from project
        self.db.query(TaskModel).filter(
            TaskModel.project_id == project_id,
        ).update({"project_id": None}, synchronize_session="fetch")

        project.status = "archived"
        self.db.commit()


class AssignTaskToProjectUseCase:
    def __init__(self, db: Session):
        self.db = db

    def execute(self, task_id: int, account_id: int, project_id: int | None) -> None:
        task = self.db.query(TaskModel).filter(
            TaskModel.task_id == task_id,
            TaskModel.account_id == account_id,
        ).first()
        if not task:
            raise ProjectValidationError("Задача не найдена")

        if project_id is not None:
            project = self.db.query(ProjectModel).filter(
                ProjectModel.id == project_id,
                ProjectModel.account_id == account_id,
            ).first()
            if not project:
                raise ProjectValidationError("Проект не найден")

        task.project_id = project_id
        self.db.commit()


class CreateTaskInProjectUseCase:
    """Create a new task and assign it to a project."""

    def __init__(self, db: Session):
        self.db = db

    def execute(
        self,
        account_id: int,
        project_id: int,
        title: str,
        note: str | None = None,
        due_kind: str = "NONE",
        due_date: str | None = None,
        due_time: str | None = None,
        category_id: int | None = None,
    ) -> int:
        project = self.db.query(ProjectModel).filter(
            ProjectModel.id == project_id,
            ProjectModel.account_id == account_id,
        ).first()
        if not project:
            raise ProjectValidationError("Проект не найден")

        task_id = CreateTaskUseCase(self.db).execute(
            account_id=account_id,
            title=title,
            note=note,
            due_kind=due_kind,
            due_date=due_date,
            due_time=due_time,
            category_id=category_id,
        )

        AssignTaskToProjectUseCase(self.db).execute(task_id, account_id, project_id)
        return task_id


class ChangeTaskBoardStatusUseCase:
    def __init__(self, db: Session):
        self.db = db

    def execute(self, task_id: int, account_id: int, new_status: str) -> None:
        if new_status not in BOARD_STATUSES:
            raise ProjectValidationError(f"Недопустимый board_status: {new_status}")

        task = self.db.query(TaskModel).filter(
            TaskModel.task_id == task_id,
            TaskModel.account_id == account_id,
        ).first()
        if not task:
            raise ProjectValidationError("Задача не найдена")

        task.board_status = new_status

        # Auto-complete task when moved to done
        if new_status == "done" and task.completed_at is None:
            task.completed_at = func.now()
            task.status = "DONE"

        self.db.commit()


# ── Project Tag Use Cases ──

class CreateProjectTagUseCase:
    def __init__(self, db: Session):
        self.db = db

    def execute(self, project_id: int, account_id: int, name: str, color: str | None = None) -> int:
        project = self.db.query(ProjectModel).filter(
            ProjectModel.id == project_id,
            ProjectModel.account_id == account_id,
        ).first()
        if not project:
            raise ProjectValidationError("Проект не найден")

        name = name.strip()
        if not name:
            raise ProjectValidationError("Название тега не может быть пустым")

        if color and color not in TAG_COLORS:
            raise ProjectValidationError(f"Недопустимый цвет: {color}")

        existing = self.db.query(ProjectTagModel).filter(
            ProjectTagModel.project_id == project_id,
            ProjectTagModel.name == name,
        ).first()
        if existing:
            raise ProjectValidationError(f"Тег '{name}' уже существует")

        tag = ProjectTagModel(
            project_id=project_id,
            name=name,
            color=color or None,
        )
        self.db.add(tag)
        self.db.flush()
        self.db.commit()
        return tag.id


class UpdateProjectTagUseCase:
    def __init__(self, db: Session):
        self.db = db

    def execute(self, tag_id: int, project_id: int, account_id: int, name: str | None = None, color: str | None = ...) -> None:
        tag = self._get_tag(tag_id, project_id, account_id)

        if name is not None:
            name = name.strip()
            if not name:
                raise ProjectValidationError("Название тега не может быть пустым")
            dup = self.db.query(ProjectTagModel).filter(
                ProjectTagModel.project_id == project_id,
                ProjectTagModel.name == name,
                ProjectTagModel.id != tag_id,
            ).first()
            if dup:
                raise ProjectValidationError(f"Тег '{name}' уже существует")
            tag.name = name

        if color is not ...:
            if color and color not in TAG_COLORS:
                raise ProjectValidationError(f"Недопустимый цвет: {color}")
            tag.color = color or None

        self.db.commit()

    def _get_tag(self, tag_id: int, project_id: int, account_id: int) -> ProjectTagModel:
        tag = (
            self.db.query(ProjectTagModel)
            .join(ProjectModel, ProjectModel.id == ProjectTagModel.project_id)
            .filter(
                ProjectTagModel.id == tag_id,
                ProjectTagModel.project_id == project_id,
                ProjectModel.account_id == account_id,
            )
            .first()
        )
        if not tag:
            raise ProjectValidationError("Тег не найден")
        return tag


class DeleteProjectTagUseCase:
    def __init__(self, db: Session):
        self.db = db

    def execute(self, tag_id: int, project_id: int, account_id: int) -> None:
        tag = (
            self.db.query(ProjectTagModel)
            .join(ProjectModel, ProjectModel.id == ProjectTagModel.project_id)
            .filter(
                ProjectTagModel.id == tag_id,
                ProjectTagModel.project_id == project_id,
                ProjectModel.account_id == account_id,
            )
            .first()
        )
        if not tag:
            raise ProjectValidationError("Тег не найден")

        self.db.query(TaskProjectTagModel).filter(
            TaskProjectTagModel.project_tag_id == tag_id,
        ).delete()
        self.db.delete(tag)
        self.db.commit()


class AddTagToTaskUseCase:
    def __init__(self, db: Session):
        self.db = db

    def execute(self, task_id: int, project_tag_id: int, project_id: int, account_id: int) -> None:
        task = self.db.query(TaskModel).filter(
            TaskModel.task_id == task_id,
            TaskModel.account_id == account_id,
        ).first()
        if not task:
            raise ProjectValidationError("Задача не найдена")

        tag = (
            self.db.query(ProjectTagModel)
            .join(ProjectModel, ProjectModel.id == ProjectTagModel.project_id)
            .filter(
                ProjectTagModel.id == project_tag_id,
                ProjectTagModel.project_id == project_id,
                ProjectModel.account_id == account_id,
            )
            .first()
        )
        if not tag:
            raise ProjectValidationError("Тег не найден")

        if task.project_id != tag.project_id:
            raise ProjectValidationError("Задача и тег принадлежат разным проектам")

        existing = self.db.query(TaskProjectTagModel).filter(
            TaskProjectTagModel.task_id == task_id,
            TaskProjectTagModel.project_tag_id == project_tag_id,
        ).first()
        if existing:
            return

        self.db.add(TaskProjectTagModel(task_id=task_id, project_tag_id=project_tag_id))
        self.db.commit()


class RemoveTagFromTaskUseCase:
    def __init__(self, db: Session):
        self.db = db

    def execute(self, task_id: int, project_tag_id: int, project_id: int, account_id: int) -> None:
        self.db.query(TaskProjectTagModel).filter(
            TaskProjectTagModel.task_id == task_id,
            TaskProjectTagModel.project_tag_id == project_tag_id,
        ).delete()
        self.db.commit()


# ── Read Service ──

class ProjectReadService:
    """Read-only queries for projects list and detail."""

    def __init__(self, db: Session):
        self.db = db

    def list_projects(
        self,
        account_id: int,
        status_filter: str | None = None,
    ) -> List[Dict[str, Any]]:
        q = self.db.query(ProjectModel).filter(
            ProjectModel.account_id == account_id,
        )
        if status_filter and status_filter in PROJECT_STATUSES:
            q = q.filter(ProjectModel.status == status_filter)
        else:
            # Hide archived by default
            q = q.filter(ProjectModel.status != "archived")

        projects = q.order_by(ProjectModel.created_at.desc()).all()

        # Batch-load task counts
        project_ids = [p.id for p in projects]
        counts = self._task_counts(project_ids) if project_ids else {}

        result = []
        for p in projects:
            c = counts.get(p.id, {"total": 0, "done": 0})
            total = c["total"]
            done = c["done"]
            result.append({
                "id": p.id,
                "title": p.title,
                "description": p.description,
                "status": p.status,
                "start_date": p.start_date,
                "due_date": p.due_date,
                "created_at": p.created_at,
                "total_tasks": total,
                "done_tasks": done,
                "progress": round(done / total * 100) if total else 0,
            })
        return result

    def get_project_detail(
        self,
        project_id: int,
        account_id: int,
        tag_filter: int | None = None,
    ) -> Dict[str, Any] | None:
        project = self.db.query(ProjectModel).filter(
            ProjectModel.id == project_id,
            ProjectModel.account_id == account_id,
        ).first()
        if not project:
            return None

        q = self.db.query(TaskModel).filter(TaskModel.project_id == project_id)

        if tag_filter:
            q = (
                q.join(TaskProjectTagModel, TaskProjectTagModel.task_id == TaskModel.task_id)
                .filter(TaskProjectTagModel.project_tag_id == tag_filter)
            )

        tasks = q.order_by(TaskModel.created_at.desc()).all()

        total = len(tasks)
        done = sum(1 for t in tasks if t.board_status == "done")

        # Batch-load task tags
        task_ids = [t.task_id for t in tasks]
        tags_map = self._task_tags(task_ids) if task_ids else {}

        # Group tasks by board_status
        grouped: Dict[str, list] = {s: [] for s in BOARD_STATUSES}
        for t in tasks:
            bs = t.board_status if t.board_status in grouped else "backlog"
            task_tags = tags_map.get(t.task_id, [])
            grouped[bs].append({
                "task_id": t.task_id,
                "title": t.title,
                "status": t.status,
                "board_status": t.board_status,
                "due_date": t.due_date,
                "completed_at": t.completed_at,
                "is_overdue": (
                    t.due_date is not None
                    and t.due_date < date_type.today()
                    and t.board_status != "done"
                ),
                "tags": task_tags,
                "tag_ids": [tg["id"] for tg in task_tags],
            })

        # Load project tags
        project_tags = (
            self.db.query(ProjectTagModel)
            .filter(ProjectTagModel.project_id == project_id)
            .order_by(ProjectTagModel.name)
            .all()
        )

        return {
            "id": project.id,
            "title": project.title,
            "description": project.description,
            "status": project.status,
            "start_date": project.start_date,
            "due_date": project.due_date,
            "created_at": project.created_at,
            "total_tasks": total,
            "done_tasks": done,
            "progress": round(done / total * 100) if total else 0,
            "groups": grouped,
            "project_tags": [
                {"id": pt.id, "name": pt.name, "color": pt.color}
                for pt in project_tags
            ],
        }

    def get_unassigned_tasks(self, account_id: int) -> List[Dict[str, Any]]:
        """Active tasks not assigned to any project."""
        tasks = (
            self.db.query(TaskModel)
            .filter(
                TaskModel.account_id == account_id,
                TaskModel.project_id.is_(None),
                TaskModel.status == "ACTIVE",
            )
            .order_by(TaskModel.created_at.desc())
            .all()
        )
        return [
            {"task_id": t.task_id, "title": t.title, "due_date": t.due_date}
            for t in tasks
        ]

    def get_project_tags(self, project_id: int, account_id: int) -> List[Dict[str, Any]]:
        """All tags for a project."""
        project = self.db.query(ProjectModel).filter(
            ProjectModel.id == project_id,
            ProjectModel.account_id == account_id,
        ).first()
        if not project:
            return []
        tags = (
            self.db.query(ProjectTagModel)
            .filter(ProjectTagModel.project_id == project_id)
            .order_by(ProjectTagModel.name)
            .all()
        )
        return [
            {"id": t.id, "name": t.name, "color": t.color, "created_at": t.created_at}
            for t in tags
        ]

    def _task_tags(self, task_ids: List[int]) -> Dict[int, List[Dict[str, Any]]]:
        """Batch-load project tags for tasks."""
        rows = (
            self.db.query(
                TaskProjectTagModel.task_id,
                ProjectTagModel.id,
                ProjectTagModel.name,
                ProjectTagModel.color,
            )
            .join(ProjectTagModel, TaskProjectTagModel.project_tag_id == ProjectTagModel.id)
            .filter(TaskProjectTagModel.task_id.in_(task_ids))
            .order_by(ProjectTagModel.name)
            .all()
        )
        result: Dict[int, List[Dict[str, Any]]] = {}
        for task_id, tag_id, tag_name, tag_color in rows:
            result.setdefault(task_id, []).append({
                "id": tag_id, "name": tag_name, "color": tag_color,
            })
        return result

    def _task_counts(self, project_ids: List[int]) -> Dict[int, Dict[str, int]]:
        rows = (
            self.db.query(
                TaskModel.project_id,
                func.count(TaskModel.task_id).label("total"),
                func.sum(
                    case((TaskModel.board_status == "done", 1), else_=0)
                ).label("done"),
            )
            .filter(TaskModel.project_id.in_(project_ids))
            .group_by(TaskModel.project_id)
            .all()
        )
        return {
            row.project_id: {"total": row.total, "done": row.done or 0}
            for row in rows
        }
