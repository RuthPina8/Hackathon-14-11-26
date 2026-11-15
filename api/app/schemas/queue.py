from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

EstadoMensaje = Literal["en_cola", "transmitiendo", "en_transito", "entregado"]


class QueueMessage(BaseModel):
    id: int
    prioridad: int = Field(description="1 = más urgente")
    tipo: str = Field(description="alerta | reporte | ...")
    tamano: float = Field(description="kB")
    payload: dict[str, Any] = Field(default_factory=dict)
    estado: EstadoMensaje = "en_cola"
    creado: datetime
    enviado: datetime | None = None
    entregado: datetime | None = None
    progreso: float = Field(default=0.0, description="0 a 1, para animar el paquete")
    eta_s: float | None = Field(default=None, description="segundos que faltan para llegar a Tierra")


class QueueState(BaseModel):
    entorno: str
    retraso_s: float
    ancho_banda_kbps: float
    mensajes: list[QueueMessage]


class QueueIn(BaseModel):
    tipo: str = "reporte"
    prioridad: int = 3
    tamano: float = 4.0
    payload: dict[str, Any] = Field(default_factory=dict)
