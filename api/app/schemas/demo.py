from typing import Literal

from pydantic import BaseModel, Field


class DemoAdvanceIn(BaseModel):
    dias: int = Field(default=1, ge=1, le=60)


class DemoState(BaseModel):
    dia: int
    corriendo: bool
    segundos_por_dia: float
    fuente_datos: Literal["simulador_back1", "guion_back2"]


class DemoAdvanceOut(DemoState):
    eventos: list[str] = Field(default_factory=list)


class DemoStartIn(BaseModel):
    segundos_por_dia: float | None = Field(default=None, gt=0.2, le=60)
