"""GET /crew: semáforo de cada tripulante para el panel del comandante y de Tierra (Back 1).

Privacidad por rol: el comandante solo ve el semáforo; el detalle (ritmo, PERCLOS, presión,
ánimo) es la vista de los flight surgeons. Las dos vistas salen de aquí y el front decide.
"""

from fastapi import APIRouter

from app.models.memoria import almacen
from app.models.persistencia import TRIPULACION
from app.routers.status import construir_estado
from app.schemas.measurements import CrewMemberOut
from app.triage import alerts as triage

router = APIRouter(prefix="/crew", tags=["tripulación"])

_ORDEN = {"sin_datos": 0, "verde": 1, "amarillo": 2, "rojo": 3}


def _miembro(astro: int, nombre: str, rol: str) -> CrewMemberOut:
    mediciones = almacen.listar(astro)
    if not mediciones:
        return CrewMemberOut(astronauta_id=astro, nombre=nombre, rol=rol, estado="sin_datos")
    estado = construir_estado(astro)
    peor = max((s.estado for s in estado.sistemas.values()), key=lambda e: _ORDEN[e], default="sin_datos")
    activas = triage.listar(astro).activas
    if any(a.nivel == "roja" for a in activas):
        peor = "rojo"
    elif activas and _ORDEN[peor] < 2:
        peor = "amarillo"
    ultimos = almacen.ultimos(astro)

    def fmt(tipo: str, f: str) -> str | None:
        m = ultimos.get(tipo)
        return f.format(m.valor) if m else None

    sis, dia = ultimos.get("presion_sis"), ultimos.get("presion_dia")
    return CrewMemberOut(
        astronauta_id=astro, nombre=nombre, rol=rol, estado=peor, readiness=estado.readiness,
        ultimo=max(m.fecha for m in mediciones),
        ultimo_dia=max((m.dia_mision for m in mediciones if m.dia_mision is not None), default=None),
        ritmo=fmt("hr_reposo", "{:.0f} lpm"), perclos=fmt("perclos", "{:.2f}"),
        presion=f"{sis.valor:.0f}/{dia.valor:.0f}" if sis and dia else None,
        animo=fmt("animo", "{:.0f} de 5"),
        alertas_activas=len(activas),
        dato_demo=any(m.fuente == "simulador" for m in mediciones),
    )


@router.get("", response_model=list[CrewMemberOut])
def ver_tripulacion():
    return [_miembro(i, nombre, rol) for i, nombre, rol in TRIPULACION]
