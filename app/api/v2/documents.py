"""GET/POST/PATCH/DELETE /api/v2/documents — personal document expiry tracking."""
from datetime import date, datetime
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.infrastructure.db.session import get_db
from app.api.v2.deps import get_user_id
from app.config import get_settings

router = APIRouter()


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class DocumentOut(BaseModel):
    id: int
    title: str
    doc_type: Optional[str]
    issued_date: Optional[date]
    expiry_date: date
    notify_days_before: Optional[int]
    note: Optional[str]
    is_archived: bool
    days_until_expiry: int
    is_expired: bool

    class Config:
        from_attributes = True


class DocumentCreate(BaseModel):
    title: str
    doc_type: Optional[str] = None
    issued_date: Optional[date] = None
    expiry_date: date
    notify_days_before: Optional[int] = 30
    note: Optional[str] = None


class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    doc_type: Optional[str] = None
    issued_date: Optional[date] = None
    expiry_date: Optional[date] = None
    notify_days_before: Optional[int] = None
    note: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _enrich(doc, today: date) -> DocumentOut:
    days = (doc.expiry_date - today).days
    return DocumentOut(
        id=doc.id,
        title=doc.title,
        doc_type=doc.doc_type,
        issued_date=doc.issued_date,
        expiry_date=doc.expiry_date,
        notify_days_before=doc.notify_days_before,
        note=doc.note,
        is_archived=doc.is_archived,
        days_until_expiry=days,
        is_expired=days < 0,
    )


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/documents", response_model=list[DocumentOut])
def list_documents(request: Request, include_archived: bool = False, db: Session = Depends(get_db)):
    from app.infrastructure.db.models import DocumentModel
    user_id = get_user_id(request, db)
    today = datetime.now(ZoneInfo(get_settings().TIMEZONE)).date()

    q = db.query(DocumentModel).filter(DocumentModel.account_id == user_id)
    if not include_archived:
        q = q.filter(DocumentModel.is_archived == False)  # noqa: E712
    docs = q.order_by(DocumentModel.expiry_date.asc()).all()
    return [_enrich(d, today) for d in docs]


@router.post("/documents", response_model=DocumentOut, status_code=201)
def create_document(body: DocumentCreate, request: Request, db: Session = Depends(get_db)):
    from app.infrastructure.db.models import DocumentModel
    user_id = get_user_id(request, db)
    today = datetime.now(ZoneInfo(get_settings().TIMEZONE)).date()

    doc = DocumentModel(
        account_id=user_id,
        title=body.title,
        doc_type=body.doc_type,
        issued_date=body.issued_date,
        expiry_date=body.expiry_date,
        notify_days_before=body.notify_days_before,
        note=body.note,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return _enrich(doc, today)


@router.patch("/documents/{doc_id}", response_model=DocumentOut)
def update_document(doc_id: int, body: DocumentUpdate, request: Request, db: Session = Depends(get_db)):
    from app.infrastructure.db.models import DocumentModel
    user_id = get_user_id(request, db)
    today = datetime.now(ZoneInfo(get_settings().TIMEZONE)).date()

    doc = db.query(DocumentModel).filter(
        DocumentModel.id == doc_id, DocumentModel.account_id == user_id
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(doc, field, value)
    db.commit()
    db.refresh(doc)
    return _enrich(doc, today)


@router.delete("/documents/{doc_id}", status_code=204)
def archive_document(doc_id: int, request: Request, db: Session = Depends(get_db)):
    from app.infrastructure.db.models import DocumentModel
    user_id = get_user_id(request, db)

    doc = db.query(DocumentModel).filter(
        DocumentModel.id == doc_id, DocumentModel.account_id == user_id
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    doc.is_archived = True
    db.commit()


@router.post("/documents/{doc_id}/restore", response_model=DocumentOut)
def restore_document(doc_id: int, request: Request, db: Session = Depends(get_db)):
    from app.infrastructure.db.models import DocumentModel
    user_id = get_user_id(request, db)
    today = datetime.now(ZoneInfo(get_settings().TIMEZONE)).date()

    doc = db.query(DocumentModel).filter(
        DocumentModel.id == doc_id, DocumentModel.account_id == user_id
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    doc.is_archived = False
    db.commit()
    db.refresh(doc)
    return _enrich(doc, today)
