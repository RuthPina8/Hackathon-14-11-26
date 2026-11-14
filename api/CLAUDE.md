# api/ — backend de AstroHealth

FastAPI + PostgreSQL. Aquí trabajan Back 1 (datos e inteligencia) y Back 2 (API, triage, comunicación). El contexto general y las decisiones del equipo están en `../CLAUDE.md`.

**Antes de tocar `app/intelligence/`, `app/simulator/` o `app/ingest/`, lee `docs/motor.md`.** Ahí está la especificación de cada algoritmo: rPPG, detectores, sueño, inmune, cámara y modelo de ánimo.

## Comandos (PowerShell)

```powershell
cd api
python -m venv venv                       # solo la primera vez
venv\Scripts\activate                     # si marca permisos, una vez: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
pytest -q                                 # antes de cada merge a dev
alembic revision --autogenerate -m "mensaje"
alembic upgrade head
```

- `api/.env` define `DATABASE_URL=postgresql+psycopg://postgres:...@localhost:5432/astrohealth` y `FRONT_ORIGIN`. Nunca lo subas al repo.
- La base se crea una sola vez: `psql -U postgres -c "CREATE DATABASE astrohealth;"`.
- Si Alembic no existe todavía: corre `alembic init alembic` y, en `alembic/env.py`, usa `DATABASE_URL` y `Base.metadata`.
- Para depurar con breakpoints, usa la configuración "API (uvicorn)" de `.vscode/launch.json`.

## Estructura (acordada con Back 2)

```
api/
  main.py                  # arranque, CORS, /ws, broadcast                     (Back 2)
  app/
    core/                  # config, db, ws; umbrales.py lo editan ambos        (Back 2)
    models/                # SQLAlchemy                                          (Back 1)
    schemas/               # Pydantic del contrato; cambiarlo = avisar          (ambos)
    routers/
      rppg.py measurements.py indicators.py status.py ingest.py                 (Back 1)
      alerts.py queue.py environment.py simulation.py demo.py                   (Back 2)
    intelligence/          # funciones puras: rppg, baseline, detectors, sleep,
                           # immune, mood_model, readiness, calibration          (Back 1)
      modelos/             # .joblib/.onnx pequeños; el motor funciona sin ellos
    ingest/                # Health Auto Export → mediciones                     (Back 1)
    simulator/             # historial sintético desde el día 1                  (Back 1)
    triage/                # reglas de alertas y cola                            (Back 2)
  docs/motor.md            # especificación del motor
  ml/                      # notebooks; la API NO importa de aquí
  tests/
```

**Regla clave:** `app/intelligence/` son funciones puras. Reciben arrays o dataclasses y regresan dataclasses; no importan FastAPI ni la base de datos.

## Frontera entre Back 1 y Back 2

1. `POST /measurements` (Back 1) guarda, actualiza la línea base, corre `evaluate(...)` y emite `measurement_added`, `status_changed` y `calibration_changed`.
2. Las anomalías van a `triage.handle_anomalies(astronauta_id, anomalias)` (Back 2), que decide el nivel, crea la alerta y emite `alert_raised`.
3. Back 2 congela la línea base (`baselines.congelada`). `update_baseline()` **debe respetar `congelada`**.
4. Los umbrales viven en `app/core/umbrales.py`, que comparten el semáforo de `/status` y el triage.

## Modelo de datos

- `astronauts`: id, nombre, entorno, fase_linea_base (`tierra` | `adaptacion` | `personal`), dia_inicio_mision
- `measurements`: id, astronauta_id, tipo, valor, unidad, capa (`real` | `auto` | `sim`), fuente, confianza (0 a 1), fecha, dia_mision, detalle (JSONB)
- `baselines`: astronauta_id, tipo, media, desviacion, n, peso_personal, congelada
- `alerts`: id, astronauta_id, nivel, senal, que_cambio, cuanto, desde, factores (JSONB), estado
- `queue_messages`: id, prioridad, tipo, tamano, payload (JSONB), estado, enviado, entregado
- `environments`: id, perfil (JSONB)

