from fastapi import APIRouter, HTTPException

from app.schemas.alerts import AckIn, Alert, AlertList, EscalateIn
from app.triage import alerts as service

router = APIRouter(prefix="/alerts", tags=["alertas"])


@router.get("", response_model=AlertList)
def listar_alertas(astronauta_id: int | None = None):
    """Alertas activas (activa, atendida, escalada) y resueltas, las más recientes primero."""
    return service.listar(astronauta_id)


@router.get("/{alerta_id}", response_model=Alert)
def obtener_alerta(alerta_id: int):
    try:
        return service.obtener(alerta_id)
    except service.AlertError as e:
        raise HTTPException(e.status, e.detalle) from e


@router.post("/{alerta_id}/ack", response_model=Alert)
async def atender_alerta(alerta_id: int, body: AckIn | None = None):
    """Marca la alerta como atendida y descongela la línea base de sus señales."""
    try:
        return await service.ack(alerta_id, body.nota if body else None)
    except service.AlertError as e:
        raise HTTPException(e.status, e.detalle) from e


@router.post("/{alerta_id}/escalate", response_model=Alert)
async def escalar_alerta(alerta_id: int, body: EscalateIn | None = None):
    """Manda la alerta a la cola hacia Tierra (idempotente)."""
    try:
        return await service.escalate(alerta_id, body.nota if body else None)
    except service.AlertError as e:
        raise HTTPException(e.status, e.detalle) from e
