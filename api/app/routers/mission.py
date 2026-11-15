from fastapi import APIRouter

from app.entornos.perfiles import activo
from app.mision.contexto import contexto
from app.mision.movimiento import movimiento
from app.mision.telemetria import NOTA, rangos, telemetria
from app.schemas.mission import ContextoMision
from app.triage.demo import engine as demo_engine

router = APIRouter(prefix="/mission", tags=["inteligencia contextual"])


@router.get("/context", response_model=ContextoMision)
def contexto_mision(astronauta_id: int = 1):
    """Estado funcional, ambiente y observaciones contextuales en una sola respuesta."""
    return ContextoMision(
        dia_mision=max(demo_engine.dia, 1), astronauta_id=astronauta_id, entorno=activo.perfil.nombre,
        funcional=movimiento.ultima(astronauta_id), ambiente=telemetria.ultima(), escenario=telemetria.escenario,
        rangos=rangos(), observaciones=contexto.listar(astronauta_id), nota_ambiente=NOTA,
    )
