from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import Base, SessionLocal, engine, get_db
from app.models import Characteristic, Equipment
from app.schemas import (
    CharacteristicBase,
    EquipmentCreate,
    EquipmentRead,
    EquipmentUpdate,
)


CNC_CHARACTERISTICS_BY_NAME: dict[str, list[dict[str, str | None]]] = {
    "Станок ЧПУ HAAS VF-2": [
        {"key": "Рабочий ход X / Y / Z (номинал)", "value": "762 / 406 / 508", "unit": "мм"},
        {"key": "Макс. скорость вращения шпинделя", "value": "10000", "unit": "об/мин"},
        {"key": "Макс. мощность шпинделя", "value": "15", "unit": "кВт"},
        {"key": "Интерфейс / протокол", "value": "Fanuc / Modbus", "unit": None},
    ],
    "Станок ЧПУ DMG MORI CMX 1100 V": [
        {"key": "Рабочий ход X / Y / Z (номинал)", "value": "762 / 406 / 508", "unit": "мм"},
        {"key": "Макс. скорость вращения шпинделя", "value": "10000", "unit": "об/мин"},
        {"key": "Макс. мощность шпинделя", "value": "15", "unit": "кВт"},
        {"key": "Интерфейс / протокол", "value": "Siemens / Modbus", "unit": None},
    ],
    "Токарный станок ЧПУ Doosan Lynx 220": [
        {"key": "Рабочий ход X / Y / Z (номинал)", "value": "762 / 406 / 508", "unit": "мм"},
        {"key": "Макс. скорость вращения шпинделя", "value": "10000", "unit": "об/мин"},
        {"key": "Макс. мощность шпинделя", "value": "15", "unit": "кВт"},
        {"key": "Интерфейс / протокол", "value": "Fanuc / Modbus", "unit": None},
    ],
    "Станок ЧПУ (пульт оператора) VF-2": [
        {"key": "Рабочий ход X / Y / Z (номинал)", "value": "762 / 406 / 508", "unit": "мм"},
        {"key": "Макс. скорость вращения шпинделя", "value": "10000", "unit": "об/мин"},
        {"key": "Макс. мощность шпинделя", "value": "15", "unit": "кВт"},
        {"key": "Интерфейс / протокол", "value": "Fanuc / Modbus", "unit": None},
    ],
    "Станок ЧПУ (ручной мониторинг)": [
        {"key": "Рабочий ход X / Y / Z (номинал)", "value": "762 / 406 / 508", "unit": "мм"},
        {"key": "Макс. скорость вращения шпинделя", "value": "10000", "unit": "об/мин"},
        {"key": "Макс. мощность шпинделя", "value": "15", "unit": "кВт"},
        {"key": "Интерфейс / протокол", "value": "Fanuc / Modbus", "unit": None},
    ],
}


FURNACE_CHARACTERISTICS_BY_NAME: dict[str, list[dict[str, str | None]]] = {
    "Печь Nabertherm N 300/65": [
        {"key": "Установленное значение температуры", "value": "900", "unit": "°C"},
        {"key": "Тип нагрева", "value": "Электрический", "unit": None},
        {"key": "Контроллер", "value": "ТЕРМОДАТ", "unit": None},
        {"key": "Протокол", "value": "Modbus", "unit": None},
    ],
    "Печь SNOL 8.2/1100": [
        {"key": "Установленное значение температуры", "value": "900", "unit": "°C"},
        {"key": "Тип нагрева", "value": "Электрический", "unit": None},
        {"key": "Контроллер", "value": "ТЕРМОДАТ", "unit": None},
        {"key": "Протокол", "value": "Modbus", "unit": None},
    ],
    "Печь ЭКПС 10/1250": [
        {"key": "Установленное значение температуры", "value": "900", "unit": "°C"},
        {"key": "Тип камеры", "value": "Керамическая", "unit": None},
        {"key": "Контроллер", "value": "ТЕРМОДАТ", "unit": None},
        {"key": "Протокол", "value": "Modbus", "unit": None},
    ],
}


