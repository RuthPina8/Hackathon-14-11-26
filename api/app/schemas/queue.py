from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

EstadoMensaje = Literal["en_cola", "transmitiendo", "en_transito", "entregado"]


class QueueMessage(BaseModel):
    id: int
    prioridad: int = Field(description="1 = most urgent")
    tipo: str = Field(description="alert | report | ...")
    tamano: float = Field(description="kB")
    payload: dict[str, Any] = Field(default_factory=dict)
    estado: EstadoMensaje = "en_cola"
    creado: datetime
    enviado: datetime | None = None
    entregado: datetime | None = None
    progreso: float = Field(default=0.0, description="0 to 1, to animate the packet")
    eta_s: float | None = Field(default=None, description="seconds left to reach Earth")


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
