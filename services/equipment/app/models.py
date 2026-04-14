from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Equipment(Base):
    __tablename__ = "equipment"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    equipment_type: Mapped[str | None] = mapped_column(String(128))
    status: Mapped[str] = mapped_column(String(32), default="offline")
    location: Mapped[str | None] = mapped_column(String(255))
    serial_number: Mapped[str | None] = mapped_column(String(128))
    notes: Mapped[str | None] = mapped_column(Text())

    characteristics: Mapped[list["Characteristic"]] = relationship(
        back_populates="equipment",
        cascade="all, delete-orphan",
    )


class Characteristic(Base):
    __tablename__ = "characteristics"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    equipment_id: Mapped[int] = mapped_column(ForeignKey("equipment.id", ondelete="CASCADE"))
    key: Mapped[str] = mapped_column(String(128), nullable=False)
    value: Mapped[str] = mapped_column(String(512), nullable=False)
    unit: Mapped[str | None] = mapped_column(String(32))

    equipment: Mapped["Equipment"] = relationship(back_populates="characteristics")