def ensure_default_equipment(db: Session) -> None:
    samples = [
        Equipment(
            name="Станок ЧПУ HAAS VF-2",
            equipment_type="Станок ЧПУ",
            status="online",
            location="Механический цех, линия 1",
            serial_number="CNC-HAAS-VF2-014",
            notes="Вертикальный обрабатывающий центр",
            characteristics=[
                Characteristic(key=r["key"], value=r["value"], unit=r["unit"])
                for r in CNC_CHARACTERISTICS_BY_NAME["Станок ЧПУ HAAS VF-2"]
            ],
        ),
        Equipment(
            name="Станок ЧПУ DMG MORI CMX 1100 V",
            equipment_type="Станок ЧПУ",
            status="online",
            location="Механический цех, линия 2",
            serial_number="CNC-DMG-CMX1100-03",
            characteristics=[
                Characteristic(key=r["key"], value=r["value"], unit=r["unit"])
                for r in CNC_CHARACTERISTICS_BY_NAME["Станок ЧПУ DMG MORI CMX 1100 V"]
            ],
        ),
        Equipment(
            name="Токарный станок ЧПУ Doosan Lynx 220",
            equipment_type="Станок ЧПУ",
            status="maintenance",
            location="Токарная зона",
            serial_number="CNC-DOOSAN-LYNX-07",
            notes="Ресурс шпинделя на контроле",
            characteristics=[
                Characteristic(key=r["key"], value=r["value"], unit=r["unit"])
                for r in CNC_CHARACTERISTICS_BY_NAME["Токарный станок ЧПУ Doosan Lynx 220"]
            ],
        ),
        Equipment(
            name="Станок ЧПУ (пульт оператора) VF-2",
            equipment_type="Станок ЧПУ",
            status="online",
            location="Механический цех, пульт оператора",
            serial_number="CNC-OP-PANEL-VF2-01",
            notes="Паспорт как у HAAS VF-2; сценарий цикла не используется — статусы только с пульта оператора",
            characteristics=[
                Characteristic(key=r["key"], value=r["value"], unit=r["unit"])
                for r in CNC_CHARACTERISTICS_BY_NAME["Станок ЧПУ (пульт оператора) VF-2"]
            ],
        ),
        Equipment(
            name="Станок ЧПУ (ручной мониторинг)",
            equipment_type="Станок ЧПУ",
            status="online",
            location="Механический цех, мониторинг",
            serial_number="CNC-MANUAL-RT-01",
            notes="Статусы только вручную в мониторинге ЧПУ; отдельный таймлайн от пульта оператора",
            characteristics=[
                Characteristic(key=r["key"], value=r["value"], unit=r["unit"])
                for r in CNC_CHARACTERISTICS_BY_NAME["Станок ЧПУ (ручной мониторинг)"]
            ],
        ),
        Equipment(
            name="Печь Nabertherm N 300/65",
            equipment_type="Печь",
            status="on",
            location="Термический участок, печь 1",
            serial_number="TERM-NABER-300-01",
            notes="Камерная печь до 1100°C",
            characteristics=[
                Characteristic(key="Установленное значение температуры", value="900", unit="°C"),
                Characteristic(key="Тип нагрева", value="Электрический", unit=None),
                Characteristic(key="Контроллер", value="ТЕРМОДАТ", unit=None),
                Characteristic(key="Протокол", value="Modbus", unit=None),
            ],
        ),
        Equipment(
            name="Печь SNOL 8.2/1100",
            equipment_type="Печь",
            status="on",
            location="Термический участок, печь 2",
            serial_number="TERM-SNOL-820-02",
            notes="Лабораторная печь периодического действия",
            characteristics=[
                Characteristic(key="Установленное значение температуры", value="900", unit="°C"),
                Characteristic(key="Тип нагрева", value="Электрический", unit=None),
                Characteristic(key="Контроллер", value="ТЕРМОДАТ", unit=None),
                Characteristic(key="Протокол", value="Modbus", unit=None),
            ],
        ),
        Equipment(
            name="Печь ЭКПС 10/1250",
            equipment_type="Печь",
            status="on",
            location="Термический участок, печь 3",
            serial_number="TERM-EKPS-101250-03",
            notes="Высокотемпературная печь для термообработки",
            characteristics=[
                Characteristic(key="Установленное значение температуры", value="900", unit="°C"),
                Characteristic(key="Тип камеры", value="Керамическая", unit=None),
                Characteristic(key="Контроллер", value="ТЕРМОДАТ", unit=None),
                Characteristic(key="Протокол", value="Modbus", unit=None),
            ],
        ),
    ]
    existing_names = set(db.scalars(select(Equipment.name)).all())
    created = False
    for sample in samples:
        if sample.name in existing_names:
            continue
        db.add(sample)
        created = True
    if created:
        db.commit()

    cnc_machines = db.scalars(
        select(Equipment).where(Equipment.name.in_(list(CNC_CHARACTERISTICS_BY_NAME.keys())))
    ).all()
    updated_cnc = False
    for cnc in cnc_machines:
        expected = CNC_CHARACTERISTICS_BY_NAME.get(cnc.name)
        if expected is None:
            continue
        expected_tuples = [(x["key"], x["value"], x["unit"]) for x in expected]
        current_tuples = [(c.key, c.value, c.unit) for c in cnc.characteristics]
        if current_tuples == expected_tuples:
            continue
        cnc.characteristics.clear()
        for row in expected:
            cnc.characteristics.append(
                Characteristic(
                    key=row["key"],
                    value=row["value"],
                    unit=row["unit"],
                )
            )
        updated_cnc = True
    if updated_cnc:
        db.commit()

    # Для уже существующих печей приводим характеристики к единому формату.
    furnaces = db.scalars(
        select(Equipment).where(Equipment.name.in_(list(FURNACE_CHARACTERISTICS_BY_NAME.keys())))
    ).all()
    updated = False
    for furnace in furnaces:
        expected = FURNACE_CHARACTERISTICS_BY_NAME.get(furnace.name)
        if expected is None:
            continue
        expected_tuples = [(x["key"], x["value"], x["unit"]) for x in expected]
        current_tuples = [(c.key, c.value, c.unit) for c in furnace.characteristics]
        if current_tuples == expected_tuples:
            continue
        furnace.characteristics.clear()
        for row in expected:
            furnace.characteristics.append(
                Characteristic(
                    key=row["key"],
                    value=row["value"],
                    unit=row["unit"],
                )
            )
        updated = True
    if updated:
        db.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        ensure_default_equipment(db)
    finally:
        db.close()
    yield


