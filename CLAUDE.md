# AstroHealth — contexto del proyecto

NASA Space Apps Challenge 2026 (Querétaro), reto **"Create Health Monitoring Software for Astronauts on Space Missions"**: software que junta indicadores de salud para que el astronauta **evalúe y actúe** sobre su estado. Equipo de 4, ~30 horas de trabajo.

Prioridades de salud del equipo: **psicológico, presión arterial, ritmo cardiaco, estado de ánimo**.

**La cámara es nuestro punto de innovación.** Con una webcam medimos ritmo, fatiga, señales de estrés y expresividad, sin sensores puestos. Los demás equipos con este reto simulan sus signos vitales; nosotros medimos en vivo.

**Lo que más pesa es la demo**: que se vea cómo el sistema detecta, explica y ayuda a actuar. Algo funcionando y visible vale más que algo completo a medias.

Prototipo visual (fuente de verdad del diseño, 10 pantallas): https://claude.ai/artifact/F9qfhGgaQ19fmLPAg5JaYe

## Regla de honestidad de datos (no negociable)

Cada medición lleva `capa`, `fuente` y `confianza`:

| capa | Qué es | Ejemplos | ¿Entra al motor de anomalías? |
|---|---|---|---|
| `real` | Medido en vivo | Cámara (pulso, PERCLOS, expresividad), prueba cognitiva, Apple Watch | Sí, con peso completo |
| `auto` | Lo reporta el astronauta | Ánimo, estrés, sueño, síntomas, presión con brazalete | Sí, con menos peso |
| `sim` | Proyección, no se mide | Densidad ósea, radiación, retraso con Tierra | **Nunca** |

Hay dos fuentes especiales:
- `fuente="simulador"`: historial sintético para la demo. **Sí pasa por el motor**, para que se vea la detección, pero la UI siempre lo marca como "dato de demo".
- `fuente="modelo"`: estimaciones, como el ánimo que estima la cámara. Se muestran con la etiqueta "estimado". **Nunca alimentan la línea base ni el motor**, para no crear círculos.

La cámara **no lee emociones** ni mide presión arterial o pupila. Aprende cómo cambian *tus* señales cuando *tú* reportas sentirte mal (detalle en `api/docs/motor.md`). No es un dispositivo médico: decimos "fuera de tu normal", nunca damos un diagnóstico.

## Equipo y dueños

| Rol | Dueño de | Carpeta |
|---|---|---|
| Front 1, visión y chequeo | Cámara con MediaPipe (señal de color, PERCLOS, parpadeo, blendshapes, pose de cabeza), onda del pulso, pruebas cognitivas, registro manual (pantallas 2, 3, 4) | `web/` |
| Front 2, dashboard | Estructura, rutas, estilos, silueta, gráficas, cliente WebSocket, animaciones (pantallas 1, 5 a 10) | `web/` |
| Back 1, datos e inteligencia | Esquema de la base, simulador, rPPG, línea base, detectores, calibración, readiness, sueño, inmune, modelo de ánimo, ingesta del Apple Watch | `api/` (ver `api/CLAUDE.md`) |
| Back 2, API y triage | FastAPI base, CORS, WebSocket, reglas del triage, ciclo de vida de alertas, entornos, cola a Tierra, modo demo | `api/` |

Parejas de trabajo: Front 1 con Back 1 (cámara) y Front 2 con Back 2 (WebSocket y alertas).

## Stack

- **Front:** React 19 + TypeScript + Vite, Tailwind v4, Framer Motion, Recharts, Zustand, Dexie + vite-plugin-pwa, MediaPipe Face Landmarker (478 puntos, 52 blendshapes, matriz de pose), lucide-react.
- **Back:** FastAPI + Uvicorn + Pydantic v2, SQLAlchemy 2 + psycopg 3 + Alembic, PostgreSQL 18, NumPy, SciPy, pandas, scikit-learn, pytest + httpx.
- Comunicación: REST para los datos y WebSocket `/ws` para que la UI cambie en vivo.
- Entorno: Windows con PowerShell.

## Repo y ramas

```
astrohealth/
  web/        front (Front 1 y Front 2)
  api/        back (Back 1 y Back 2)
  .vscode/    configuración compartida del editor
```

- `main` siempre funciona y `dev` es para integrar. Cada quien trabaja en `feature/<su-parte>` y hace merge a `dev` cada vez que algo funcione, mínimo cada 4 horas.
- Nadie toca la carpeta del otro sin avisar.
- Si el back se atrasa, el front sigue con mocks. Si la cámara falla, la demo sigue con el simulador.
- **Nunca** subas al repo `.env`, `venv/`, `node_modules/`, datasets (`data/`) ni `CLAUDE.local.md`.

## Contrato API

### Base (acordado entre los 4)

| Método | Ruta | Qué hace | Dueño |
|---|---|---|---|
| POST | `/rppg/estimate` | Señal de color + fps → ritmo y confianza | Back 1 |
| POST | `/measurements` | Guarda mediciones (tipo, valor, capa, fuente, confianza) | Back 1 |
| GET | `/indicators/{tipo}?range=30d` | Serie, banda de línea base y anomalías | Back 1 |
| GET | `/status` | Readiness con explicación, semáforo por sistema, calibración | Back 1 |
| GET | `/alerts` | Alertas activas y resueltas | Back 2 |
| POST | `/alerts/{id}/ack` | Marcar atendida; descongela la línea base | Back 2 |
| POST | `/alerts/{id}/escalate` | Manda la alerta a la cola hacia Tierra | Back 2 |
| GET | `/queue` | Cola de mensajes con prioridad y estado | Back 2 |
| GET, PUT | `/environment` | Entorno activo y su perfil | Back 2 |
| GET | `/simulation?env=nave&day=120` | Proyección ósea, radiación, retraso, riesgo | Back 2 |
| POST | `/demo/advance` | Avanza el tiempo simulado de la demo | Back 2 |

