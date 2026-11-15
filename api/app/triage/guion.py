"""Guion de respaldo para el modo demo mientras el simulador de Back 1 no existe.

Sigue el guion corto de docs/motor.md (sección 8) para que Front 2 pueda ver
TODOS los eventos del WebSocket desde ya. Todo lo que emite lleva
`"fuente": "guion_back2"` para que la UI lo marque como dato de demo.

Cuando Back 1 publique `app.simulator.correr_dia`, el modo demo usa eso y este
archivo deja de usarse.
"""

import random
from datetime import datetime, timedelta, timezone

from app.core.ws import broadcast
from app.schemas.anomaly import Anomaly
from app.triage import alerts
from app.triage.queue import engine as queue_engine

FIN = 32
ASTRONAUTAS = {1: "A1", 2: "A2", 3: "A3", 4: "A4"}
FUENTE = "guion_back2"

# Síntomas autorreportados de A3 por día (clave e intensidad 1 a 3, catálogo de motor.md §5)
SINTOMAS_A3: dict[int, list[dict]] = {
    25: [{"clave": "congestion", "intensidad": 1}],
    26: [{"clave": "congestion", "intensidad": 2}],
    27: [{"clave": "congestion", "intensidad": 2}, {"clave": "fuego_labial", "intensidad": 1}],
    28: [{"clave": "congestion", "intensidad": 2}, {"clave": "fuego_labial", "intensidad": 2},
         {"clave": "fiebre", "intensidad": 1}],
    29: [{"clave": "congestion", "intensidad": 2}, {"clave": "fuego_labial", "intensidad": 2},
         {"clave": "fiebre", "intensidad": 2}],
}

# Color inmune que darían las reglas de immune.py con esos síntomas
GUION_INMUNE_A3: dict[int, tuple[str, str]] = {
    27: ("amarilla", "Congestión 3 días seguidos y fuego labial: 2 categorías inmunes el mismo día"),
    28: ("amarilla", "Se suma fiebre a la congestión y el fuego labial; vigila tu temperatura"),
    29: ("roja", "Fiebre 2 días seguidos con congestión y fuego labial: posible reactivación viral"),
}


def _fecha_dia(dia: int) -> datetime:
    hoy = datetime.now(timezone.utc).replace(hour=8, minute=0, second=0, microsecond=0)
    return hoy - timedelta(days=FIN - dia)


async def _medicion(astro: int, dia: int, tipo: str, valor: float, unidad: str, capa: str = "real") -> None:
    await broadcast(
        "measurement_added",
        {
            "astronauta_id": astro,
            "tipo": tipo,
            "valor": round(valor, 2),
            "unidad": unidad,
            "capa": capa,
            "fuente": FUENTE,
            "confianza": 0.9,
            "dia_mision": dia,
            "fecha": _fecha_dia(dia),
        },
    )


