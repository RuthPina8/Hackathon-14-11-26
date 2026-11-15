"""Perfiles de entorno (JSON en ./perfiles) y el entorno activo.

Para agregar un entorno basta con crear otro .json con los mismos campos.
"""

import json
from functools import lru_cache
from pathlib import Path

from app.core.config import settings
from app.schemas.environment import EnvironmentProfile

CARPETA = Path(__file__).parent / "perfiles"


@lru_cache
def cargar_perfiles() -> dict[str, EnvironmentProfile]:
    perfiles = {}
    for archivo in sorted(CARPETA.glob("*.json")):
        perfil = EnvironmentProfile.model_validate(json.loads(archivo.read_text(encoding="utf-8")))
        perfiles[perfil.id] = perfil
    return perfiles


def obtener(entorno_id: str) -> EnvironmentProfile:
    perfiles = cargar_perfiles()
    if entorno_id not in perfiles:
        raise KeyError(entorno_id)
    return perfiles[entorno_id]


class _Activo:
    def __init__(self) -> None:
        self.id = settings.entorno_inicial

    @property
    def perfil(self) -> EnvironmentProfile:
        return obtener(self.id)

    def cambiar(self, entorno_id: str) -> EnvironmentProfile:
        perfil = obtener(entorno_id)  # KeyError si no existe
        self.id = entorno_id
        return perfil


activo = _Activo()
