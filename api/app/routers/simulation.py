from fastapi import APIRouter, HTTPException, Query

from app.entornos import proyeccion
from app.entornos.perfiles import activo, cargar_perfiles, obtener
from app.schemas.simulation import Simulation

router = APIRouter(prefix="/simulation", tags=["simulación"])


@router.get("", response_model=Simulation)
def simular(
    env: str | None = Query(default=None, description="iss, luna, nave or marte; empty = active environment"),
    day: int = Query(default=120, ge=0, le=1500),
):
    """Proyección (capa sim) de pérdida ósea, radiación, retraso y riesgo al día `day`."""
    try:
        perfil = obtener(env) if env else activo.perfil
    except KeyError as e:
        raise HTTPException(404, f"Unknown environment: {env}. Options: {list(cargar_perfiles())}") from e
    return proyeccion.simular(perfil, day)
