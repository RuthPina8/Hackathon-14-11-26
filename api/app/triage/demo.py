"""Modo demo: reloj de misión acelerado (1 día cada `segundos_por_dia`).

Cada día:
- Si Back 1 ya publicó `app.simulator.correr_dia(dia_mision) -> list[str]`, se usa:
  genera las mediciones del día y las manda por el mismo pipeline de /measurements
  (que a su vez llama a triage.handle_anomalies).
- Si no, corre el guion de respaldo de Back 2 (app/triage/guion.py).
Siempre emite `demo_tick {dia, fuente_datos}`.
"""

import asyncio
import inspect
from collections.abc import Awaitable, Callable

from app.core.config import settings
from app.core.ws import broadcast
from app.schemas.demo import DemoAdvanceOut, DemoState
from app.triage import alerts, baseline, guion
from app.triage.queue import engine as queue_engine


def _simulador_back1() -> Callable[[int], Awaitable[list[str]] | list[str]] | None:
    try:
        from app.simulator import correr_dia  # type: ignore[attr-defined]
    except ImportError:
        return None
    return correr_dia


class DemoEngine:
    def __init__(self) -> None:
        self.dia = 0
        self.corriendo = False
        self.segundos_por_dia = settings.demo_segundos_por_dia
        self._calibracion = [40.0]
        self._lock = asyncio.Lock()

    @property
    def fuente(self) -> str:
        return "simulador_back1" if _simulador_back1() else "guion_back2"

    def estado(self) -> DemoState:
        return DemoState(
            dia=self.dia,
            corriendo=self.corriendo,
            segundos_por_dia=self.segundos_por_dia,
            fuente_datos=self.fuente,  # type: ignore[arg-type]
        )

    async def avanzar(self, dias: int = 1) -> DemoAdvanceOut:
        eventos: list[str] = []
        async with self._lock:
            for _ in range(dias):
                self.dia += 1
                sim = _simulador_back1()
                if sim:
                    r = sim(self.dia)
                    eventos += list(await r if inspect.isawaitable(r) else r)
                else:
                    eventos += await guion.correr_dia(self.dia, self._calibracion)
                    if self.dia >= guion.FIN:
                        self.corriendo = False
                await broadcast("demo_tick", {"dia": self.dia, "fuente_datos": self.fuente})
        return DemoAdvanceOut(**self.estado().model_dump(), eventos=eventos)

    async def reset(self) -> DemoState:
        async with self._lock:
            self.__init__()
            alerts.reset()
            queue_engine.reset()
            baseline.reset()
            # Back 1: borra lo simulado y conserva las mediciones reales del equipo
            from app.models.memoria import almacen
            from app.routers import measurements

            almacen.reiniciar_demo()
            measurements.reset()
            # ASTRA-MOVE y ambiente vuelven a cero y al escenario estable
            from app.mision.contexto import contexto
            from app.mision.movimiento import movimiento
            from app.mision.telemetria import telemetria

            contexto.reset()
            movimiento.reset()
            telemetria.reset()
        await broadcast("demo_tick", {"dia": 0, "fuente_datos": self.fuente, "reset": True})
        return self.estado()


engine = DemoEngine()


async def run_forever() -> None:
    while True:
        if engine.corriendo:
            await engine.avanzar(1)
            await asyncio.sleep(engine.segundos_por_dia)
        else:
            await asyncio.sleep(0.2)
