"""
GET  /api/v2/tasks                       — list tasks (with filters + category emoji)
GET  /api/v2/work-categories             — list work categories (for task modal)
POST /api/v2/tasks                       — create a task
POST /api/v2/tasks/{id}/complete         — complete a task
POST /api/v2/tasks/{id}/archive          — archive a task
POST /api/v2/tasks/{id}/board-status     — move task to kanban column
"""
from datetime import date, datetime

from fastapi import APIRouter, Depends, Request, Query, HTTPException
from pydantic import BaseModel, field_serializer
from sqlalchemy.orm import Session

from app.infrastructure.db.session import get_db
from app.api.v2.deps import get_user_id
from app.infrastructure.db.models import TaskModel, WorkCategory

router = APIRouter()


class TaskItem(BaseModel):
    task_id: int
    title: str
    note: str | None
    status: str
    due_date: date | None
    completed_at: datetime | None
    project_id: int | None
    category_id: int | None
    category_emoji: str | None
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
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(request)
    today = date.today()

    q = db.query(TaskModel).filter(TaskModel.account_id == user_id)
    if status in ("ACTIVE", "DONE", "ARCHIVED"):
        q = q.filter(TaskModel.status == status)
    if project_id is not None:
        q = q.filter(TaskModel.project_id == project_id)

    if status == "DONE":
        tasks = q.order_by(TaskModel.completed_at.desc()).limit(limit).all()
    else:
        tasks = q.order_by(TaskModel.due_date.asc().nullslast(), TaskModel.task_id.desc()).limit(limit).all()

    # Batch-load category emojis
    cat_ids = {t.category_id for t in tasks if t.category_id}
    emoji_map: dict[int, str] = {}
    if cat_ids:
        cats = db.query(WorkCategory).filter(WorkCategory.category_id.in_(cat_ids)).all()
        emoji_map = {c.category_id: c.emoji for c in cats if c.emoji}

    return [
        TaskItem(
            task_id=t.task_id,
            title=t.title,
            note=t.note,
            status=t.status,
            due_date=t.due_date,
            completed_at=t.completed_at,
            project_id=t.project_id,
            category_id=t.category_id,
            category_emoji=emoji_map.get(t.category_id) if t.category_id else None,
            is_overdue=(
                t.due_date is not None
                and t.due_date < today
                and t.status == "ACTIVE"
            ),
        )
        for t in tasks
    ]


class WorkCategoryItem(BaseModel):
    category_id: int
    title: str
    emoji: str | None


@router.get("/work-categories", response_model=list[WorkCategoryItem])
def list_work_categories(request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request)
    cats = (
        db.query(WorkCategory)
        .filter(WorkCategory.account_id == user_id, WorkCategory.is_archived == False)
        .order_by(WorkCategory.title)
        .all()
    )
    return [WorkCategoryItem(category_id=c.category_id, title=c.title, emoji=c.emoji) for c in cats]


class CreateTaskRequest(BaseModel):
    title: str
    note: str | None = None
    due_kind: str = "NONE"  # NONE | DATE | DATETIME
    due_date: str | None = None
    due_time: str | None = None
    category_id: int | None = None


@router.post("/tasks", status_code=201)
def create_task(body: CreateTaskRequest, request: Request, db: Session = Depends(get_db)):
    from app.application.tasks_usecases import CreateTaskUseCase, TaskValidationError
    user_id = get_user_id(request)
    try:
        task_id = CreateTaskUseCase(db).execute(
            account_id=user_id,
            title=body.title,
            note=body.note,
            due_kind=body.due_kind,
            due_date=body.due_date,
            due_time=body.due_time,
            category_id=body.category_id,
            actor_user_id=user_id,
        )
    except TaskValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"id": task_id}


@router.post("/tasks/{task_id}/complete")
def complete_task(task_id: int, request: Request, db: Session = Depends(get_db)):
    from fastapi import HTTPException
    from app.application.tasks_usecases import CompleteTaskUseCase, TaskValidationError
    user_id = get_user_id(request)
    try:
        CompleteTaskUseCase(db).execute(task_id=task_id, account_id=user_id, actor_user_id=user_id)
    except TaskValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True}


@router.post("/tasks/{task_id}/archive")
def archive_task(task_id: int, request: Request, db: Session = Depends(get_db)):
    from fastapi import HTTPException
    from app.application.tasks_usecases import ArchiveTaskUseCase, TaskValidationError
    user_id = get_user_id(request)
    try:
        ArchiveTaskUseCase(db).execute(task_id=task_id, account_id=user_id, actor_user_id=user_id)
    except TaskValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True}


@router.get("/tasks/{task_id}", response_model=TaskItem)
def get_task(task_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request)
    today = date.today()
    task = db.query(TaskModel).filter(
        TaskModel.task_id == task_id,
        TaskModel.account_id == user_id,
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    emoji = None
    if task.category_id:
        cat = db.query(WorkCategory).filter(WorkCategory.category_id == task.category_id).first()
        emoji = cat.emoji if cat else None
    return TaskItem(
        task_id=task.task_id,
        title=task.title,
        note=task.note,
        status=task.status,
        due_date=task.due_date,
        completed_at=task.completed_at,
        project_id=task.project_id,
        category_id=task.category_id,
        category_emoji=emoji,
        is_overdue=(task.due_date is not None and task.due_date < today and task.status == "ACTIVE"),
    )


class UpdateTaskRequest(BaseModel):
    title: str | None = None
    note: str | None = None
    due_date: str | None = None
    category_id: int | None = None


@router.patch("/tasks/{task_id}")
def update_task(task_id: int, body: UpdateTaskRequest, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request)
    task = db.query(TaskModel).filter(
        TaskModel.task_id == task_id,
        TaskModel.account_id == user_id,
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    fields = body.model_fields_set
    if "title" in fields:
        if not body.title or not body.title.strip():
            raise HTTPException(status_code=400, detail="Название не может быть пустым")
        task.title = body.title.strip()
    if "note" in fields:
        task.note = body.note or None
    if "due_date" in fields:
        if body.due_date:
            task.due_date = date.fromisoformat(body.due_date)
            task.due_kind = "DATE"
        else:
            task.due_date = None
            task.due_kind = "NONE"
    if "category_id" in fields:
        task.category_id = body.category_id
    db.commit()
    return {"ok": True}


@router.delete("/tasks/{task_id}")
def delete_task(task_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request)
    task = db.query(TaskModel).filter(
        TaskModel.task_id == task_id,
        TaskModel.account_id == user_id,
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    db.delete(task)
    db.commit()
    return {"ok": True}


@router.post("/tasks/{task_id}/duplicate")
def duplicate_task(task_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request)
    task = db.query(TaskModel).filter(
        TaskModel.task_id == task_id,
        TaskModel.account_id == user_id,
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    new_task = TaskModel(
        account_id=user_id,
        title=f"{task.title} (копия)",
        note=task.note,
        due_kind=task.due_kind,
        due_date=task.due_date,
        due_time=task.due_time,
        category_id=task.category_id,
        project_id=task.project_id,
        status="ACTIVE",
    )
    db.add(new_task)
    db.commit()
    return {"id": new_task.task_id}


class BoardStatusRequest(BaseModel):
    board_status: str


@router.post("/tasks/{task_id}/board-status")
def update_board_status(
    task_id: int,
    body: BoardStatusRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    from fastapi import HTTPException
    from app.application.projects import ChangeTaskBoardStatusUseCase, ProjectValidationError
    user_id = get_user_id(request)
    try:
        ChangeTaskBoardStatusUseCase(db).execute(task_id, user_id, body.board_status)
    except ProjectValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True}
