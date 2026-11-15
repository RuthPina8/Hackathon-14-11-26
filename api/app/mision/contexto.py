"""Observaciones contextuales: une ASTRA-MOVE y la telemetría con intelligence/correlacion.py.

Cada sesión de movimiento genera como mucho UNA observación. Se revisa cada vez que llega una
sesión nueva o una lectura nueva (la coincidencia puede completarse después de la sesión).
Emite `mission_correlation` por /ws.
"""

from datetime import datetime, timezone

from app.core.ws import broadcast
from app.intelligence import correlacion
from app.mision.movimiento import movimiento
from app.mision.telemetria import RANGOS, rangos, telemetria
from app.schemas.mission import Observacion, VariableObservada

NOMBRE_EJERCICIO = {"brazos": "elevación de brazos", "sentadilla": "sentadilla controlada"}
CAUSALIDAD = "No se establece causa: el cambio funcional y el ambiental solo coinciden en el tiempo."


class Contexto:
    def __init__(self) -> None:
        self.observaciones: list[Observacion] = []
        self._sig = 1

    def reset(self) -> None:
        self.__init__()

    def ya_tiene(self, sesion_id: int) -> bool:
        return any(o.sesion_id == sesion_id for o in self.observaciones)

    def listar(self, astronauta_id: int | None = None) -> list[Observacion]:
        out = self.observaciones if astronauta_id is None else [o for o in self.observaciones if o.astronauta_id == astronauta_id]
        return sorted(out, key=lambda o: o.creada, reverse=True)


contexto = Contexto()


def _construir(sesion, h: correlacion.Hallazgo) -> Observacion:
    vars_obs = [
        VariableObservada(
            variable=var, nombre=RANGOS[var][0], unidad=RANGOS[var][1],
            minimo_registrado=round(d["min"], 2), maximo_registrado=round(d["max"], 2),
            rango=d["rango"] or (None, None), lecturas_fuera=d["n_fuera"],
        )
        for var, d in h.variables.items()
    ]
    nombres = ", ".join(v.nombre for v in vars_obs)
    ejercicio = NOMBRE_EJERCICIO.get(sesion.ejercicio, sesion.ejercicio)
    confiab = [
        f"Detección del cuerpo en la sesión: {sesion.calidad:.0%}",
        f"Referencia personal: {sesion.comparacion.n_referencia} sesiones anteriores",
        "Telemetría ambiental SIMULADA (escenario de demostración), no proviene de un sensor físico",
    ]
    if sesion.dato_demo:
        confiab.insert(0, "La sesión de movimiento es un dato de demo preparado (plan B), no una medición en vivo")
    return Observacion(
        id=contexto._sig, astronauta_id=sesion.astronauta_id,
        titulo="Cambios concurrentes en desempeño funcional y ambiente",
        texto=("Se detectaron cambios concurrentes en el desempeño funcional y en las condiciones ambientales "
               "durante una ventana temporal similar. Se recomienda revisar las mediciones y repetir la evaluación "
               "en condiciones controladas."),
        causalidad=CAUSALIDAD,
        que_cambio_funcional=f"{ejercicio.capitalize()}: {sesion.comparacion.texto}",
        que_cambio_ambiente=vars_obs, desde=min(h.desde, sesion.fecha), hasta=max(h.hasta, sesion.fecha),
        datos_usados=[
            f"Sesión de movimiento #{sesion.id} ({ejercicio}, {sesion.fuente})",
            f"{h.lecturas_usadas} lecturas ambientales en la ventana de ±{int(correlacion.VENTANA.total_seconds() // 3600)} h, {h.lecturas_fuera} fuera de rango ({nombres})",
            f"Tu línea base de {sesion.comparacion.referencia_reps} repeticiones",
        ],
        confiabilidad=confiab, acciones=h.acciones, sesion_id=sesion.id, creada=datetime.now(timezone.utc),
    )


async def revisar() -> list[Observacion]:
    nuevas = []
    lim = {r.variable: (r.minimo, r.maximo) for r in rangos()}
    for sesion in movimiento.sesiones:
        if contexto.ya_tiene(sesion.id):
            continue
        h = correlacion.evaluar(sesion, telemetria.lecturas, lim)
        if h is None:
            continue
        obs = _construir(sesion, h)
        contexto._sig += 1
        contexto.observaciones.append(obs)
        nuevas.append(obs)
        await broadcast("mission_correlation", obs)
    return nuevas
