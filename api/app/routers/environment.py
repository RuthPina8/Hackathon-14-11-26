from fastapi import APIRouter, HTTPException

from app.core.ws import broadcast
from app.entornos.perfiles import activo, cargar_perfiles
from app.schemas.environment import EnvironmentIn, EnvironmentState

router = APIRouter(prefix="/environment", tags=["entorno"])


def _estado() -> EnvironmentState:
    return EnvironmentState(activo=activo.id, perfil=activo.perfil, disponibles=list(cargar_perfiles()))


@router.get("", response_model=EnvironmentState)
def ver_entorno():
    return _estado()


@router.put("", response_model=EnvironmentState)
async def cambiar_entorno(body: EnvironmentIn):
    try:
        activo.cambiar(body.id)
    except KeyError as e:
        raise HTTPException(404, f"Entorno desconocido: {body.id}. Opciones: {list(cargar_perfiles())}") from e
    estado = _estado()
    await broadcast("environment_changed", estado)
    return estado
