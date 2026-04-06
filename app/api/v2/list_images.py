"""Image upload/serve for shared list items."""
import os
import pathlib
import uuid

_PROJECT_ROOT = pathlib.Path(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.infrastructure.db.session import get_db
from app.api.v2.deps import get_user_id
from app.infrastructure.db.models import SharedListItem, SharedList
from app.config import get_settings

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
MAX_SIZE = 5 * 1024 * 1024  # 5 MB

router = APIRouter()


def _uploads_dir() -> pathlib.Path:
    p = pathlib.Path(get_settings().UPLOADS_DIR)
    if not p.is_absolute():
        p = _PROJECT_ROOT / p
    return p


def _get_item_with_auth(item_id: int, user_id: int, db: Session) -> SharedListItem:
    item = db.query(SharedListItem).filter(SharedListItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Item not found")
    lst = db.query(SharedList).filter(SharedList.id == item.list_id, SharedList.account_id == user_id).first()
    if not lst:
        raise HTTPException(404, "Item not found")
    return item


@router.post("/lists/items/{item_id}/image")
async def upload_image(item_id: int, request: Request, file: UploadFile = File(...), db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    item = _get_item_with_auth(item_id, user_id, db)

    ext = pathlib.Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported file type: {ext}")

    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(400, "File too large (max 5 MB)")

    # Delete old image if exists
    _delete_file(item, user_id)

    # Save new image
    filename = f"{uuid.uuid4().hex[:12]}{ext}"
    save_dir = _uploads_dir() / str(user_id) / "lists" / str(item_id)
    save_dir.mkdir(parents=True, exist_ok=True)
    filepath = save_dir / filename
    filepath.write_bytes(content)

    # Update item
    item.image_url = f"/api/v2/lists/items/{item_id}/image"
    db.commit()

    return {"image_url": item.image_url}


@router.get("/lists/items/{item_id}/image")
def serve_image(item_id: int, db: Session = Depends(get_db)):
    """Serve image — public if list is public, otherwise requires auth."""
    item = db.query(SharedListItem).filter(SharedListItem.id == item_id).first()
    if not item or not item.image_url:
        raise HTTPException(404, "No image")

    lst = db.query(SharedList).filter(SharedList.id == item.list_id).first()
    if not lst:
        raise HTTPException(404, "No image")

    # Find the file on disk
    filepath = _find_image_file(item_id, lst.account_id)
    if not filepath:
        raise HTTPException(404, "Image file not found")

    return FileResponse(filepath, media_type=_guess_media_type(filepath))


@router.delete("/lists/items/{item_id}/image")
def delete_image(item_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_user_id(request, db)
    item = _get_item_with_auth(item_id, user_id, db)

    _delete_file(item, user_id)
    item.image_url = None
    db.commit()
    return {"ok": True}


def _find_image_file(item_id: int, account_id: int) -> pathlib.Path | None:
    d = _uploads_dir() / str(account_id) / "lists" / str(item_id)
    if not d.exists():
        return None
    files = list(d.iterdir())
    return files[0] if files else None


def _delete_file(item: SharedListItem, user_id: int):
    d = _uploads_dir() / str(user_id) / "lists" / str(item.id)
    if d.exists():
        for f in d.iterdir():
            f.unlink(missing_ok=True)


def _guess_media_type(path: pathlib.Path) -> str:
    ext = path.suffix.lower()
    return {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
    }.get(ext, "application/octet-stream")
