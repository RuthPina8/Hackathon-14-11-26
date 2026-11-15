"""Contrato de /measurements, /status e /indicators (Back 1). Cambiarlo = avisar al equipo."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

Capa = Literal["real", "auto", "sim"]
Fuente = Literal["camara", "prueba", "manual", "apple_watch", "simulador", "modelo"]
Semaforo = Literal["verde", "amarillo", "rojo", "sin_datos"]


class MedicionIn(BaseModel):
    astronauta_id: int = 1
    tipo: str
    valor: float
    unidad: str = ""
    capa: Capa
    fuente: Fuente
    confianza: float = Field(default=1.0, ge=0, le=1)
    fecha: datetime | None = None
    dia_mision: int | None = None
    detalle: dict[str, Any] = Field(default_factory=dict)


class MedicionOut(MedicionIn):
    id: int
    fecha: datetime


class GuardadoOut(BaseModel):
    guardadas: int
    mediciones: list[MedicionOut]
    alerta_id: int | None = None


class SistemaOut(BaseModel):
    estado: Semaforo
    valor: str | None = None


class FactorOut(BaseModel):
    label: str
    delta: int
    peso: int


class InmuneOut(BaseModel):
    puntaje: int
    motivo: str


class StatusOut(BaseModel):
    astronauta_id: int
    readiness: int
    factores: list[FactorOut]
    sistemas: dict[str, SistemaOut]
    calibracion: int = Field(description="0 a 100")
    fase: Literal["tierra", "adaptacion", "personal"]
    dia_mision: int
    n_mediciones: int
    inmune: InmuneOut | None = None


class PuntoOut(BaseModel):
    fecha: datetime
    valor: float
    capa: Capa
    fuente: str
    confianza: float


class LineaBaseOut(BaseModel):
    media: float | None
    desviacion: float | None
    n: int
    peso_personal: float
    congelada: bool


class IndicatorOut(BaseModel):
    tipo: str
    unidad: str
    serie: list[PuntoOut]
    linea_base: LineaBaseOut
    rango_clinico: tuple[float, float] | None = None
