"""Ciclo de vida de las alertas.

    activa ──ack──> atendida ──(señal vuelve a la normal)──> resuelta
      │                                                       ▲
      └──escalate──> escalada ────────────────────────────────┘

- Al levantarse: congela la línea base de las señales involucradas y emite `alert_raised`.
- Si llega otra anomalía de la misma señal con la alerta abierta, se actualiza
  (no se duplica). Si sube de nivel, vuelve a `activa` y emite `alert_raised` otra vez.
- ack: descongela la línea base. escalate: manda un mensaje a la cola hacia Tierra.

Por ahora vive en memoria. Cuando Back 1 cree la tabla `alerts`, solo cambia `_Store`.
"""

from datetime import datetime, timezone

from app.core.umbrales import PRIORIDAD_COLA
from app.core.ws import broadcast
from app.schemas.alerts import Alert, AlertList
from app.schemas.anomaly import Anomaly
from app.triage import baseline, rules
from app.triage.queue import engine as queue_engine


class AlertError(Exception):
    def __init__(self, status: int, detalle: str) -> None:
        super().__init__(detalle)
        self.status = status
        self.detalle = detalle


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


class _Store:
    def __init__(self) -> None:
        self.alertas: dict[int, Alert] = {}
        self.senales: dict[int, list[str]] = {}
        self._sig = 1

    def nuevo_id(self) -> int:
        i = self._sig
        self._sig += 1
        return i

    def abierta(self, astronauta_id: int, senales: str | list[str]) -> Alert | None:
        """Alerta no resuelta del astronauta que comparta alguna señal.

        Primero la que tenga una de esas señales como principal; si no, cualquiera que
        la incluya entre sus señales. Así no se duplica si la principal cambia entre lecturas.
        """
        buscadas = {senales} if isinstance(senales, str) else set(senales)
        abiertas = [
            a for a in self.alertas.values() if a.astronauta_id == astronauta_id and a.estado != "resuelta"
        ]
        for a in abiertas:
            if a.senal in buscadas:
                return a
        for a in abiertas:
            if buscadas & set(self.senales.get(a.id, [])):
                return a
        return None

    def reset(self) -> None:
        self.__init__()


store = _Store()


def obtener(alerta_id: int) -> Alert:
    if alerta_id not in store.alertas:
        raise AlertError(404, f"No existe la alerta {alerta_id}")
    return store.alertas[alerta_id]


def listar(astronauta_id: int | None = None) -> AlertList:
    todas = sorted(store.alertas.values(), key=lambda a: a.actualizada, reverse=True)
    if astronauta_id is not None:
        todas = [a for a in todas if a.astronauta_id == astronauta_id]
    return AlertList(
        activas=[a for a in todas if a.estado != "resuelta"],
        resueltas=[a for a in todas if a.estado == "resuelta"],
    )


