from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ReadingIngest(BaseModel):
    equipment_id: int = Field(..., ge=1)
    metric_key: str = Field(..., max_length=128)
    value: float
    recorded_at: datetime | None = None


class ReadingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    equipment_id: int
    metric_key: str
    value: float
    recorded_at: datetime


class EquipmentMetricsSummary(BaseModel):
    equipment_id: int
    metrics: dict[str, float]
    last_recorded_at: datetime | None
