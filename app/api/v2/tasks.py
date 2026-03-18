"""
GET  /api/v2/tasks                       — list tasks (with filters + category emoji)
GET  /api/v2/work-categories             — list work categories (for task modal)
POST /api/v2/tasks                       — create a task (once or recurring)
POST /api/v2/tasks/{id}/complete         — complete a task
POST /api/v2/tasks/{id}/archive          — archive a task
POST /api/v2/tasks/{id}/board-status     — move task to kanban column
GET  /api/v2/task-presets                — list user task presets
GET  /api/v2/reminder-presets            — list user reminder time presets
"""
from datetime import date, datetime

from fastapi import APIRouter, Depends, Request, Query, HTTPException
from pydantic import BaseModel, field_serializer
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.infrastructure.db.session import get_db
from app.api.v2.deps import get_user_id
from app.infrastructure.db.models import TaskModel, WorkCategory, TaskTemplateModel, TaskOccurrence

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
    is_recurring: bool = False
    occurrence_id: int | None = None

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

    # Batch-load category emojis for regular tasks
    cat_ids = {t.category_id for t in tasks if t.category_id}
    emoji_map: dict[int, str] = {}
    if cat_ids:
        cats = db.query(WorkCategory).filter(WorkCategory.category_id.in_(cat_ids)).all()
        emoji_map = {c.category_id: c.emoji for c in cats if c.emoji}

    regular_items = [
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

    # --- Recurring task occurrences (project_id filter skips them) ---
    if project_id is not None or status == "ARCHIVED":
        return regular_items

    if status == "ACTIVE":
        occ_q = (
            db.query(TaskOccurrence, TaskTemplateModel)
            .join(TaskTemplateModel, TaskOccurrence.template_id == TaskTemplateModel.template_id)
            .filter(
                TaskOccurrence.account_id == user_id,
                TaskOccurrence.status == "ACTIVE",
                TaskOccurrence.scheduled_date <= today,
                TaskTemplateModel.is_archived == False,  # noqa: E712
            )
            .order_by(TaskOccurrence.scheduled_date.asc())
            .limit(limit)
        )
    else:  # DONE
        occ_q = (
            db.query(TaskOccurrence, TaskTemplateModel)
            .join(TaskTemplateModel, TaskOccurrence.template_id == TaskTemplateModel.template_id)
            .filter(
                TaskOccurrence.account_id == user_id,
                TaskOccurrence.status == "DONE",
                TaskTemplateModel.is_archived == False,  # noqa: E712
            )
            .order_by(TaskOccurrence.completed_at.desc())
            .limit(limit)
        )

    occ_rows = occ_q.all()

    # Batch-load category emojis for templates
    tmpl_cat_ids = {tmpl.category_id for _, tmpl in occ_rows if tmpl.category_id}
    tmpl_emoji_map: dict[int, str] = {}
    if tmpl_cat_ids:
        tmpl_cats = db.query(WorkCategory).filter(WorkCategory.category_id.in_(tmpl_cat_ids)).all()
        tmpl_emoji_map = {c.category_id: c.emoji for c in tmpl_cats if c.emoji}

    occ_items = [
        TaskItem(
            task_id=occ.id,          # use occurrence id as task_id
            title=tmpl.title,
            note=tmpl.note,
            status=occ.status,
            due_date=occ.scheduled_date,
            completed_at=occ.completed_at,
            project_id=None,
            category_id=tmpl.category_id,
            category_emoji=tmpl_emoji_map.get(tmpl.category_id) if tmpl.category_id else None,
            is_overdue=(occ.scheduled_date < today and occ.status == "ACTIVE"),
            is_recurring=True,
            occurrence_id=occ.id,
        )
        for occ, tmpl in occ_rows
    ]

    # Merge: sort by due_date asc (None last) for ACTIVE, by completed_at desc for DONE
    all_items = regular_items + occ_items
    if status == "DONE":
        all_items.sort(key=lambda x: x.completed_at or datetime.min, reverse=True)
    else:
        all_items.sort(key=lambda x: (x.due_date is None, x.due_date or date.max))

    return all_items


class WorkCategoryItem(BaseModel):
    category_id: int
    title: str
    emoji: str | None


class WorkCategoryFullItem(BaseModel):
    category_id: int
    title: str
    emoji: str | None
    is_archived: bool


@router.get("/work-categories")
def list_work_categories(request: Request, db: Session = Depends(get_db), include_archived: bool = Query(False)):
    user_id = get_user_id(request)
    q = db.query(WorkCategory).filter(WorkCategory.account_id == user_id)
    if not include_archived:
        q = q.filter(WorkCategory.is_archived == False)  # noqa: E712
    cats = q.order_by(WorkCategory.title).all()
    return [
        WorkCategoryFullItem(
            category_id=c.category_id, title=c.title, emoji=c.emoji, is_archived=c.is_archived
        )
        for c in cats
    ]


class CreateWorkCategoryRequest(BaseModel):
    title: str
    emoji: str | None = None


@router.post("/work-categories", status_code=201)
def create_work_category(
    body: CreateWorkCategoryRequest, request: Request, db: Session = Depends(get_db)
):
    user_id = get_user_id(request)
    if not body.title.strip():
        raise HTTPException(status_code=400, detail="Название не может быть пустым")
    cat = WorkCategory(account_id=user_id, title=body.title.strip(), emoji=body.emoji)
    db.add(cat)
    db.commit()
    return {"category_id": cat.category_id, "title": cat.title, "emoji": cat.emoji}


class UpdateWorkCategoryRequest(BaseModel):
    title: str | None = None
    emoji: str | None = None


@router.patch("/work-categories/{category_id}")
def update_work_category(
    category_id: int,
    body: UpdateWorkCategoryRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = get_user_id(request)
    cat = db.query(WorkCategory).filter(
        WorkCategory.category_id == category_id,
        WorkCategory.account_id == user_id,
    ).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Категория не найдена")
    fields = body.model_fields_set
    if "title" in fields:
        if not body.title or not body.title.strip():
            raise HTTPException(status_code=400, detail="Название не может быть пустым")
        cat.title = body.title.strip()
    if "emoji" in fields:
        cat.emoji = body.emoji or None
    db.commit()
    return {"ok": True}


@router.post("/work-categories/{category_id}/archive")
def archive_work_category(category_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request)
    cat = db.query(WorkCategory).filter(
        WorkCategory.category_id == category_id,
        WorkCategory.account_id == user_id,
    ).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Категория не найдена")
    cat.is_archived = True
    db.commit()
    return {"ok": True}


@router.post("/work-categories/{category_id}/restore")
def restore_work_category(category_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request)
    cat = db.query(WorkCategory).filter(
        WorkCategory.category_id == category_id,
        WorkCategory.account_id == user_id,
    ).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Категория не найдена")
    cat.is_archived = False
    db.commit()
    return {"ok": True}


class CreateTaskRequest(BaseModel):
    # Mode
    mode: str = "once"  # "once" or "recurring"

    # Common
    title: str
    note: str | None = None
    category_id: int | None = None

    # One-time fields
    due_kind: str = "NONE"  # NONE | DATE | DATETIME | WINDOW
    due_date: str | None = None
    due_time: str | None = None
    due_start_time: str | None = None  # for WINDOW mode
    due_end_time: str | None = None    # for WINDOW mode
    reminders: list[dict] | None = None  # [{offset_minutes: -15}, ...]
    multi_dates: str | None = None  # comma-separated ISO dates
    requires_expense: bool = False
    suggested_expense_category_id: int | None = None
    suggested_amount: str | None = None

    # Recurring fields
    freq: str | None = None  # DAILY, WEEKLY, MONTHLY, YEARLY
    interval: int = 1
    start_date: str | None = None
    active_until: str | None = None
    by_weekday: str | None = None  # "MO,TU,FR" or "0,1,4"
    by_monthday: int | None = None  # 1-31


@router.post("/tasks", status_code=201)
def create_task(body: CreateTaskRequest, request: Request, db: Session = Depends(get_db)):
    from app.application.tasks_usecases import CreateTaskUseCase, TaskValidationError
    user_id = get_user_id(request)

    if body.mode == "recurring":
        from app.application.task_templates import CreateTaskTemplateUseCase, TaskTemplateValidationError
        try:
            template_id = CreateTaskTemplateUseCase(db).execute(
                account_id=user_id,
                title=body.title,
                freq=body.freq or "DAILY",
                interval=body.interval,
                start_date=body.start_date or date.today().isoformat(),
                note=body.note,
                active_until=body.active_until,
                category_id=body.category_id,
                by_weekday=body.by_weekday,
                by_monthday=body.by_monthday,
                actor_user_id=user_id,
            )
        except TaskTemplateValidationError as e:
            raise HTTPException(status_code=400, detail=str(e))
        return {"id": template_id}

    # mode == "once"
    # Handle multi-dates
    if body.multi_dates:
        dates = [d.strip() for d in body.multi_dates.split(",") if d.strip()]
        ids = []
        for d in dates:
            try:
                task_id = CreateTaskUseCase(db).execute(
                    account_id=user_id,
                    title=body.title,
                    note=body.note,
                    due_kind="DATE",
                    due_date=d,
                    category_id=body.category_id,
                    actor_user_id=user_id,
                )
                ids.append(task_id)
            except TaskValidationError as e:
                raise HTTPException(status_code=400, detail=str(e))
        return {"ids": ids}

    # Single task
    try:
        task_id = CreateTaskUseCase(db).execute(
            account_id=user_id,
            title=body.title,
            note=body.note,
            due_kind=body.due_kind,
            due_date=body.due_date,
            due_time=body.due_time,
            due_start_time=body.due_start_time,
            due_end_time=body.due_end_time,
            category_id=body.category_id,
            actor_user_id=user_id,
            reminders=body.reminders,
            requires_expense=body.requires_expense,
            suggested_expense_category_id=body.suggested_expense_category_id,
            suggested_amount=body.suggested_amount,
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


# --- Task Presets ---

class TaskPresetItem(BaseModel):
    id: int
    name: str
    title_template: str
    description_template: str | None
    default_task_category_id: int | None
    is_active: bool = True
    sort_order: int = 0


@router.get("/task-presets")
def list_task_presets(request: Request, db: Session = Depends(get_db), include_inactive: bool = Query(False)):
    from app.infrastructure.db.models import TaskPresetModel
    user_id = get_user_id(request)
    q = db.query(TaskPresetModel).filter(TaskPresetModel.account_id == user_id)
    if not include_inactive:
        q = q.filter(TaskPresetModel.is_active == True)  # noqa: E712
    presets = q.order_by(TaskPresetModel.sort_order, TaskPresetModel.id).all()
    return [TaskPresetItem(
        id=p.id, name=p.name, title_template=p.title_template,
        description_template=p.description_template,
        default_task_category_id=p.default_task_category_id,
        is_active=p.is_active, sort_order=p.sort_order,
    ) for p in presets]


class CreateTaskPresetRequest(BaseModel):
    name: str
    title_template: str
    description_template: str | None = None
    default_task_category_id: int | None = None


@router.post("/task-presets", status_code=201)
def create_task_preset(body: CreateTaskPresetRequest, request: Request, db: Session = Depends(get_db)):
    from app.infrastructure.db.models import TaskPresetModel
    user_id = get_user_id(request)
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Название шаблона не может быть пустым")
    if not body.title_template.strip():
        raise HTTPException(status_code=400, detail="Заголовок задачи не может быть пустым")
    max_order = db.query(func.coalesce(func.max(TaskPresetModel.sort_order), 0)).filter(
        TaskPresetModel.account_id == user_id
    ).scalar()
    preset = TaskPresetModel(
        account_id=user_id,
        name=body.name.strip(),
        title_template=body.title_template.strip(),
        description_template=body.description_template,
        default_task_category_id=body.default_task_category_id,
        sort_order=max_order + 1,
    )
    db.add(preset)
    db.commit()
    return {"id": preset.id}


class UpdateTaskPresetRequest(BaseModel):
    name: str | None = None
    title_template: str | None = None
    description_template: str | None = None
    default_task_category_id: int | None = None
    is_active: bool | None = None


@router.patch("/task-presets/{preset_id}")
def update_task_preset(preset_id: int, body: UpdateTaskPresetRequest, request: Request, db: Session = Depends(get_db)):
    from app.infrastructure.db.models import TaskPresetModel
    user_id = get_user_id(request)
    preset = db.query(TaskPresetModel).filter(TaskPresetModel.id == preset_id, TaskPresetModel.account_id == user_id).first()
    if not preset:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    fields = body.model_fields_set
    if "name" in fields:
        preset.name = body.name.strip() if body.name else preset.name
    if "title_template" in fields:
        preset.title_template = body.title_template.strip() if body.title_template else preset.title_template
    if "description_template" in fields:
        preset.description_template = body.description_template
    if "default_task_category_id" in fields:
        preset.default_task_category_id = body.default_task_category_id
    if "is_active" in fields:
        preset.is_active = body.is_active
    db.commit()
    return {"ok": True}


class MovePresetRequest(BaseModel):
    direction: str  # "up" or "down"


@router.post("/task-presets/{preset_id}/move")
def move_task_preset(preset_id: int, body: MovePresetRequest, request: Request, db: Session = Depends(get_db)):
    from app.infrastructure.db.models import TaskPresetModel
    user_id = get_user_id(request)
    preset = db.query(TaskPresetModel).filter(TaskPresetModel.id == preset_id, TaskPresetModel.account_id == user_id).first()
    if not preset:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    if body.direction == "up":
        neighbor = db.query(TaskPresetModel).filter(
            TaskPresetModel.account_id == user_id,
            TaskPresetModel.sort_order < preset.sort_order
        ).order_by(TaskPresetModel.sort_order.desc()).first()
    else:
        neighbor = db.query(TaskPresetModel).filter(
            TaskPresetModel.account_id == user_id,
            TaskPresetModel.sort_order > preset.sort_order
        ).order_by(TaskPresetModel.sort_order.asc()).first()
    if neighbor:
        preset.sort_order, neighbor.sort_order = neighbor.sort_order, preset.sort_order
        db.commit()
    return {"ok": True}


# --- Reminder Presets ---

class ReminderPresetItem(BaseModel):
    id: int
    label: str
    offset_minutes: int


@router.get("/reminder-presets", response_model=list[ReminderPresetItem])
def list_reminder_presets(request: Request, db: Session = Depends(get_db)):
    from app.infrastructure.db.models import UserReminderTimePreset
    user_id = get_user_id(request)
    presets = (
        db.query(UserReminderTimePreset)
        .filter(UserReminderTimePreset.account_id == user_id)
        .order_by(UserReminderTimePreset.sort_order)
        .all()
    )
    return [ReminderPresetItem(id=p.id, label=p.label, offset_minutes=p.offset_minutes) for p in presets]


# --- Task Templates (recurring) ---

class TaskTemplateItem(BaseModel):
    template_id: int
    title: str
    note: str | None
    category_id: int | None
    category_emoji: str | None
    freq: str
    interval: int
    active_from: date
    active_until: date | None
    is_archived: bool
    next_occurrence: date | None

    @field_serializer("active_from", "active_until", "next_occurrence")
    def _ser_date(self, v):
        return v.isoformat() if v else None


@router.get("/task-templates", response_model=list[TaskTemplateItem])
def list_task_templates(request: Request, db: Session = Depends(get_db), archived: bool = Query(False)):
    from app.infrastructure.db.models import RecurrenceRuleModel
    user_id = get_user_id(request)

    q = db.query(TaskTemplateModel).filter(TaskTemplateModel.account_id == user_id)
    if not archived:
        q = q.filter(TaskTemplateModel.is_archived == False)  # noqa: E712
    else:
        q = q.filter(TaskTemplateModel.is_archived == True)  # noqa: E712

    templates = q.order_by(TaskTemplateModel.template_id.desc()).all()

    rule_ids = [t.rule_id for t in templates]
    rules = db.query(RecurrenceRuleModel).filter(RecurrenceRuleModel.rule_id.in_(rule_ids)).all() if rule_ids else []
    rule_map = {r.rule_id: r for r in rules}

    cat_ids = {t.category_id for t in templates if t.category_id}
    emoji_map: dict[int, str] = {}
    if cat_ids:
        cats = db.query(WorkCategory).filter(WorkCategory.category_id.in_(cat_ids)).all()
        emoji_map = {c.category_id: c.emoji for c in cats if c.emoji}

    today = date.today()
    next_occ_rows = (
        db.query(TaskOccurrence.template_id, func.min(TaskOccurrence.scheduled_date).label("next_date"))
        .filter(
            TaskOccurrence.template_id.in_([t.template_id for t in templates]),
            TaskOccurrence.status == "ACTIVE",
            TaskOccurrence.scheduled_date >= today,
        )
        .group_by(TaskOccurrence.template_id)
        .all()
    ) if templates else []
    next_map = {r.template_id: r.next_date for r in next_occ_rows}

    items = []
    for t in templates:
        rule = rule_map.get(t.rule_id)
        items.append(TaskTemplateItem(
            template_id=t.template_id,
            title=t.title,
            note=t.note,
            category_id=t.category_id,
            category_emoji=emoji_map.get(t.category_id) if t.category_id else None,
            freq=rule.freq if rule else "DAILY",
            interval=rule.interval if rule else 1,
            active_from=t.active_from,
            active_until=t.active_until,
            is_archived=t.is_archived,
            next_occurrence=next_map.get(t.template_id),
        ))
    return items
