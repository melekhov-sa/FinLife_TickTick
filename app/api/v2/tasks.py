"""
GET  /api/v2/tasks        — list active tasks (with filters)
POST /api/v2/tasks/{id}/complete
POST /api/v2/tasks/{id}/archive
"""
from datetime import date, datetime

from fastapi import APIRouter, Depends, Request, Query
from pydantic import BaseModel, field_serializer
from sqlalchemy.orm import Session

from app.infrastructure.db.session import get_db
from app.api.v2.deps import get_user_id
from app.infrastructure.db.models import TaskModel

router = APIRouter()


class TaskItem(BaseModel):
    task_id: int
    title: str
    status: str
    due_date: date | None
    completed_at: datetime | None
    project_id: int | None
    is_overdue: bool

    @field_serializer("due_date")
    def _date(self, v: date | None) -> str | None:
        return v.isoformat() if v else None

    @field_serializer("completed_at")
    def _dt(self, v: datetime | None) -> str | None:
        return v.isoformat() if v else None


@router.get("/tasks", response_model=list[TaskItem])
def list_tasks(
    request: Request,
    status: str = Query("ACTIVE"),
    project_id: int | None = Query(None),
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(request)
    today = date.today()

    q = db.query(TaskModel).filter(TaskModel.account_id == user_id)
    if status in ("ACTIVE", "DONE", "ARCHIVED"):
        q = q.filter(TaskModel.status == status)
    if project_id is not None:
        q = q.filter(TaskModel.project_id == project_id)

    tasks = q.order_by(TaskModel.due_date.asc().nullslast(), TaskModel.task_id.desc()).limit(limit).all()

    return [
        TaskItem(
            task_id=t.task_id,
            title=t.title,
            status=t.status,
            due_date=t.due_date,
            completed_at=t.completed_at,
            project_id=t.project_id,
            is_overdue=(
                t.due_date is not None
                and t.due_date < today
                and t.status == "ACTIVE"
            ),
        )
        for t in tasks
    ]
