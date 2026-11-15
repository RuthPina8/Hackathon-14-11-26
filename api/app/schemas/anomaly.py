"""Anomalía: lo que el motor de Back 1 entrega al triage de Back 2.

Frontera (api/CLAUDE.md): Back 1 llama `triage.handle_anomalies(astronauta_id, anomalias)`.
Cambiar estos campos = avisar a los dos.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Detector = Literal["zscore", "ewma", "cusum", "isolation_forest", "rango_clinico", "sueno", "inmune"]
Nivel = Literal["amarilla", "roja"]


class Anomaly(BaseModel):
    senal: str = Field(description="tipo de medición, p. ej. hr_reposo")
    detector: Detector
    valor: float | None = None
    referencia: float | None = Field(default=None, description="media de la línea base")
    z: float | None = None
    desde: datetime | None = Field(default=None, description="desde cuándo (CUSUM)")
    direccion: Literal["sube", "baja", "ambas"] | None = None
    factores: dict[str, float] = Field(default_factory=dict, description="señal -> % de contribución")
    # Regla de honestidad: capa sim o fuente modelo nunca generan alertas
    capa: Literal["real", "auto", "sim"] = "real"
    fuente: str | None = None
    # Confianza de la lectura (0 a 1). Back 1: pasa la confianza de la medición tal cual
    confianza: float = Field(default=1.0, ge=0, le=1)
    # Opcional: inmune ya trae su color calculado
    nivel_sugerido: Nivel | None = None
    texto: str | None = Field(default=None, description="qué cambió, en lenguaje simple")
