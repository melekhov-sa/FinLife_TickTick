"""GET /api/v2/efficiency — efficiency score + 6 metric cards."""
from datetime import date

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.v2.deps import get_user_id
from app.application.efficiency import EfficiencyService, METRIC_LABELS, METRIC_DESCRIPTIONS
from app.infrastructure.db.session import get_db

router = APIRouter()


class MetricCard(BaseModel):
    key: str
    label: str
    description: str
    raw_value: float
    sub_score: float   # 40 / 70 / 100
    weight: float
    higher_is_better: bool


class EfficiencyResponse(BaseModel):
    score: float
    snapshot_date: str
    metrics: list[MetricCard]


@router.get("/efficiency", response_model=EfficiencyResponse)
def get_efficiency(
    user_id: int = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    today = date.today()
    data = EfficiencyService(db).calculate(user_id, today)

    metrics = [
        MetricCard(
            key="ontime",
            label=METRIC_LABELS["ontime"],
            description=METRIC_DESCRIPTIONS["ontime"],
            raw_value=round(data["ontime_rate"], 1),
            sub_score=data["s_ontime"],
            weight=data["w_ontime"],
            higher_is_better=True,
        ),
        MetricCard(
            key="overdue",
            label=METRIC_LABELS["overdue"],
            description=METRIC_DESCRIPTIONS["overdue"],
            raw_value=data["overdue_open"],
            sub_score=data["s_overdue"],
            weight=data["w_overdue"],
            higher_is_better=False,
        ),
        MetricCard(
            key="reschedule",
            label=METRIC_LABELS["reschedule"],
            description=METRIC_DESCRIPTIONS["reschedule"],
            raw_value=data["reschedule_count"],
            sub_score=data["s_reschedule"],
            weight=data["w_reschedule"],
            higher_is_better=False,
        ),
        MetricCard(
            key="churn",
            label=METRIC_LABELS["churn"],
            description=METRIC_DESCRIPTIONS["churn"],
            raw_value=data["churn_count"],
            sub_score=data["s_churn"],
            weight=data["w_churn"],
            higher_is_better=False,
        ),
        MetricCard(
            key="wip",
            label=METRIC_LABELS["wip"],
            description=METRIC_DESCRIPTIONS["wip"],
            raw_value=data["wip_count"],
            sub_score=data["s_wip"],
            weight=data["w_wip"],
            higher_is_better=False,
        ),
        MetricCard(
            key="velocity",
            label=METRIC_LABELS["velocity"],
            description=METRIC_DESCRIPTIONS["velocity"],
            raw_value=data["velocity_7d"],
            sub_score=data["s_velocity"],
            weight=data["w_velocity"],
            higher_is_better=True,
        ),
    ]

    return EfficiencyResponse(
        score=data["efficiency_score"],
        snapshot_date=str(data["snapshot_date"]),
        metrics=metrics,
    )
