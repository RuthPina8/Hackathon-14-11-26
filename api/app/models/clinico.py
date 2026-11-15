"""Fichas médicas y pares de validación en memoria (persistencia.py los guarda en PostgreSQL)."""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime

from app.schemas.clinico import FichaMedica


@dataclass
class ParGuardado:
    id: int
    camara: float
    referencia: float
    confianza: float
    origen: str
    astronauta_id: int | None = None
    fuente_referencia: str | None = None
    fecha: datetime | None = None


class Clinico:
    def __init__(self) -> None:
        self.al_guardar_ficha: list[Callable[[FichaMedica], None]] = []
        self.al_guardar_par: list[Callable[[ParGuardado], None]] = []
        self.al_borrar_pares: list[Callable[[str | None], None]] = []
        self.reset()

    def reset(self) -> None:
        self.fichas: dict[int, FichaMedica] = {}
        self.pares: list[ParGuardado] = []
        self._id = 0

    def guardar_ficha(self, f: FichaMedica, persistir: bool = True) -> FichaMedica:
        self.fichas[f.astronauta_id] = f
        if persistir:
            for fn in self.al_guardar_ficha:
                fn(f)
        return f

    def agregar_par(self, persistir: bool = True, **datos) -> ParGuardado:
        if datos.get("id") is None:
            self._id += 1
            datos["id"] = self._id
        else:
            self._id = max(self._id, datos["id"])
        p = ParGuardado(**datos)
        self.pares.append(p)
        if persistir:
            for fn in self.al_guardar_par:
                fn(p)
        return p

    def borrar_pares(self, origen: str | None = None) -> int:
        antes = len(self.pares)
        self.pares = [p for p in self.pares if origen is not None and p.origen != origen]
        for fn in self.al_borrar_pares:
            fn(origen)
        return antes - len(self.pares)


clinico = Clinico()
