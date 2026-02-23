"""
Projects use-cases and read service.
"""
from datetime import datetime, date as date_type
from typing import List, Dict, Any

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.infrastructure.db.models import ProjectModel, TaskModel


# ── Constants ──

PROJECT_STATUSES = ("planned", "active", "paused", "done", "archived")
BOARD_STATUSES = ("backlog", "todo", "in_progress", "waiting", "done")

BOARD_STATUS_ORDER = {s: i for i, s in enumerate(BOARD_STATUSES)}


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
    ) -> Dict[str, Any] | None:
        project = self.db.query(ProjectModel).filter(
            ProjectModel.id == project_id,
            ProjectModel.account_id == account_id,
        ).first()
        if not project:
            return None

        tasks = (
            self.db.query(TaskModel)
            .filter(TaskModel.project_id == project_id)
            .order_by(TaskModel.created_at.desc())
            .all()
        )

        total = len(tasks)
        done = sum(1 for t in tasks if t.board_status == "done")

        # Group tasks by board_status
        grouped: Dict[str, list] = {s: [] for s in BOARD_STATUSES}
        for t in tasks:
            bs = t.board_status if t.board_status in grouped else "backlog"
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
            })

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
