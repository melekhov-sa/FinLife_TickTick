"""GET /api/v2/strategy — current month strategy scores."""
from datetime import date

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.v2.deps import get_user_id
from app.application.strategy import StrategyService
from app.application.strategy_targets import StrategyTargetService
from app.infrastructure.db.session import get_db

router = APIRouter()


class ScoreItem(BaseModel):
    key: str
    label: str
    score: float
    raw_value: float | None
    raw_label: str | None


class HistoryPoint(BaseModel):
    year: int
    month: int
    life_score: float
    finance_score: float
    discipline_score: float
    project_score: float
    focus_score: float


class TargetProgress(BaseModel):
    id: int
    title: str
    metric_type: str
    target_value: float
    current_value: float | None
    progress_pct: float | None
    is_active: bool


class StrategyResponse(BaseModel):
    year: int
    month: int
    life_score: float
    scores: list[ScoreItem]
    history: list[HistoryPoint]
    targets: list[TargetProgress]


@router.get("/strategy", response_model=StrategyResponse)
def get_strategy(
    user_id: int = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    today = date.today()
    svc = StrategyService(db)
    data = svc.compute(user_id, today.year, today.month)
    history_raw = svc.get_history(user_id, today.year, today.month)

    scores = [
        ScoreItem(
            key="finance",
            label="Финансы",
            score=data["finance_score"],
            raw_value=data.get("debt_ratio"),
            raw_label=f"долг {data['debt_ratio']}%" if data.get("debt_ratio") is not None else None,
        ),
        ScoreItem(
            key="discipline",
            label="Дисциплина",
            score=data["discipline_score"],
            raw_value=data.get("global_discipline_percent"),
            raw_label=f"в срок {data['global_discipline_percent']}%" if data.get("global_discipline_percent") is not None else None,
        ),
        ScoreItem(
            key="project",
            label="Проекты",
            score=data["project_score"],
            raw_value=data.get("active_projects_count"),
            raw_label=f"{data['active_projects_count']} активных" if data.get("active_projects_count") is not None else None,
        ),
        ScoreItem(
            key="focus",
            label="Фокус",
            score=data["focus_score"],
            raw_value=data.get("in_progress_total"),
            raw_label=f"{data['in_progress_total']} в работе" if data.get("in_progress_total") is not None else None,
        ),
    ]

    history = [
        HistoryPoint(
            year=h["year"],
            month=h["month"],
            life_score=h["life_score"],
            finance_score=h["finance_score"],
            discipline_score=h["discipline_score"],
            project_score=h["project_score"],
            focus_score=h["focus_score"],
        )
        for h in history_raw
    ]

    tgt_svc = StrategyTargetService(db)
    targets_raw = tgt_svc.compute_targets_progress(user_id, data)
    targets = [
        TargetProgress(
            id=t["id"],
            title=t["title"],
            metric_type=t["metric_type"],
            target_value=float(t["target"]),
            current_value=float(t["current"]) if t.get("current") is not None else None,
            progress_pct=float(t["progress_pct"]) if t.get("progress_pct") is not None else None,
            is_active=True,
        )
        for t in targets_raw
    ]

    return StrategyResponse(
        year=today.year,
        month=today.month,
        life_score=data["life_score"],
        scores=scores,
        history=history,
        targets=targets,
    )
