from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.anomaly import Nivel

EstadoAlerta = Literal["activa", "atendida", "escalada", "resuelta"]


class Alert(BaseModel):
    id: int
    astronauta_id: int
    nivel: Nivel
    senal: str
    que_cambio: str
    cuanto: str | None = None
    desde: datetime | None = None
    factores: dict[str, float] = Field(default_factory=dict)
    estado: EstadoAlerta = "activa"
    detectores: list[str] = Field(default_factory=list)
    dia_mision: int | None = None
    creada: datetime
    actualizada: datetime
    atendida: datetime | None = None
    resuelta: datetime | None = None
    mensaje_cola_id: int | None = None


class AlertList(BaseModel):
    activas: list[Alert]
    resueltas: list[Alert]


class AckIn(BaseModel):
    nota: str | None = None


class EscalateIn(BaseModel):
    nota: str | None = None
