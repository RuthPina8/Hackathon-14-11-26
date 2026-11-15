from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.movement import Sesion
from app.schemas.telemetry import Lectura, RangoVariable


class VariableObservada(BaseModel):
    variable: str
    nombre: str
    unidad: str
    minimo_registrado: float
    maximo_registrado: float
    rango: tuple[float | None, float | None]
    lecturas_fuera: int


class Observacion(BaseModel):
    id: int
    tipo: Literal["observacion_contextual"] = "observacion_contextual"
    nivel: Literal["informativa"] = "informativa"  # no es alerta: no se escala ni congela la línea base
    astronauta_id: int
    titulo: str
    texto: str
    causalidad: str
    que_cambio_funcional: str
    que_cambio_ambiente: list[VariableObservada]
    desde: datetime
    hasta: datetime
    datos_usados: list[str]
    confiabilidad: list[str]
    acciones: list[str]
    sesion_id: int
    creada: datetime


class ContextoMision(BaseModel):
    dia_mision: int
    astronauta_id: int
    entorno: str
    funcional: Sesion | None
    ambiente: Lectura | None
    escenario: str
    rangos: list[RangoVariable]
    observaciones: list[Observacion] = Field(default_factory=list)
    nota_ambiente: str
