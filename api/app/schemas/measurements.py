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
    estado: Semaforo = "verde"
    puntaje: float
    motivo: str
    dia_desde: int | None = None


class AnimoCamaraOut(BaseModel):
    estado: Literal["aprendiendo", "activo"]
    acierto_pct: float | None = None
    mae: float | None = None
    n: int = Field(description="días con chequeo de cámara y registro de ánimo")
    explicacion: str | None = None
    estimado_hoy: float | None = None


class StatusOut(BaseModel):
    astronauta_id: int
    readiness: int
    factores: list[FactorOut]
    sistemas: dict[str, SistemaOut]
    calibracion: int = Field(description="0 a 100")
    fase: Literal["tierra", "adaptacion", "personal"]
    dia_mision: int
    n_mediciones: int
    racha: int = Field(default=0, description="días seguidos con al menos una medición propia, hasta el último")
    dato_demo: bool = Field(default=False, description="el estado incluye datos del simulador")
    inmune: InmuneOut | None = None
    animo_camara: AnimoCamaraOut | None = None


class PuntoOut(BaseModel):
    fecha: datetime
    valor: float
    capa: Capa
    fuente: str
    confianza: float
    dia_mision: int | None = None
    z: float | None = Field(default=None, description="contra la línea base que había antes de este punto")
    anomalo: bool = False


class AnomaliaOut(BaseModel):
    fecha: datetime
    valor: float
    z: float | None = None
    motivo: str | None = None
    dia_mision: int | None = None


class LineaBaseOut(BaseModel):
    media: float | None
    desviacion: float | None
    n: int
    peso_personal: float
    congelada: bool


class IndicatorOut(BaseModel):
    tipo: str
    nombre: str = ""
    unidad: str
    serie: list[PuntoOut]
    linea_base: LineaBaseOut
    rango_clinico: tuple[float, float] | None = None
    rango_atencion: tuple[float, float] | None = None
    anomalias: list[AnomaliaOut] = Field(default_factory=list)
    estado: Semaforo = "sin_datos"
    alerta_id: int | None = None
    desde: datetime | None = Field(default=None, description="desde cuándo, de la alerta abierta (CUSUM)")
    experimental: bool = False
    dato_demo: bool = Field(default=False, description="hay datos del simulador en la serie")


class CrewMemberOut(BaseModel):
    astronauta_id: int
    nombre: str
    rol: str
    estado: Semaforo
    readiness: int | None = None
    ultimo: datetime | None = None
    ultimo_dia: int | None = Field(default=None, description="día de misión del último dato")
    ritmo: str | None = None
    perclos: str | None = None
    presion: str | None = None
    animo: str | None = None
    alertas_activas: int = 0
    dato_demo: bool = False


class IngestOut(BaseModel):
    recibidas: int
    guardadas: int
    duplicadas: int
    ignoradas: int
    por_tipo: dict[str, int]
    alerta_id: int | None = None