async def handle_anomalies(
    astronauta_id: int,
    anomalias: list[Anomaly],
    dia_mision: int | None = None,
    fase: rules.Fase | None = None,
) -> Alert | None:
    """Entrada desde el motor de Back 1. Regresa la alerta creada o actualizada, o None."""
    decision = rules.evaluar(anomalias, fase or rules.fase_de_dia(dia_mision))
    if decision is None:
        return None

    ahora = _ahora()
    existente = store.abierta(astronauta_id, decision.senales)

    if existente:
        subio = rules.max_nivel(existente.nivel, decision.nivel) != existente.nivel
        cambios = {
            # La señal principal sigue a la anomalía de esta lectura: así el título de la alerta
            # (que sale de `senal`) coincide con `que_cambio` y `cuanto`, que también se actualizan.
            # Las señales anteriores siguen en store.senales, así que resolver() la encuentra igual.
            "senal": decision.senal,
            "nivel": rules.max_nivel(existente.nivel, decision.nivel),
            "factores": decision.factores,
            "cuanto": decision.cuanto,
            "que_cambio": decision.que_cambio,
            "detectores": sorted(set(existente.detectores) | set(decision.detectores)),
            "dia_mision": dia_mision if dia_mision is not None else existente.dia_mision,
            "actualizada": ahora,
        }
        if subio and existente.estado == "atendida":
            cambios["estado"] = "activa"
        alerta = existente.model_copy(update=cambios)
        store.alertas[alerta.id] = alerta
        nuevas = set(decision.senales) - set(store.senales.get(alerta.id, []))
        store.senales[alerta.id] = list(dict.fromkeys(store.senales.get(alerta.id, []) + decision.senales))
        if alerta.estado != "atendida":
            for s in nuevas:
                baseline.congelar(astronauta_id, s)
        await broadcast("alert_raised" if subio else "alert_updated", alerta)
        return alerta

    alerta = Alert(
        id=store.nuevo_id(),
        astronauta_id=astronauta_id,
        nivel=decision.nivel,
        senal=decision.senal,
        que_cambio=decision.que_cambio,
        cuanto=decision.cuanto,
        desde=decision.desde,
        factores=decision.factores,
        detectores=decision.detectores,
        dia_mision=dia_mision,
        creada=ahora,
        actualizada=ahora,
    )
    store.alertas[alerta.id] = alerta
    store.senales[alerta.id] = decision.senales
    for s in decision.senales:
        baseline.congelar(astronauta_id, s)
    await broadcast("alert_raised", alerta)
    return alerta


def _descongelar(alerta: Alert) -> None:
    for s in store.senales.get(alerta.id, [alerta.senal]):
        baseline.descongelar(alerta.astronauta_id, s)


async def ack(alerta_id: int, nota: str | None = None) -> Alert:
    alerta = obtener(alerta_id)
    if alerta.estado == "resuelta":
        raise AlertError(409, "La alerta ya está resuelta")
    if alerta.estado == "atendida":
        return alerta
    ahora = _ahora()
    alerta = alerta.model_copy(update={"estado": "atendida", "atendida": ahora, "actualizada": ahora})
    store.alertas[alerta.id] = alerta
    _descongelar(alerta)
    await broadcast("alert_updated", alerta)
    return alerta


async def escalate(alerta_id: int, nota: str | None = None) -> Alert:
    alerta = obtener(alerta_id)
    if alerta.estado == "resuelta":
        raise AlertError(409, "La alerta ya está resuelta")
    if alerta.mensaje_cola_id is not None:
        return alerta  # idempotente: ya va hacia Tierra
    mensaje = queue_engine.encolar(
        tipo="alerta",
        prioridad=PRIORIDAD_COLA[alerta.nivel],
        tamano=2.0 + 0.5 * len(alerta.factores),
        payload={
            "alerta_id": alerta.id,
            "astronauta_id": alerta.astronauta_id,
            "nivel": alerta.nivel,
            "senal": alerta.senal,
            "que_cambio": alerta.que_cambio,
            "factores": alerta.factores,
            "nota": nota,
        },
    )
    alerta = alerta.model_copy(
        update={"estado": "escalada", "mensaje_cola_id": mensaje.id, "actualizada": _ahora()}
    )
    store.alertas[alerta.id] = alerta
    await broadcast("alert_updated", alerta)
    await broadcast("queue_updated", queue_engine.vista(mensaje))
    return alerta


async def resolver(astronauta_id: int, senal: str) -> Alert | None:
    """Back 1 lo llama cuando la señal vuelve a su normal. Cierra la alerta abierta, si hay."""
    alerta = store.abierta(astronauta_id, senal)
    if alerta is None:
        return None
    ahora = _ahora()
    alerta = alerta.model_copy(update={"estado": "resuelta", "resuelta": ahora, "actualizada": ahora})
    store.alertas[alerta.id] = alerta
    _descongelar(alerta)
    await broadcast("alert_updated", alerta)
    return alerta


def reset() -> None:
    store.reset()