app = FastAPI(title="MDC Equipment Service", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "service": "equipment"}


@app.get("/api/v1/equipment", response_model=list[EquipmentRead])
def list_equipment(db: Session = Depends(get_db)):
    q = (
        select(Equipment)
        .options(selectinload(Equipment.characteristics))
        .order_by(Equipment.id)
    )
    return list(db.scalars(q).unique().all())


@app.get("/api/v1/equipment/{equipment_id}", response_model=EquipmentRead)
def get_equipment(equipment_id: int, db: Session = Depends(get_db)):
    q = (
        select(Equipment)
        .options(selectinload(Equipment.characteristics))
        .where(Equipment.id == equipment_id)
    )
    row = db.scalars(q).unique().one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return row


@app.post("/api/v1/equipment", response_model=EquipmentRead, status_code=status.HTTP_201_CREATED)
def create_equipment(body: EquipmentCreate, db: Session = Depends(get_db)):
    obj = Equipment(
        name=body.name,
        equipment_type=body.equipment_type,
        status=body.status,
        location=body.location,
        serial_number=body.serial_number,
        notes=body.notes,
        characteristics=[Characteristic(**c.model_dump()) for c in body.characteristics],
    )
    db.add(obj)
    db.commit()
    stmt = (
        select(Equipment)
        .options(selectinload(Equipment.characteristics))
        .where(Equipment.id == obj.id)
    )
    return db.scalars(stmt).unique().one()


@app.patch("/api/v1/equipment/{equipment_id}", response_model=EquipmentRead)
def update_equipment(
    equipment_id: int,
    body: EquipmentUpdate,
    db: Session = Depends(get_db),
):
    obj = db.get(Equipment, equipment_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    stmt = (
        select(Equipment)
        .options(selectinload(Equipment.characteristics))
        .where(Equipment.id == equipment_id)
    )
    return db.scalars(stmt).unique().one()


@app.put(
    "/api/v1/equipment/{equipment_id}/characteristics",
    response_model=EquipmentRead,
)
def replace_characteristics(
    equipment_id: int,
    items: list[CharacteristicBase],
    db: Session = Depends(get_db),
):
    obj = db.get(Equipment, equipment_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    obj.characteristics.clear()
    for c in items:
        obj.characteristics.append(Characteristic(**c.model_dump()))
    db.commit()
    stmt = (
        select(Equipment)
        .options(selectinload(Equipment.characteristics))
        .where(Equipment.id == equipment_id)
    )
    return db.scalars(stmt).unique().one()
