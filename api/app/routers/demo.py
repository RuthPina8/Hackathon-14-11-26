from fastapi import APIRouter

from app.schemas.demo import DemoAdvanceIn, DemoAdvanceOut, DemoStartIn, DemoState
from app.triage.demo import engine

router = APIRouter(prefix="/demo", tags=["demo"])


@router.get("", response_model=DemoState)
def estado_demo():
    return engine.estado()


@router.post("/advance", response_model=DemoAdvanceOut)
async def avanzar(body: DemoAdvanceIn | None = None):
    """Avanza el tiempo simulado `dias` días (1 por defecto) y emite los eventos por /ws."""
    return await engine.avanzar(body.dias if body else 1)


@router.post("/start", response_model=DemoState)
def iniciar(body: DemoStartIn | None = None):
    """Arranca el reloj acelerado (por defecto 1 día cada 5 s)."""
    if body and body.segundos_por_dia:
        engine.segundos_por_dia = body.segundos_por_dia
    engine.corriendo = True
    return engine.estado()


@router.post("/stop", response_model=DemoState)
def detener():
    engine.corriendo = False
    return engine.estado()


@router.post("/reset", response_model=DemoState)
async def reiniciar():
    """Regresa al día 0 y limpia alertas, cola y líneas base congeladas."""
    return await engine.reset()