async def correr_dia(dia: int, calibracion_previa: list[float]) -> list[str]:
    rng = random.Random(dia)
    eventos: list[str] = []

    # Mediciones diarias de todos
    for astro in ASTRONAUTAS:
        hr = 64 + rng.gauss(0, 2) + (6 if astro == 1 and 18 <= dia <= 23 else 0)
        sueno = 7.2 + rng.gauss(0, 0.4)
        if astro == 1 and 18 <= dia <= 22:
            sueno = 5.2 + rng.gauss(0, 0.2)
        await _medicion(astro, dia, "hr_reposo", hr, "lpm")
        await _medicion(astro, dia, "sueno_horas", sueno, "h", capa="auto")
    eventos.append("measurement_added x8")

    # Calibración: sube en la adaptación hasta ~64%
    antes = calibracion_previa[0]
    despues = min(64.0, antes + 1.8) if dia <= 14 else min(80.0, antes + 0.5)
    if despues - antes >= 0.5:
        calibracion_previa[0] = despues
        await broadcast(
            "calibration_changed",
            {"antes": round(antes, 1), "despues": round(despues, 1), "delta": round(despues - antes, 1), "fuente": FUENTE},
        )
        eventos.append("calibration_changed")

    if dia == 15:
        await broadcast("status_changed", {"fase": "personal", "texto": "Empieza la fase personal", "fuente": FUENTE})
        eventos.append("status_changed: fase personal")

    # A1: deuda de sueño -> alerta el día 23
    if dia == 23:
        desde = _fecha_dia(18)
        await alerts.handle_anomalies(
            1,
            [
                Anomaly(senal="sueno_horas", detector="sueno", valor=5.2, referencia=7.2, z=-2.6,
                        desde=desde, direccion="baja", capa="auto", fuente=FUENTE,
                        texto="Llevas 5 noches durmiendo menos de 6 h"),
                Anomaly(senal="hr_reposo", detector="cusum", valor=70, referencia=64, z=2.2,
                        desde=desde, direccion="sube", fuente=FUENTE),
            ],
            dia_mision=dia,
        )
        await broadcast("status_changed", {"astronauta_id": 1, "readiness": 71, "sistemas": {"sueno": "amarillo", "cardiovascular": "amarillo"}, "fuente": FUENTE})
        eventos.append("alert_raised: A1 sueño")

    if dia == 26:
        await alerts.resolver(1, "sueno_horas")
        await broadcast("status_changed", {"astronauta_id": 1, "readiness": 86, "sistemas": {"sueno": "verde", "cardiovascular": "verde"}, "fuente": FUENTE})
        eventos.append("alerta resuelta: A1 descansó")

    # A3 (docs/motor.md, secciones 5 y 8): congestión desde el 25, fuego labial desde el 27,
    # fiebre el 28 y el 29. Amarillo el 27 (congestión 3 días seguidos y 2 categorías el mismo
    # día); el 28 sigue amarillo (fiebre un día); rojo el 29 (fiebre 2 días seguidos con otro
    # síntoma inmune) -> escalar a Tierra. Sin fiebre nunca llega a rojo.
    if 25 <= dia <= 29:
        sintomas = SINTOMAS_A3[dia]
        await broadcast(
            "measurement_added",
            {
                "astronauta_id": 3,
                "tipo": "sintomas",
                "valor": len(sintomas),
                "unidad": "conteo",
                "capa": "auto",
                "fuente": FUENTE,
                "confianza": 1.0,
                "dia_mision": dia,
                "fecha": _fecha_dia(dia),
                "detalle": {"sintomas": sintomas},
            },
        )
        eventos.append("measurement_added: síntomas A3")

    if dia in GUION_INMUNE_A3:
        nivel, texto = GUION_INMUNE_A3[dia]
        alerta = await alerts.handle_anomalies(
            3,
            [Anomaly(senal="inmune", detector="inmune", nivel_sugerido=nivel, capa="auto",
                     fuente=FUENTE, desde=_fecha_dia(25), texto=texto)],
            dia_mision=dia,
        )
        if alerta and nivel == "roja":
            await alerts.escalate(alerta.id, nota="Escalada automática del guion de demo")
            eventos.append("alert_raised: A3 inmune rojo + escalada a Tierra")
        else:
            eventos.append(f"alerta A3 inmune {nivel}")

    if dia == 30:
        await broadcast("status_changed", {"animo_camara": {"estado": "activo", "acierto_pct": 78, "n": 12}, "fuente": FUENTE})
        eventos.append("status_changed: modelo de ánimo activo")

    # Reporte semanal a Tierra
    if dia % 7 == 0:
        m = queue_engine.encolar("reporte", 3, 6.0, {"dia_mision": dia, "texto": f"Reporte semanal día {dia}"})
        await broadcast("queue_updated", queue_engine.vista(m))
        eventos.append("queue_updated: reporte semanal")

    return eventos
