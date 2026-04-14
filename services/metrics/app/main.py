from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.database import Base, SessionLocal, engine, get_db
from app.models import MetricReading
from app.schemas import EquipmentMetricsSummary, ReadingIngest, ReadingRead


def _seed_equipment_series_if_empty(
    db: Session,
    equipment_id: int,
    series: list[tuple[str, float]],
    now: datetime,
) -> None:
    if (
        db.scalars(
            select(MetricReading)
            .where(MetricReading.equipment_id == equipment_id)
            .limit(1)
        ).first()
        is not None
    ):
        return
    rows: list[MetricReading] = []
    for i in range(12):
        ts = now - timedelta(minutes=5 * (11 - i))
        for key, base in series:
            if key == "spindle_rpm":
                noise = (i % 4) * 25.0
            else:
                noise = (i % 4) * 0.15
            rows.append(
                MetricReading(
                    equipment_id=equipment_id,
                    metric_key=key,
                    value=round(base + noise, 3),
                    recorded_at=ts,
                )
            )
    db.add_all(rows)


def seed_demo(db: Session) -> None:
    now = datetime.now(timezone.utc)
    configs: list[tuple[int, list[tuple[str, float]]]] = [
        (
            1,
            [
                ("spindle_rpm", 4200.0),
                ("spindle_power_kw", 5.2),
                ("temperature_c", 28.0),
            ],
        ),
        (
            2,
            [
                ("spindle_rpm", 3800.0),
                ("spindle_power_kw", 4.8),
                ("temperature_c", 27.0),
            ],
        ),
        (
            3,
            [
                ("spindle_rpm", 3100.0),
                ("spindle_power_kw", 3.6),
                ("temperature_c", 26.0),
            ],
        ),
        (4, [("temperature_c", 900.0)]),
        (5, [("temperature_c", 895.0)]),
        (6, [("temperature_c", 902.0)]),
        (
            7,
            [
                ("spindle_rpm", 0.0),
                ("spindle_power_kw", 0.0),
                ("temperature_c", 24.0),
            ],
        ),
    ]
    for eq_id, series in configs:
        _seed_equipment_series_if_empty(db, eq_id, series, now)
    db.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_demo(db)
    finally:
        db.close()
    yield


app = FastAPI(title="MDC Metrics Service", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "service": "metrics"}


@app.post("/api/v1/metrics/readings", response_model=ReadingRead, status_code=201)
def ingest_reading(body: ReadingIngest, db: Session = Depends(get_db)):
    kwargs = {
        "equipment_id": body.equipment_id,
        "metric_key": body.metric_key,
        "value": body.value,
    }
    if body.recorded_at is not None:
        kwargs["recorded_at"] = body.recorded_at
    row = MetricReading(**kwargs)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@app.get("/api/v1/metrics/equipment/{equipment_id}/readings", response_model=list[ReadingRead])
def list_readings(
    equipment_id: int,
    db: Session = Depends(get_db),
    metric_key: str | None = None,
    limit: int = Query(100, ge=1, le=2000),
):
    q = select(MetricReading).where(MetricReading.equipment_id == equipment_id)
    if metric_key:
        q = q.where(MetricReading.metric_key == metric_key)
    q = q.order_by(desc(MetricReading.recorded_at)).limit(limit)
    return list(db.scalars(q).all())


@app.get("/api/v1/metrics/equipment/{equipment_id}/latest", response_model=EquipmentMetricsSummary)
def latest_per_metric(equipment_id: int, db: Session = Depends(get_db)):
    sub = (
        select(
            MetricReading.metric_key,
            func.max(MetricReading.recorded_at).label("max_ts"),
        )
        .where(MetricReading.equipment_id == equipment_id)
        .group_by(MetricReading.metric_key)
        .subquery()
    )
    q = (
        select(MetricReading)
        .join(
            sub,
            (MetricReading.metric_key == sub.c.metric_key)
            & (MetricReading.recorded_at == sub.c.max_ts)
            & (MetricReading.equipment_id == equipment_id),
        )
    )
    rows = list(db.scalars(q).all())
    metrics = {r.metric_key: r.value for r in rows}
    last_ts = max((r.recorded_at for r in rows), default=None)
    return EquipmentMetricsSummary(
        equipment_id=equipment_id,
        metrics=metrics,
        last_recorded_at=last_ts,
    )
