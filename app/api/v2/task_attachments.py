"""
Task file attachments API.

GET    /api/v2/tasks/{task_id}/attachments              — list attachments
POST   /api/v2/tasks/{task_id}/attachments              — upload file
DELETE /api/v2/tasks/{task_id}/attachments/{att_id}     — delete attachment
"""
import pathlib
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.infrastructure.db.session import get_db
from app.api.v2.deps import get_user_id
from app.infrastructure.db.models import TaskModel, TaskAttachmentModel
from app.config import get_settings

router = APIRouter()

# ── Validation constants ─────────────────────────────────────────────────────

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_FILES_PER_TASK = 10

ALLOWED_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".xls", ".xlsx",
    ".txt", ".csv",
    ".jpg", ".jpeg", ".png", ".gif", ".webp",
    ".zip",
}

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain", "text/csv",
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "application/zip", "application/x-zip-compressed",
}

EXTENSIONS_LABEL = ", ".join(sorted(ALLOWED_EXTENSIONS))


# ── Response schema ──────────────────────────────────────────────────────────

class AttachmentItem(BaseModel):
    id: int
    original_filename: str
    file_size: int
    mime_type: str
    url: str
    uploaded_at: str


def _attachment_url(att: TaskAttachmentModel) -> str:
    return f"/uploads/{att.stored_filename}"


def _to_item(att: TaskAttachmentModel) -> AttachmentItem:
    return AttachmentItem(
        id=att.id,
        original_filename=att.original_filename,
        file_size=att.file_size,
        mime_type=att.mime_type,
        url=_attachment_url(att),
        uploaded_at=att.uploaded_at.isoformat(),
    )


def _get_task(db: Session, task_id: int, user_id: int) -> TaskModel:
    task = db.query(TaskModel).filter(
        TaskModel.task_id == task_id,
        TaskModel.account_id == user_id,
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    return task


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/tasks/{task_id}/attachments", response_model=list[AttachmentItem])
def list_attachments(task_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    _get_task(db, task_id, user_id)
    rows = (
        db.query(TaskAttachmentModel)
        .filter(TaskAttachmentModel.task_id == task_id, TaskAttachmentModel.account_id == user_id)
        .order_by(TaskAttachmentModel.uploaded_at.desc())
        .all()
    )
    return [_to_item(r) for r in rows]


@router.post("/tasks/{task_id}/attachments", response_model=AttachmentItem, status_code=201)
async def upload_attachment(
    task_id: int,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(request, db)
    _get_task(db, task_id, user_id)

    # Check file count limit
    count = (
        db.query(TaskAttachmentModel)
        .filter(TaskAttachmentModel.task_id == task_id, TaskAttachmentModel.account_id == user_id)
        .count()
    )
    if count >= MAX_FILES_PER_TASK:
        raise HTTPException(status_code=400, detail=f"Максимум {MAX_FILES_PER_TASK} файлов на задачу")

    # Validate filename & extension
    if not file.filename:
        raise HTTPException(status_code=400, detail="Имя файла отсутствует")
    safe_name = pathlib.PurePosixPath(file.filename).name  # strip path
    ext = pathlib.Path(safe_name).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Недопустимый тип файла ({ext}). Разрешены: {EXTENSIONS_LABEL}",
        )

    # Validate MIME type
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Недопустимый MIME-тип: {content_type}",
        )

    # Read file content and check size
    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"Файл слишком большой. Максимум {MAX_FILE_SIZE // (1024 * 1024)} МБ",
        )

    # Save to disk
    settings = get_settings()
    rel_dir = pathlib.Path(str(user_id)) / "tasks" / str(task_id)
    abs_dir = pathlib.Path(settings.UPLOADS_DIR) / rel_dir
    abs_dir.mkdir(parents=True, exist_ok=True)

    stored_name = f"{uuid.uuid4().hex}_{safe_name}"
    abs_path = abs_dir / stored_name
    abs_path.write_bytes(data)

    # Save to DB
    att = TaskAttachmentModel(
        task_id=task_id,
        account_id=user_id,
        original_filename=safe_name,
        stored_filename=str(rel_dir / stored_name),
        mime_type=content_type,
        file_size=len(data),
    )
    db.add(att)
    db.commit()
    db.refresh(att)

    return _to_item(att)


@router.delete("/tasks/{task_id}/attachments/{attachment_id}")
def delete_attachment(
    task_id: int,
    attachment_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = get_user_id(request, db)
    att = (
        db.query(TaskAttachmentModel)
        .filter(
            TaskAttachmentModel.id == attachment_id,
            TaskAttachmentModel.task_id == task_id,
            TaskAttachmentModel.account_id == user_id,
        )
        .first()
    )
    if not att:
        raise HTTPException(status_code=404, detail="Вложение не найдено")

    # Delete file from disk
    settings = get_settings()
    file_path = pathlib.Path(settings.UPLOADS_DIR) / att.stored_filename
    file_path.unlink(missing_ok=True)

    db.delete(att)
    db.commit()
    return {"ok": True}
