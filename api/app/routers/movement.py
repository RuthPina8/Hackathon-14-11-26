from fastapi import APIRouter, HTTPException, Query

from app.core.ws import broadcast
from app.mision import contexto
from app.mision.movimiento import movimiento
from app.schemas.movement import DemoMovimientoIn, Sesion, SesionIn

router = APIRouter(prefix="/movement", tags=["ASTRA-MOVE"])


@router.post("/sessions", response_model=Sesion, status_code=201)
async def guardar(body: SesionIn):
    """Guarda una sesión de ASTRA-MOVE y la compara contra tu línea base."""
    sesion = movimiento.registrar(body)
    await broadcast("movement_recorded", sesion)
    await contexto.revisar()
    return sesion


@router.get("/latest", response_model=Sesion)
def ultima(astronauta_id: int = 1):
    s = movimiento.ultima(astronauta_id)
    if s is None:
        raise HTTPException(404, "Todavía no hay sesiones de movimiento")
    return s


@router.get("/history", response_model=list[Sesion])
def historial(astronauta_id: int = 1, ejercicio: str | None = None, limite: int = Query(default=30, ge=1, le=200)):
    return movimiento.historial(astronauta_id, ejercicio)[:limite]


@router.post("/demo", response_model=list[Sesion], status_code=201)
async def demo(body: DemoMovimientoIn):
    """Plan B: carga sesiones preparadas (marcadas como dato de demo). linea_base = 3 sesiones normales; descenso = 1 sesión baja."""
    sesiones = movimiento.cargar_demo(body.tipo, body.astronauta_id, body.ejercicio)
    for s in sesiones:
        await broadcast("movement_recorded", s)
    await contexto.revisar()
    return sesiones
