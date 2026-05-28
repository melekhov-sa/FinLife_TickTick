"""GET/POST/DELETE /api/v2/body-metrics — body metrics tracker."""
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


class BodyMetricOut(BaseModel):
    id: int
    metric_type: str
    value: float
    value2: Optional[float]
    recorded_at: date
    note: Optional[str]

    class Config:
        from_attributes = True


class BodyMetricCreate(BaseModel):
    metric_type: str
    value: float
    value2: Optional[float] = None
    recorded_at: Optional[date] = None
    note: Optional[str] = None


@router.get("/body-metrics", response_model=list[BodyMetricOut])
def list_metrics(request: Request, metric_type: Optional[str] = None, db: Session = Depends(get_db)):
    from app.infrastructure.db.models import BodyMetricModel
    user_id = get_user_id(request, db)

    q = db.query(BodyMetricModel).filter(BodyMetricModel.account_id == user_id)
    if metric_type:
        q = q.filter(BodyMetricModel.metric_type == metric_type)
    return q.order_by(BodyMetricModel.recorded_at.desc(), BodyMetricModel.id.desc()).all()


@router.post("/body-metrics", response_model=BodyMetricOut, status_code=201)
def create_metric(body: BodyMetricCreate, request: Request, db: Session = Depends(get_db)):
    from app.infrastructure.db.models import BodyMetricModel
    user_id = get_user_id(request, db)
    today = datetime.now(ZoneInfo(get_settings().TIMEZONE)).date()

    metric = BodyMetricModel(
        account_id=user_id,
        metric_type=body.metric_type,
        value=body.value,
        value2=body.value2,
        recorded_at=body.recorded_at or today,
        note=body.note,
    )
    db.add(metric)
    db.commit()
    db.refresh(metric)
    return metric


@router.delete("/body-metrics/{metric_id}", status_code=204)
def delete_metric(metric_id: int, request: Request, db: Session = Depends(get_db)):
    from app.infrastructure.db.models import BodyMetricModel
    user_id = get_user_id(request, db)

    metric = db.query(BodyMetricModel).filter(
        BodyMetricModel.id == metric_id, BodyMetricModel.account_id == user_id
    ).first()
    if not metric:
        raise HTTPException(status_code=404)

    db.delete(metric)
    db.commit()
