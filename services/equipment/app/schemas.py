from pydantic import BaseModel, ConfigDict, Field


class CharacteristicBase(BaseModel):
    key: str = Field(..., max_length=128)
    value: str = Field(..., max_length=512)
    unit: str | None = Field(None, max_length=32)


class CharacteristicRead(CharacteristicBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


class EquipmentBase(BaseModel):
    name: str = Field(..., max_length=255)
    equipment_type: str | None = Field(None, max_length=128)
    status: str = Field("offline", max_length=32)
    location: str | None = Field(None, max_length=255)
    serial_number: str | None = Field(None, max_length=128)
    notes: str | None = None


class EquipmentCreate(EquipmentBase):
    characteristics: list[CharacteristicBase] = []


class EquipmentUpdate(BaseModel):
    name: str | None = Field(None, max_length=255)
    equipment_type: str | None = Field(None, max_length=128)
    status: str | None = Field(None, max_length=32)
    location: str | None = Field(None, max_length=255)
    serial_number: str | None = Field(None, max_length=128)
    notes: str | None = None


class EquipmentRead(EquipmentBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    characteristics: list[CharacteristicRead] = []
