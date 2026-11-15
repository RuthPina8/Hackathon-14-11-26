"""Punto de arranque de la API de AstroHealth (Back 2).

Correr:  uvicorn main:app --reload --host 0.0.0.0 --port 8000
Docs:    http://localhost:8000/docs
"""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.ws import manager
from app.routers import alerts, demo, environment, indicators, measurements, queue, simulation, status
from app.triage import demo as demo_engine
from app.triage import queue as queue_engine


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Tareas de fondo: la cola avanza sola y el modo demo corre cuando se activa
    tasks = [
        asyncio.create_task(queue_engine.run_forever()),
        asyncio.create_task(demo_engine.run_forever()),
    ]
    yield
    for t in tasks:
        t.cancel()


app = FastAPI(
    title="AstroHealth API",
    description="Monitoreo de salud para astronautas. REST para los datos y WebSocket en /ws.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers de Back 2
app.include_router(alerts.router)
app.include_router(queue.router)
app.include_router(environment.router)
app.include_router(simulation.router)
app.include_router(demo.router)

# Routers de Back 1 (versión mínima en memoria para integrar el front; faltan rppg e ingest)
app.include_router(measurements.router)
app.include_router(status.router)
app.include_router(indicators.router)


@app.get("/health", tags=["sistema"])
def health():
    return {"ok": True, "ws_clientes": manager.count}


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await manager.connect(ws)
    try:
        while True:
            msg = await ws.receive_text()
            if msg == "ping":
                await ws.send_json({"event": "pong", "data": {}})
    except WebSocketDisconnect:
        manager.disconnect(ws)
