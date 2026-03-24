"""
GET /api/v2/projects        — list projects
GET /api/v2/projects/{id}   — project board detail
"""
from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from pydantic import BaseModel, field_serializer
from sqlalchemy.orm import Session

from app.infrastructure.db.session import get_db
from app.api.v2.deps import get_user_id
from app.application.projects import ProjectReadService, CreateProjectUseCase, CreateTaskInProjectUseCase, ProjectValidationError

router = APIRouter()


# ── Response models ───────────────────────────────────────────────────────────

class ProjectSummary(BaseModel):
    id: int
    title: str
    description: str | None
    status: str
    start_date: date | None
    due_date: date | None
    created_at: datetime
    total_tasks: int
    done_tasks: int
    progress: int
    hide_from_plan: bool = False

    @field_serializer("start_date", "due_date")
    def _date(self, v: date | None) -> str | None:
        return v.isoformat() if v else None

    @field_serializer("created_at")
    def _dt(self, v: datetime) -> str:
        return v.isoformat()


class TaskCard(BaseModel):
    task_id: int
    title: str
    status: str
    board_status: str
    due_date: date | None
    completed_at: datetime | None
    is_overdue: bool
    tags: list[dict[str, Any]]
    tag_ids: list[int]

    @field_serializer("due_date")
    def _date(self, v: date | None) -> str | None:
        return v.isoformat() if v else None

    @field_serializer("completed_at")
    def _dt(self, v: datetime | None) -> str | None:
        return v.isoformat() if v else None


class ProjectTag(BaseModel):
    id: int
    name: str
    color: str | None = None


class BoardColumn(BaseModel):
    key: str
    label: str


class ProjectDetail(BaseModel):
    id: int
    title: str
    description: str | None
    status: str
    start_date: date | None
    due_date: date | None
    created_at: datetime
    total_tasks: int
    done_tasks: int
    progress: int
    columns: list[BoardColumn]
    groups: dict[str, list[TaskCard]]
    tags: list[ProjectTag]

    @field_serializer("start_date", "due_date")
    def _date(self, v: date | None) -> str | None:
        return v.isoformat() if v else None

    @field_serializer("created_at")
    def _dt(self, v: datetime) -> str:
        return v.isoformat()


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/projects", response_model=list[ProjectSummary])
def list_projects(
    request: Request,
    status: str | None = Query(None),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(request, db)
    svc = ProjectReadService(db)
    return svc.list_projects(user_id, status_filter=status)


@router.get("/projects/{project_id}", response_model=ProjectDetail)
def get_project(
    project_id: int,
    request: Request,
    tag_filter: int | None = Query(None),
    db: Session = Depends(get_db),
):
    from fastapi import HTTPException
    user_id = get_user_id(request, db)
    svc = ProjectReadService(db)
    data = svc.get_project_detail(project_id, user_id, tag_filter=tag_filter)
    if data is None:
        raise HTTPException(status_code=404, detail="Project not found")

    columns = [BoardColumn(**c) for c in data["board_columns"]]
    tags = [ProjectTag(**t) for t in data["project_tags"]]
    groups = {
        col_key: [TaskCard(**t) for t in task_list]
        for col_key, task_list in data["groups"].items()
    }

    return ProjectDetail(
        id=data["id"],
        title=data["title"],
        description=data["description"],
        status=data["status"],
        start_date=data["start_date"],
        due_date=data["due_date"],
        created_at=data["created_at"],
        total_tasks=data["total_tasks"],
        done_tasks=data["done_tasks"],
        progress=data["progress"],
        columns=columns,
        groups=groups,
        tags=tags,
    )


# ── Create project ─────────────────────────────────────────────────────────────

class CreateProjectRequest(BaseModel):
    title: str
    description: str | None = None
    status: str = "planned"
    start_date: date | None = None
    due_date: date | None = None


class CreateProjectResponse(BaseModel):
    id: int


@router.post("/projects", response_model=CreateProjectResponse, status_code=201)
def create_project(
    body: CreateProjectRequest,
    user_id: int = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    try:
        project_id = CreateProjectUseCase(db).execute(
            account_id=user_id,
            title=body.title,
            description=body.description,
            status=body.status,
            start_date=body.start_date,
            due_date=body.due_date,
        )
    except ProjectValidationError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return CreateProjectResponse(id=project_id)


# ── Update project settings ────────────────────────────────────────────────────

class UpdateProjectSettingsRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    hide_from_plan: bool | None = None


@router.patch("/projects/{project_id}")
def update_project(
    project_id: int,
    body: UpdateProjectSettingsRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    from app.infrastructure.db.models import ProjectModel
    user_id = get_user_id(request, db)
    project = db.query(ProjectModel).filter(
        ProjectModel.id == project_id, ProjectModel.account_id == user_id,
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    fields = body.model_fields_set
    if "title" in fields and body.title:
        project.title = body.title.strip()
    if "description" in fields:
        project.description = body.description
    if "status" in fields and body.status:
        project.status = body.status
    if "hide_from_plan" in fields and body.hide_from_plan is not None:
        project.hide_from_plan = body.hide_from_plan
    db.commit()
    return {"ok": True}


# ── Create task in project ─────────────────────────────────────────────────────

class CreateProjectTaskRequest(BaseModel):
    title: str
    board_status: str = "backlog"
    note: str | None = None
    due_date: str | None = None
    category_id: int | None = None


class CreateProjectTaskResponse(BaseModel):
    id: int


@router.post("/projects/{project_id}/tasks", response_model=CreateProjectTaskResponse, status_code=201)
def create_project_task(
    project_id: int,
    body: CreateProjectTaskRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = get_user_id(request, db)
    try:
        task_id = CreateTaskInProjectUseCase(db).execute(
            account_id=user_id,
            project_id=project_id,
            title=body.title,
            note=body.note,
            due_date=body.due_date,
            category_id=body.category_id,
            board_status=body.board_status,
        )
    except ProjectValidationError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return CreateProjectTaskResponse(id=task_id)
