# API de AstroHealth

FastAPI + WebSocket. Contexto y contrato completos en `../CLAUDE.md` y `CLAUDE.md`.

## Correr (PowerShell)

```powershell
cd api
python -m venv venv                 # solo la primera vez
venv\Scripts\activate               # si marca permisos: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
pip install -r requirements.txt
Copy-Item .env.example .env         # y pon tu contraseña de Postgres
uvicorn main:app --reload --host 0.0.0.0 --port 8000
pytest                              # antes de cada merge a dev
```

- Docs interactivas: http://localhost:8000/docs
- La API **arranca sin Postgres**: sin `DATABASE_URL` todo vive en memoria y se pierde al reiniciar.
- **Con PostgreSQL** (`DATABASE_URL` en `.env`): al arrancar crea las tablas, siembra la tripulación y los entornos, y
  restaura mediciones, líneas base, alertas, fichas y pares de validación. `GET /health` dice `"base_de_datos": true`.

```powershell
psql -U postgres -c "CREATE DATABASE astrohealth;"   # una vez
python -m app.seed --dias 30 --fichas-demo           # llena la base para la demo (dato de demo marcado)
python -m app.seed --reiniciar --dias 30             # vuelve a cargar lo simulado; lo real del equipo se queda
```

## Lo que ya funciona (Back 2)

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/health` | Vivo + número de clientes WebSocket |
| GET | `/alerts?astronauta_id=` | `{activas, resueltas}` |
| GET | `/alerts/{id}` | Una alerta |
| POST | `/alerts/{id}/ack` | Atendida; descongela la línea base |
| POST | `/alerts/{id}/escalate` | A la cola hacia Tierra (idempotente) |
| GET, POST | `/queue` | Cola con prioridad, estado, `progreso` (0 a 1) y `eta_s` |
| GET, PUT | `/environment` | Entorno activo (`iss`, `luna`, `nave`, `marte`); PUT `{"id": "marte"}` |
| GET | `/simulation?env=nave&day=120` | Hueso, radiación, retraso y riesgo (capa `sim`) |
| POST | `/demo/advance` | `{"dias": 1}` avanza el reloj de misión |
| GET | `/demo` | Día actual, si corre y de dónde salen los datos |
| POST | `/demo/start`, `/demo/stop`, `/demo/reset` | Reloj acelerado (1 día cada 5 s) |
| WS | `/ws` | Eventos `{"event", "data"}`; manda `ping` y responde `pong` |

Eventos que emite Back 2: `alert_raised`, `alert_updated`, `queue_updated`, `environment_changed`, `demo_tick`.

### Para Front 2

Mientras Back 1 no tenga su simulador, `/demo/start` corre un **guion de respaldo** (`app/triage/guion.py`) que emite **todos** los eventos del contrato, incluidos `measurement_added`, `calibration_changed` y `status_changed`, con `"fuente": "guion_back2"`. Sigue el guion de `docs/motor.md`: A1 con deuda de sueño (alerta el día 23, se resuelve el 26) y A3 con síntomas inmunes (amarilla el 27, roja y escalada a Tierra el 29).

### Para Back 1: puntos de integración

```python
from app.triage import handle_anomalies, resolver, esta_congelada, registrar_persistor
from app.schemas.anomaly import Anomaly
from app.core.ws import broadcast
from app.core.db import Base, get_db
```

1. En `POST /measurements`, después de `evaluate(...)`:
   `await handle_anomalies(astronauta_id, anomalias, dia_mision=dia)`. Decide el nivel, crea o actualiza la alerta, congela la línea base y emite `alert_raised`.
2. Cuando una señal vuelve a su normal: `await resolver(astronauta_id, senal)`.
3. En `update_baseline()`: si `esta_congelada(astronauta_id, tipo)`, no actualices. Cuando exista la tabla `baselines`, registra `registrar_persistor(fn)` con `fn(astronauta_id, tipo, congelada)` para que se guarde en la base.
4. Modo demo: publica `async def correr_dia(dia_mision: int) -> list[str]` en `app/simulator/__init__.py`. `/demo/advance` lo detecta solo y deja de usar el guion de respaldo.
5. Tus routers se registran en `main.py` (ya hay un comentario marcando el lugar).
