"""Cola de mensajes hacia Tierra con prioridad y retraso simulado.

Cada mensaje pasa por:  en_cola -> transmitiendo -> en_transito -> entregado
- Se transmite uno a la vez (el enlace es angosto), el de menor `prioridad` primero
  y, a igual prioridad, el más antiguo.
- Transmitir tarda tamano(kB) * 8 / ancho_banda_kbps segundos.
- Viajar tarda el retraso del entorno activo (retraso_demo_s en la demo).

`tick(now)` es pura respecto al reloj, así se prueba sin esperar.
"""

import asyncio
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from app.core.config import settings
from app.core.ws import broadcast
from app.entornos.perfiles import activo
from app.schemas.queue import QueueMessage, QueueState

TICK_S = 0.25


@dataclass
class _Tiempos:
    inicio_tx: float | None = None
    fin_tx: float | None = None
    llegada: float | None = None


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


def retraso_actual() -> float:
    p = activo.perfil
    return p.retraso_demo_s if settings.demo_retraso_visible else p.retraso_s


class QueueEngine:
    def __init__(self) -> None:
        self.mensajes: dict[int, QueueMessage] = {}
        self.tiempos: dict[int, _Tiempos] = {}
        self._sig = 1

    def reset(self) -> None:
        self.__init__()

    def encolar(
        self,
        tipo: str,
        prioridad: int,
        tamano: float,
        payload: dict[str, Any] | None = None,
    ) -> QueueMessage:
        m = QueueMessage(
            id=self._sig,
            prioridad=prioridad,
            tipo=tipo,
            tamano=tamano,
            payload=payload or {},
            creado=_ahora(),
        )
        self._sig += 1
        self.mensajes[m.id] = m
        self.tiempos[m.id] = _Tiempos()
        return m

    def tick(self, now: float) -> list[QueueMessage]:
        """Avanza la cola al instante `now` (segundos monotónicos). Regresa los que cambiaron de estado."""
        cambiados: list[QueueMessage] = []
        retraso = retraso_actual()
        kbps = max(activo.perfil.ancho_banda_kbps, 0.001)

        def poner(mid: int, **cambios: Any) -> None:
            self.mensajes[mid] = self.mensajes[mid].model_copy(update=cambios)
            cambiados.append(self.mensajes[mid])

        # Puede pasar más de un estado en un tick largo, por eso se repite hasta estabilizar
        for _ in range(len(self.mensajes) * 3 + 1):
            hubo = False
            for mid, m in list(self.mensajes.items()):
                t = self.tiempos[mid]
                if m.estado == "transmitiendo" and t.fin_tx is not None and now >= t.fin_tx:
                    t.llegada = t.fin_tx + retraso
                    poner(mid, estado="en_transito", enviado=_ahora())
                    hubo = True
                elif m.estado == "en_transito" and t.llegada is not None and now >= t.llegada:
                    poner(mid, estado="entregado", entregado=_ahora(), progreso=1.0, eta_s=0.0)
                    hubo = True

            if not any(m.estado == "transmitiendo" for m in self.mensajes.values()):
                pendientes = [m for m in self.mensajes.values() if m.estado == "en_cola"]
                if pendientes:
                    sig = min(pendientes, key=lambda m: (m.prioridad, m.id))
                    t = self.tiempos[sig.id]
                    t.inicio_tx = now
                    t.fin_tx = now + sig.tamano * 8 / kbps
                    poner(sig.id, estado="transmitiendo")
                    hubo = True
            if not hubo:
                break

        # Un mensaje puede aparecer varias veces si cambió dos veces; nos quedamos con el último
        ultimos = {m.id: self.mensajes[m.id] for m in cambiados}
        return [self.vista(m, now) for m in ultimos.values()]

    def vista(self, m: QueueMessage, now: float | None = None) -> QueueMessage:
        """Agrega progreso y ETA calculados al momento."""
        now = time.monotonic() if now is None else now
        t = self.tiempos.get(m.id, _Tiempos())
        retraso = retraso_actual()
        if m.estado == "en_transito" and t.fin_tx is not None and t.llegada is not None:
            total = max(t.llegada - t.fin_tx, 1e-6)
            prog = min(max((now - t.fin_tx) / total, 0.0), 1.0)
            return m.model_copy(update={"progreso": round(prog, 3), "eta_s": round(max(t.llegada - now, 0.0), 2)})
        if m.estado == "transmitiendo" and t.fin_tx is not None:
            return m.model_copy(update={"progreso": 0.0, "eta_s": round(max(t.fin_tx - now, 0.0) + retraso, 2)})
        return m

    def estado(self) -> QueueState:
        now = time.monotonic()
        orden = {"transmitiendo": 0, "en_transito": 1, "en_cola": 2, "entregado": 3}
        mensajes = sorted(
            (self.vista(m, now) for m in self.mensajes.values()),
            key=lambda m: (orden[m.estado], m.prioridad, m.id),
        )
        return QueueState(
            entorno=activo.id,
            retraso_s=retraso_actual(),
            ancho_banda_kbps=activo.perfil.ancho_banda_kbps,
            mensajes=mensajes,
        )


engine = QueueEngine()


async def run_forever() -> None:
    while True:
        for m in engine.tick(time.monotonic()):
            await broadcast("queue_updated", m)
        await asyncio.sleep(TICK_S)
