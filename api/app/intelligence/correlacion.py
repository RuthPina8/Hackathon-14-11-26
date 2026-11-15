"""Inteligencia contextual: cambios concurrentes en desempeño funcional y ambiente.

Regla del MVP (sin entrenar modelos):
    si existe un cambio funcional (sesión con 20% o más de baja contra tu normal y buena calidad)
    Y existe un cambio ambiental (alguna variable fuera de rango)
    Y ambos caen en la misma ventana de tiempo (VENTANA a cada lado de la sesión)
    -> observación contextual.

La correlación temporal NO demuestra causalidad: la observación lo dice explícitamente y
recomienda revisar y repetir, nunca afirma que el ambiente causó el cambio.
Funciones puras: reciben sesiones y lecturas, regresan la observación o None.
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta

from app.schemas.movement import Sesion
from app.schemas.telemetry import Lectura

VENTANA = timedelta(hours=2)
MIN_LECTURAS_FUERA = 2  # una sola lectura fuera de rango puede ser ruido


@dataclass
class Hallazgo:
    sesion_id: int
    desde: datetime
    hasta: datetime
    variables: dict[str, dict]  # var -> {max, min, rango, n_fuera}
    lecturas_usadas: int
    lecturas_fuera: int
    escenario: str | None
    acciones: list[str] = field(default_factory=list)


def evaluar(sesion: Sesion, lecturas: list[Lectura], rangos: dict[str, tuple[float | None, float | None]]) -> Hallazgo | None:
    if sesion.comparacion.estado != "bajo" or sesion.practica:
        return None
    desde, hasta = sesion.fecha - VENTANA, sesion.fecha + VENTANA
    en_ventana = [x for x in lecturas if desde <= x.fecha <= hasta]
    fuera = [x for x in en_ventana if x.fuera_de_rango]
    if len(fuera) < MIN_LECTURAS_FUERA:
        return None

    variables: dict[str, dict] = {}
    for x in fuera:
        for var in x.fuera_de_rango:
            v = getattr(x, var)
            d = variables.setdefault(var, {"max": v, "min": v, "rango": rangos.get(var), "n_fuera": 0})
            d["max"], d["min"], d["n_fuera"] = max(d["max"], v), min(d["min"], v), d["n_fuera"] + 1

    acciones = ["Repeat the functional assessment under controlled conditions once the environment is back in range"]
    if "co2_ppm" in variables or "o2_pct" in variables:
        acciones.append("Check the module’s ventilation and life support; rest in a well-ventilated area")
    if "temp_c" in variables or "humedad_pct" in variables:
        acciones.append("Hydrate and avoid intense effort until temperature and humidity return to normal")
    if "radiacion_msv_dia" in variables:
        acciones.append("Follow the solar event shelter protocol and log your dose")

    escenarios = [x.escenario for x in fuera if x.escenario]
    return Hallazgo(
        sesion_id=sesion.id, desde=min(x.fecha for x in fuera), hasta=max(x.fecha for x in fuera),
        variables=variables, lecturas_usadas=len(en_ventana), lecturas_fuera=len(fuera),
        escenario=escenarios[-1] if escenarios else None, acciones=acciones,
    )
