"""Contrato de ficha médica, evolución y confiabilidad de la cámara (Back 1). Ampliación del 15 nov."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


class Basales(BaseModel):
    """Valores de la evaluación médica previa al vuelo (en Tierra). Referencia, no mediciones del motor."""

    hr_reposo: float | None = Field(default=None, ge=25, le=200, description="lpm")
    presion_sis: float | None = Field(default=None, ge=60, le=260)
    presion_dia: float | None = Field(default=None, ge=30, le=160)
    reaccion_ms: float | None = Field(default=None, ge=100, le=1500)
    sueno_horas: float | None = Field(default=None, ge=0, le=16)
    hrv_rmssd: float | None = Field(default=None, ge=1, le=300)
    peso_kg: float | None = Field(default=None, ge=20, le=250)
    spo2_pct: float | None = Field(default=None, ge=50, le=100)


class FichaMedica(BaseModel):
    astronauta_id: int
    nombre: str = ""
    fecha_nacimiento: date | None = None
    sexo: Literal["F", "M", "otro", ""] = ""
    estatura_cm: float | None = Field(default=None, ge=100, le=230)
    tipo_sangre: Literal["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", ""] = ""
    alergias: list[str] = Field(default_factory=list)
    medicamentos: list[str] = Field(default_factory=list)
    condiciones: list[str] = Field(default_factory=list, description="history or chronic conditions")
    cirugias: list[str] = Field(default_factory=list)
    vacunas: list[str] = Field(default_factory=list)
    basales: Basales = Field(default_factory=Basales)
    fecha_evaluacion: date | None = None
    medico: str = ""
    notas: str = Field(default="", max_length=2000)
    actualizada: datetime | None = None


class PuntoEvolucion(BaseModel):
    dia: int
    valor: float


class ItemEvolucion(BaseModel):
    tipo: str
    nombre: str
    unidad: str
    ficha: float | None = Field(default=None, description="value from the pre-flight medical record")
    inicio: float | None = Field(default=None, description="average of the first 7 days with data")
    reciente: float | None = Field(default=None, description="average of the last 7 days with data")
    referencia: Literal["ficha", "inicio", "ninguna"] = "ninguna"
    cambio: float | None = Field(default=None, description="recent - reference")
    cambio_pct: float | None = None
    tendencia_semana: float | None = Field(default=None, description="slope per week over the last 14 days")
    estado: Literal["mejora", "estable", "empeora", "sin_datos"] = "sin_datos"
    explicacion: str = ""
    n: int = 0
    serie: list[PuntoEvolucion] = Field(default_factory=list)


class EvolucionOut(BaseModel):
    astronauta_id: int
    tiene_ficha: bool
    dias_con_datos: int
    resumen: str
    items: list[ItemEvolucion]


class ReferenciaIn(BaseModel):
    astronauta_id: int = 1
    hr_lpm: float = Field(ge=30, le=220)
    fuente: Literal["oximetro", "brazalete", "apple_watch", "ecg", "manual"] = "oximetro"
    fecha: datetime | None = None


class ParIn(BaseModel):
    camara: float = Field(ge=30, le=240)
    referencia: float = Field(ge=30, le=240)
    confianza: float = Field(ge=0, le=1)
    origen: str = "propio"


class LoteIn(BaseModel):
    pares: list[ParIn]


class ParOut(ParIn):
    id: int
    astronauta_id: int | None = None
    fuente_referencia: str | None = None
    fecha: datetime | None = None


class MetricasOut(BaseModel):
    n: int
    mae: float | None = None
    rmse: float | None = None
    sesgo: float | None = None
    loa: tuple[float, float] | None = None
    pearson: float | None = None
    exito_5: float | None = None


class TramoOut(BaseModel):
    desde: float
    n: int
    mae: float | None = None
    exito_5: float | None = None


class ConfiabilidadOut(BaseModel):
    estado: Literal["sin_validar", "validando", "verificado"]
    explicacion: str
    umbral: float | None
    tolerancia_lpm: float
    objetivo: float
    global_: MetricasOut = Field(alias="global")
    sobre_umbral: MetricasOut | None = None
    por_origen: dict[str, MetricasOut]
    tramos: list[TramoOut]
    referencia_publicada: dict
    pares: list[ParOut]

    model_config = {"populate_by_name": True}
