from fastapi import APIRouter

from app.core.ws import broadcast
from app.schemas.queue import QueueIn, QueueMessage, QueueState
from app.triage.queue import engine

router = APIRouter(prefix="/queue", tags=["cola"])


@router.get("", response_model=QueueState)
def ver_cola():
    """Mensajes hacia Tierra con prioridad, estado, progreso y ETA."""
    return engine.estado()


@router.post("", response_model=QueueMessage, status_code=201)
async def encolar(body: QueueIn):
    """Encola un mensaje manual (por ejemplo, un reporte)."""
    m = engine.encolar(body.tipo, body.prioridad, body.tamano, body.payload)
    m = engine.vista(m)
    await broadcast("queue_updated", m)
    return m
