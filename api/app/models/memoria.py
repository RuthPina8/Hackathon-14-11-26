"""Almacén en memoria de mediciones y líneas base.

El motor siempre trabaja contra este almacén (rápido y sin red). Si `DATABASE_URL` está
definido, `app/models/persistencia.py` registra un gancho que escribe cada medición en
PostgreSQL y, al arrancar, vuelve a cargar aquí todo lo guardado (las líneas base se
reconstruyen repitiendo las mediciones en orden).
"""

from collections.abc import Callable
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
    # Si entró a la línea base al guardarse. Se guarda en la base para que al restaurar la línea
    # base quede idéntica (una medición tomada con la línea base congelada no debe entrar después)
    en_linea_base: bool | None = None


class Almacen:
    def __init__(self) -> None:
        # Ganchos de persistencia: al guardar una medición y al borrar las del simulador
        self.al_guardar: list[Callable[[Medicion], None]] = []
        self.al_reiniciar_demo: list[Callable[[], None]] = []
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

    def reiniciar_demo(self) -> None:
        """Borra solo lo que generó el simulador y reconstruye las líneas base con lo real.

        Así reiniciar la demo no se lleva la línea base en Tierra que el equipo midió de verdad.
        """
        reales = [m for m in self.mediciones if m.fuente != "simulador"]
        ultimo_id = self._id
        self.reset()
        for m in reales:
            self.guardar(_persistir=False, **{k: v for k, v in m.__dict__.items()})
        self._id = ultimo_id
        for fn in self.al_reiniciar_demo:
            fn()

    def guardar(self, _persistir: bool = True, **datos) -> tuple[Medicion, LineaBase | None]:
        """Guarda y regresa la medición junto con la línea base que había ANTES de ella."""
        if datos.get("id") is None:
            self._id += 1
            datos["id"] = self._id
        else:
            self._id = max(self._id, datos["id"])
        fecha = datos.pop("fecha", None) or datetime.now(timezone.utc)
        if fecha.tzinfo is None:
            fecha = fecha.replace(tzinfo=timezone.utc)
        m = Medicion(fecha=fecha, **datos)
        self.mediciones.append(m)
        clave = (m.astronauta_id, m.tipo)
        previa = self.lineas.get(clave)
        if m.capa != "sim" and m.fuente != "modelo" and m.confianza >= CONFIANZA_MIN_LINEA_BASE:
            self.previas[clave] = previa  # mismas reglas que ultimos()
        if m.en_linea_base is None:
            m.en_linea_base = self.cuenta_para_linea_base(m)
        if m.en_linea_base:
            self.lineas[clave] = actualizar(previa or LineaBase(), m.valor)
        if _persistir:
            for fn in self.al_guardar:
                fn(m)
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
