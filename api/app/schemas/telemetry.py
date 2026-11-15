"""Telemetría ambiental (Environmental Intelligence).

En la demo TODO es capa `sim` con fuente `simulador`: nunca se presenta como lectura de un
sensor físico y nunca entra al motor de anomalías. Solo da contexto a las observaciones.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Escenario = Literal["estable", "cambio", "revision"]


class TelemetriaIn(BaseModel):
    co2_ppm: float = Field(ge=0, le=20000)
    o2_pct: float = Field(ge=0, le=100)
    temp_c: float = Field(ge=-20, le=60)
    humedad_pct: float = Field(ge=0, le=100)
    radiacion_msv_dia: float = Field(ge=0, le=100)
    capa: Literal["real", "sim"] = "sim"
    fuente: str = "simulador"


class Lectura(TelemetriaIn):
    id: int
    fecha: datetime
    escenario: Escenario | None = None
    fuera_de_rango: list[str] = Field(default_factory=list)


class RangoVariable(BaseModel):
    variable: str
    nombre: str
    unidad: str
    minimo: float | None
    maximo: float | None


class TelemetriaEstado(BaseModel):
    escenario: Escenario
    ultima: Lectura | None
    rangos: list[RangoVariable]
    nota: str


class SimularIn(BaseModel):
    escenario: Escenario
