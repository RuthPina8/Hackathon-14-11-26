from typing import Literal

from pydantic import BaseModel


class PuntoSerie(BaseModel):
    dia: int
    valor: float


class Oseo(BaseModel):
    perdida_pct: float
    densidad_relativa: float
    serie: list[PuntoSerie]


class Radiacion(BaseModel):
    dosis_msv: float
    limite_carrera_msv: float
    pct_limite: float
    serie: list[PuntoSerie]


class Retraso(BaseModel):
    ida_s: float
    ida_vuelta_s: float
    texto: str


class Riesgo(BaseModel):
    nivel: Literal["bajo", "medio", "alto"]
    puntaje: int
    motivos: list[str]


class Simulation(BaseModel):
    entorno: str
    dia: int
    capa: Literal["sim"] = "sim"
    oseo: Oseo
    radiacion: Radiacion
    retraso: Retraso
    riesgo: Riesgo
