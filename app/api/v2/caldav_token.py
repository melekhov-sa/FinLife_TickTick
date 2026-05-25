"""CalDAV token management — get or regenerate the user's CalDAV access token."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.v2.deps import get_user_id
from app.api.caldav.auth import generate_token
from app.infrastructure.db.models import CalDAVTokenModel

router = APIRouter(prefix="/caldav-token", tags=["caldav"])


class TokenResponse(BaseModel):
    token: str
    enabled: bool


@router.get("", response_model=TokenResponse)
def get_or_create_token(
    user_id: int = Depends(get_user_id),
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Return the existing CalDAV token, or generate one on first call."""
    row = db.query(CalDAVTokenModel).filter(CalDAVTokenModel.account_id == user_id).first()
    if not row:
        row = CalDAVTokenModel(account_id=user_id, token=generate_token(), enabled=True)
        db.add(row)
        db.commit()
        db.refresh(row)
    return TokenResponse(token=row.token, enabled=row.enabled)


@router.post("/regenerate", response_model=TokenResponse)
def regenerate_token(
    user_id: int = Depends(get_user_id),
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Invalidate the current token and issue a new one."""
    row = db.query(CalDAVTokenModel).filter(CalDAVTokenModel.account_id == user_id).first()
    if not row:
        row = CalDAVTokenModel(account_id=user_id, token=generate_token(), enabled=True)
        db.add(row)
    else:
        row.token = generate_token()
        row.enabled = True
    db.commit()
    db.refresh(row)
    return TokenResponse(token=row.token, enabled=row.enabled)
