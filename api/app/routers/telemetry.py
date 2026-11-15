from fastapi import APIRouter, Query

from app.mision import telemetria as mod
from app.mision.telemetria import telemetria
from app.schemas.telemetry import Lectura, SimularIn, TelemetriaEstado, TelemetriaIn

router = APIRouter(prefix="/telemetry", tags=["ambiente"])


@router.post("", response_model=Lectura, status_code=201)
async def registrar(body: TelemetriaIn):
    """Registra una lectura ambiental (para un sensor real, mandar capa="real" y su fuente)."""
    lectura = telemetria.registrar(body)
    await mod.publicar(lectura)
    return lectura


@router.get("/latest", response_model=TelemetriaEstado)
def ultima():
    """Última lectura, escenario activo y rangos del escenario de demostración."""
    return telemetria.estado()


@router.get("/history", response_model=list[Lectura])
def historial(limite: int = Query(default=120, ge=1, le=600)):
    return telemetria.lecturas[-limite:]


@router.post("/simulate", response_model=TelemetriaEstado)
async def simular(body: SimularIn):
    """Activa un escenario de demo: estable, cambio o revision. Las lecturas siguientes se acercan a él."""
    telemetria.escenario = body.escenario
    await mod.publicar(telemetria.simular_lectura())
    return telemetria.estado()
