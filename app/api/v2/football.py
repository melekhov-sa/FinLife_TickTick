"""GET /api/v2/football/matches — Zenit St. Petersburg fixture list."""
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.infrastructure.db.session import get_db
from app.api.v2.deps import get_user_id

router = APIRouter()

FINISHED_STATUSES = {"FT", "AET", "PEN", "AWD", "WO"}


class FootballMatchOut(BaseModel):
    id: int
    external_id: int
    match_date: date
    match_time: Optional[str]
    home_team: str
    away_team: str
    competition: str
    venue: Optional[str]
    status: str
    score_home: Optional[int]
    score_away: Optional[int]

    class Config:
        from_attributes = True


@router.get("/football/matches", response_model=list[FootballMatchOut])
def list_matches(
    request: Request,
    upcoming: bool = True,
    db: Session = Depends(get_db),
):
    """Return upcoming matches (default) or recent finished ones."""
    get_user_id(request, db)  # auth check
    from app.infrastructure.db.models import FootballMatchModel

    today = date.today()
    q = db.query(FootballMatchModel)

    if upcoming:
        # Upcoming + today, exclude finished
        q = q.filter(FootballMatchModel.match_date >= today).order_by(
            FootballMatchModel.match_date.asc()
        )
    else:
        # Last 30 days finished
        q = q.filter(
            FootballMatchModel.match_date >= today - timedelta(days=30),
            FootballMatchModel.match_date < today,
        ).order_by(FootballMatchModel.match_date.desc()).limit(10)

    return q.all()
