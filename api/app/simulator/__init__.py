"""Simulador de la misión para el modo demo (docs/motor.md §8).

`/demo/advance` (Back 2) detecta `correr_dia` y deja de usar su guion de respaldo. Cada día genera
las mediciones de los 4 astronautas y las manda por el MISMO pipeline de POST /measurements, así
que todo lo que se ve en la demo pasa por la línea base, los detectores y el triage reales.

Todo sale con `fuente="simulador"` (la UI lo marca como "dato de demo") y conserva la `capa` que
tendría si fuera real.
"""

from app.models.memoria import almacen
from app.routers import measurements
from app.schemas.measurements import MedicionIn
from app.simulator.generador import ULTIMO_DIA, dia
from app.triage import alerts as triage

DIA_ESCALAR_A3 = 29


async def correr_dia(dia_mision: int) -> list[str]:
    if dia_mision <= 1:
        # /demo/reset de Back 2 limpia alertas y cola; aquí se borra lo que generó el simulador.
        # Las mediciones reales del equipo (línea base en Tierra) se conservan.
        almacen.reiniciar_demo()
        measurements.reset()
    filas = dia(dia_mision)
    for f in filas:
        f["fecha"] = measurements.fecha_de_dia(dia_mision, ULTIMO_DIA)
    r = await measurements.procesar([MedicionIn(**f) for f in filas])
    eventos = [f"measurement_added x{r.guardadas}"]
    if r.alerta_id is not None:
        eventos.append(f"alerta {r.alerta_id}")
    if dia_mision == DIA_ESCALAR_A3:
        # Guion: A3 ve su alerta roja y la escala a Tierra (en la app lo hace con el botón "Escalar")
        for a in triage.listar(3).activas:
            if a.nivel == "roja" and a.mensaje_cola_id is None:
                await triage.escalate(a.id, nota="Guion de la demo: A3 escala a Tierra")
                eventos.append(f"alerta {a.id} escalada a Tierra")
    return eventos


__all__ = ["correr_dia", "dia"]
