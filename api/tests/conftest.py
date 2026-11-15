import pytest
from fastapi.testclient import TestClient

from app.core.config import settings

# Las pruebas nunca tocan la base real aunque api/.env tenga DATABASE_URL
settings.database_url = ""

from app.entornos.perfiles import activo  # noqa: E402
from app.models.clinico import clinico  # noqa: E402
from app.models.memoria import almacen  # noqa: E402
from app.triage import alerts, baseline  # noqa: E402
from app.triage.demo import engine as demo_engine  # noqa: E402
from app.triage.queue import engine as queue_engine  # noqa: E402
from main import app  # noqa: E402


@pytest.fixture(autouse=True)
def estado_limpio():
    alerts.reset()
    almacen.reset()
    clinico.reset()
    baseline.reset()
    queue_engine.reset()
    demo_engine.__init__()
    activo.cambiar("nave")
    yield


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c