Valores de `fuente`: `camara`, `prueba`, `manual`, `apple_watch`, `simulador`, `modelo`.

- `simulador` es válido para **cualquier** `tipo`, aunque la tabla de abajo solo liste las fuentes reales. El dato conserva la `capa` que tendría si fuera real y la UI lo marca como "dato de demo".
- `measurements` lleva un índice único parcial sobre (`astronauta_id`, `tipo`, `fecha`) donde `fuente = 'apple_watch'`, para que la ingesta no duplique (ver `docs/motor.md`, sección 7).
- Qué tipos pasan por los detectores estadísticos está en `docs/motor.md`, sección 3.

### Lista cerrada de `tipo`

| tipo | unidad | capa | fuente | Dirección "mala" | Sistema |
|---|---|---|---|---|---|
| `hr_reposo` | lpm | real | camara, apple_watch | sube (o baja mucho) | Cardiovascular |
| `hrv_rmssd` (experimental) | ms | real | camara | baja | Cardiovascular / estrés |
| `hrv_sdnn` | ms | real | apple_watch (HealthKit usa SDNN) | baja | Cardiovascular / estrés |
| `resp_rpm` (experimental) | resp/min | real | camara | ambas | Cardiovascular |
| `presion_sis`, `presion_dia` | mmHg | auto | manual, simulador | sube | Cardiovascular |
| `perclos` | fracción 0 a 1 (umbral 0.15) | real | camara | sube | Sueño y fatiga |
| `parpadeo_min`, `parpadeo_dur_ms` | /min, ms | real | camara | ambas / sube | Sueño y fatiga |
| `sueno_horas` | h | auto, real | manual, apple_watch | baja | Sueño y fatiga |
| `sueno_eficiencia_pct`, `sueno_latencia_min`, `sueno_waso_min`, `sueno_despertares` | %, min, min, n | auto, real | manual, apple_watch | baja / sube | Sueño y fatiga |
| `sueno_calidad` | 1 a 5 | auto | manual | baja | Sueño y fatiga |
| `sueno_medicamento` | 0 / 1 | auto | manual | 1 | Sueño y fatiga |
| `reaccion_ms`, `lapsos` | ms, n | real | prueba | sube | Mental y cognitivo |
| `animo` | 1 a 5 | auto | manual, apple_watch | baja | Mental y cognitivo |
| `estres` | 0 a 10 | auto | manual | sube | Mental y cognitivo |
| `expresividad`, `sonrisa_media`, `ceno_medio`, `movimiento_cabeza` | 0 a 1 | real | camara | según tu normal | Mental y cognitivo |
| `animo_estimado` | 1 a 5 | real | modelo (**nunca entra al motor**) | | Mental y cognitivo |
| `sintomas` | conteo; lista en `detalle` | auto | manual | sube | Inmune y otros |

"Óseo" solo existe en `/simulation` (capa `sim`).

`animo_estimado` se guarda con capa `real` porque sus entradas son mediciones reales, pero **no es una medición**. Quien lo muestre decide por `fuente="modelo"` y pone la etiqueta "estimado", nunca por la capa.

## Pruebas mínimas (pytest)

- Un seno de 1.2 Hz con ruido → `estimate_hr` da 72 ± 3 lpm.
- Un escalón en la serie → CUSUM lo detecta, y el "desde" cae cerca del escalón.
- Línea base con `congelada=True` → no cambia.
- `peso_personal(7) == 0.5`.
- `capa="sim"` o `fuente="modelo"` → no producen anomalías ni actualizan la línea base.
- Diario de sueño (acostarse 23:00, intento 23:00, latencia 20 min, WASO 30 min, despertar final 06:30, levantarse 06:40) → TST de 6.67 h y eficiencia de alrededor de 87%.
- Inmune:
  - Fiebre + congestión 1 día → amarillo.
  - Fiebre + congestión 2 días seguidos → rojo.
  - Congestión sola 3 días → amarillo; 7 días → rojo.
  - Guion de la demo (congestión días 25 a 29, fuego labial 27 a 29, fiebre 28 y 29) → amarillo el 27, rojo el 29.
