import pytest
from fastapi.testclient import TestClient

from app.entornos.perfiles import activo
from app.models.memoria import almacen
from app.triage import alerts, baseline
from app.triage.demo import engine as demo_engine
from app.triage.queue import engine as queue_engine
from main import app


@pytest.fixture(autouse=True)
def estado_limpio():
    alerts.reset()
    almacen.reset()
    baseline.reset()
    queue_engine.reset()
    demo_engine.__init__()
    activo.cambiar("nave")
    yield


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c