### Ampliaciones del 15 nov (cierre del proyecto)

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/crew` | Semáforo, readiness y últimos valores de A1 a A4 (panel del comandante y de Tierra) |
| POST | `/ingest/apple-health?astronauta_id=` | JSON de Health Auto Export → ritmo en reposo, VFC (SDNN) y sueño; no duplica |
| GET, PUT | `/ficha/{astronauta_id}` | Ficha médica pre-misión (antecedentes y valores basales en Tierra). Es referencia: no entra al motor |
| GET | `/evolucion/{astronauta_id}` | Últimos 7 días contra la ficha (o contra la primera semana): mejora, estable o se aleja |
| GET, DELETE | `/validacion?origen=` | Confiabilidad de la cámara: MAE, Bland-Altman, % a ±5 lpm, umbral de confianza verificado |
| POST | `/validacion/referencia` | Pulso de un aparato de referencia; se empareja con la lectura de cámara de los 15 min cercanos |
| POST | `/validacion/lote` | Pares de una base pública (UBFC-rPPG, PURE) calculados con `api/ml/validar_dataset.py` |

- `/indicators/{tipo}` ahora trae `anomalias`, `estado`, `desde` y `alerta_id` (de la alerta abierta), `dato_demo` y `range=mision`.
- `/status` trae `racha` y `dato_demo`.
- Con `DATABASE_URL` en `api/.env` todo se guarda en PostgreSQL y se restaura al reiniciar; `python -m app.seed --dias 30 --fichas-demo` llena la base para la demo. Sin `DATABASE_URL`, todo sigue en memoria.
- El front encuentra el back solo: sin `VITE_API_URL` usa el puerto 8000 de la misma máquina.

### Eventos de `/ws`

Formato: `{"event": "...", "data": {...}}`. Eventos: `measurement_added`, `status_changed`, `calibration_changed`, `alert_raised`, `queue_updated`.

### Ampliaciones decididas el 14 nov

Back 1 las avisa al equipo antes de implementarlas.

1. `measurements` gana dos columnas: `dia_mision` (int) y `detalle` (JSONB, por ejemplo la lista de síntomas o los horarios de sueño).
2. `POST /measurements` acepta un objeto o una lista. Un chequeo con cámara manda unas 10 mediciones de una vez.
3. `/rppg/estimate` regresa además `hrv_rmssd` y `resp_rpm`. Son experimentales y valen `null` si la calidad es baja.
4. Endpoint nuevo `POST /ingest/apple-health` (Back 1), que recibe el JSON de la app Health Auto Export.
5. `/status` agrega `inmune` (puntaje y motivo) y `animo_camara` (`estado`: `aprendiendo` | `activo`, `acierto_pct`, `n`).
6. Lista cerrada de `tipo`: está en `api/CLAUDE.md`. Las nuevas son las de sueño, síntomas, estrés y las señales de cámara.

## Decisiones del 14 nov (antes "pendientes")

1. El simulador pasa por el motor, marcado como demo. Lo de capa `sim` nunca entra.
2. Se agregan `dia_mision` y `detalle`.
3. Sueño: lo registra el astronauta con base en el Consensus Sleep Diary, o llega del Apple Watch.
4. Inmune: se calcula con los síntomas autorreportados (categorías de la NASA en la ISS).
5. La misión empieza en el **día 1**. Las mediciones reales del equipo durante el hackathon son la "línea base en Tierra".
6. La cámara se amplía: estrés y expresividad, y un modelo personal de ánimo. No se mide pupila, no se etiquetan emociones y no se estima presión.
7. No hay brazalete, solo un Apple Watch. La presión se captura a mano si hay brazalete (en la ISS hay uno en el kit médico); en la demo viene del simulador. El Apple Watch no da cifras de presión.
8. Back 2 está de acuerdo con la división de `api/`.

## Cambios que esto pide al prototipo (Front)

- **Pantalla 1 (Inicio):** quitar el ejemplo "día 9"; la misión arranca en el día 1. Inmune ya no sale verde fijo: se calcula, o dice "sin datos".
- **Pantalla 2 (Chequeo):** agregar tarjetas de "Estrés (VFC, experimental)", "Respiración (experimental)" y "Expresividad vs tu normal".
- **Pantalla 4 (Registro):**
  - Nueva sección "Sueño de anoche": hora de acostarse, minutos para dormirse, despertares, minutos despierto, hora de despertar, calidad 1 a 5 y si tomó medicamento.
  - Nuevo deslizador de estrés de 0 a 10.
  - Lista de síntomas nueva, agrupada por sistema, con intensidad 1 a 3.
  - En presión, el texto cambia a "si tienes brazalete (kit médico)".
  - La pista de expresión facial cambia a "La cámara aprende de tus registros; lo que cuenta es lo que tú reportas".
- **Pantalla 7 (Perfil):** agregar la fila "Lectura de ánimo por cámara: aprendiendo / acierta X%".

## Correr el proyecto

- **Front:** `cd web` y luego `npm run dev`; se abre en http://localhost:5173. `web/.env` lleva `VITE_API_URL` y `VITE_WS_URL` con la IP de la compu del back.
- **Back:** `cd api`, luego `venv\Scripts\activate`, luego `uvicorn main:app --reload --host 0.0.0.0 --port 8000`. La documentación automática queda en http://localhost:8000/docs.
