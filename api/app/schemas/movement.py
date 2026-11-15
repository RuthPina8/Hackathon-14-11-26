"""ASTRA-MOVE: sesiones de evaluación funcional con webcam y pose corporal.

Es una estimación computacional y repetible del desempeño funcional. NO mide fuerza muscular,
no diagnostica lesiones y no evalúa clínicamente la movilidad. Sirve comparada contra la
línea base de la propia persona.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Ejercicio = Literal["sentadilla", "brazos"]
EstadoFuncional = Literal["sin_referencia", "estable", "bajo", "baja_calidad"]


class SesionIn(BaseModel):
    astronauta_id: int = 1
    ejercicio: Ejercicio
    repeticiones: int = Field(ge=0, le=500)
    duracion_s: float = Field(ge=0, le=3600)
    rango_grados: float | None = Field(default=None, ge=0, le=200, description="rango de movimiento aproximado")
    regularidad: float | None = Field(default=None, ge=0, le=1, description="1 = repeticiones muy parejas")
    simetria: float | None = Field(default=None, ge=0, le=1, description="1 = ambos lados igual (brazos)")
    calidad: float = Field(ge=0, le=1, description="proporción de cuadros con el cuerpo bien detectado")
    fuente: Literal["webcam", "demo"] = "webcam"
    dia_mision: int | None = None
    # Sesión del entrenamiento: se guarda, pero no cuenta para tu normal ni para la correlación
    practica: bool = False


class Comparacion(BaseModel):
    estado: EstadoFuncional
    referencia_reps: float | None = None
    n_referencia: int = 0
    cambio_pct: float | None = None
    texto: str


class Sesion(SesionIn):
    id: int
    fecha: datetime
    capa: Literal["real", "sim"]
    dato_demo: bool
    comparacion: Comparacion


class DemoMovimientoIn(BaseModel):
    tipo: Literal["linea_base", "descenso"]
    astronauta_id: int = 1
    ejercicio: Ejercicio = "brazos"
