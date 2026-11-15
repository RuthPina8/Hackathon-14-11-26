"""WebSocket /ws: lista de clientes y broadcast.

Formato de cada mensaje: {"event": "...", "data": {...}}
Eventos del contrato: measurement_added, status_changed, calibration_changed,
alert_raised, queue_updated. Back 2 agrega: alert_updated, environment_changed, demo_tick.

Uso desde cualquier módulo:
    from app.core.ws import broadcast
    await broadcast("alert_raised", alerta.model_dump(mode="json"))
"""

from typing import Any

from fastapi import WebSocket
from fastapi.encoders import jsonable_encoder


class ConnectionManager:
    def __init__(self) -> None:
        self.clients: set[WebSocket] = set()

    @property
    def count(self) -> int:
        return len(self.clients)

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.clients.add(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self.clients.discard(ws)

    async def broadcast(self, event: str, data: Any) -> None:
        payload = {"event": event, "data": jsonable_encoder(data)}
        for ws in list(self.clients):
            try:
                await ws.send_json(payload)
            except Exception:
                self.clients.discard(ws)


manager = ConnectionManager()


async def broadcast(event: str, data: Any) -> None:
    await manager.broadcast(event, data)
