"""Almacén en memoria de mediciones y líneas base (versión mínima de integración).

Mientras Back 1 crea las tablas de PostgreSQL, las mediciones viven aquí. Se pierden al
reiniciar la API. Cuando exista la base, este módulo se reemplaza por los modelos SQLAlchemy
con la misma interfaz (guardar, listar, linea_base, ultimos).
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone

from app.intelligence.baseline import LineaBase, actualizar
from app.triage import baseline as congelamiento

CONFIANZA_MIN_LINEA_BASE = 0.5


@dataclass
class Medicion:
    id: int
    astronauta_id: int
    tipo: str
    valor: float
    unidad: str
    capa: str
    fuente: str
    confianza: float
    fecha: datetime
    dia_mision: int | None = None
    detalle: dict = field(default_factory=dict)


class Almacen:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.mediciones: list[Medicion] = []
        self.lineas: dict[tuple[int, str], LineaBase] = {}
        # Línea base que había ANTES de la última medición de cada señal (la que usa /status)
        self.previas: dict[tuple[int, str], LineaBase | None] = {}
        self._id = 0

    def cuenta_para_linea_base(self, m: Medicion) -> bool:
        # Regla de honestidad: capa sim y fuente modelo nunca alimentan la línea base;
        # las sesiones de práctica de la prueba cognitiva tampoco
        if m.capa == "sim" or m.fuente == "modelo":
            return False
        # motor.md §2: con confianza menor a 0.5 no se actualiza la línea base
        if m.confianza < CONFIANZA_MIN_LINEA_BASE:
            return False
        if m.detalle.get("practica"):
            return False
        return not congelamiento.esta_congelada(m.astronauta_id, m.tipo)

    def guardar(self, **datos) -> tuple[Medicion, LineaBase | None]:
        """Guarda y regresa la medición junto con la línea base que había ANTES de ella."""
        self._id += 1
        m = Medicion(id=self._id, fecha=datos.pop("fecha", None) or datetime.now(timezone.utc), **datos)
        self.mediciones.append(m)
        clave = (m.astronauta_id, m.tipo)
        previa = self.lineas.get(clave)
        if m.capa != "sim" and m.fuente != "modelo" and m.confianza >= CONFIANZA_MIN_LINEA_BASE:
            self.previas[clave] = previa  # mismas reglas que ultimos()
        if self.cuenta_para_linea_base(m):
            self.lineas[clave] = actualizar(previa or LineaBase(), m.valor)
        return m, previa

    def linea_previa(self, astronauta_id: int, tipo: str) -> LineaBase | None:
        return self.previas.get((astronauta_id, tipo))

    def listar(self, astronauta_id: int, tipo: str | None = None) -> list[Medicion]:
        return [m for m in self.mediciones if m.astronauta_id == astronauta_id and (tipo is None or m.tipo == tipo)]

    def linea_base(self, astronauta_id: int, tipo: str) -> LineaBase | None:
        return self.lineas.get((astronauta_id, tipo))

    def ultimos(self, astronauta_id: int) -> dict[str, Medicion]:
        """Último valor de cada tipo, sin capa sim ni fuente modelo."""
        res: dict[str, Medicion] = {}
        for m in self.mediciones:
            if (m.astronauta_id == astronauta_id and m.capa != "sim" and m.fuente != "modelo"
                    and m.confianza >= CONFIANZA_MIN_LINEA_BASE):
                res[m.tipo] = m
        return res


almacen = Almacen()
