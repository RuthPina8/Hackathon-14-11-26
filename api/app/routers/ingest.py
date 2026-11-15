"""POST /ingest/apple-health (Back 1): JSON de la app Health Auto Export -> mediciones.

Formato de entrada (Health Auto Export, "JSON v2"):
    {"data": {"metrics": [{"name": "resting_heart_rate", "units": "count/min",
                           "data": [{"date": "2026-11-14 07:00:00 -0600", "qty": 62}]}, ...]}}

Solo se toman los tipos de la lista cerrada que el reloj sí mide (docs/motor.md §7). El Apple
Watch no da presión arterial. Cada lectura pasa por el mismo pipeline que la cámara, así que
también alimenta la línea base y los detectores. No se duplica: misma señal y misma fecha del
reloj se ignora (y en PostgreSQL lo asegura un índice único parcial).
"""

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Body, HTTPException

from app.models.memoria import almacen
from app.routers.measurements import procesar
from app.schemas.measurements import IngestOut, MedicionIn

router = APIRouter(prefix="/ingest", tags=["ingesta"])

CONFIANZA_RELOJ = 0.95
# nombre de Health Auto Export -> (tipo, unidad)
METRICAS = {
    "resting_heart_rate": ("hr_reposo", "lpm"),
    "heart_rate_variability": ("hrv_sdnn", "ms"),
}


def _fecha(texto: str) -> datetime | None:
    for fmt in ("%Y-%m-%d %H:%M:%S %z", "%Y-%m-%d %H:%M:%S"):
        try:
            d = datetime.strptime(texto, fmt)
            return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    try:
        d = datetime.fromisoformat(texto.replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _num(x: Any) -> float | None:
    try:
        v = float(x)
        return v if v == v else None  # descarta NaN
    except (TypeError, ValueError):
        return None


def convertir(payload: dict, astronauta_id: int) -> tuple[list[MedicionIn], int]:
    """Regresa las mediciones y cuántas lecturas se ignoraron (métricas fuera de la lista o sin valor)."""
    metricas = (payload.get("data") or {}).get("metrics") or payload.get("metrics") or []
    salida: list[MedicionIn] = []
    ignoradas = 0

    def agregar(tipo: str, unidad: str, valor: float | None, fecha: datetime | None, detalle: dict | None = None):
        nonlocal ignoradas
        if valor is None or fecha is None:
            ignoradas += 1
            return
        salida.append(MedicionIn(astronauta_id=astronauta_id, tipo=tipo, valor=round(valor, 3), unidad=unidad,
                                 capa="real", fuente="apple_watch", confianza=CONFIANZA_RELOJ, fecha=fecha,
                                 detalle=detalle or {}))

    for met in metricas:
        nombre = met.get("name", "")
        datos = met.get("data") or []
        if nombre in METRICAS:
            tipo, unidad = METRICAS[nombre]
            for d in datos:
                agregar(tipo, unidad, _num(d.get("qty", d.get("Avg"))), _fecha(str(d.get("date", ""))))
        elif nombre == "sleep_analysis":
            for d in datos:
                fecha = _fecha(str(d.get("sleepEnd") or d.get("date", "")))
                horas = _num(d.get("totalSleep", d.get("asleep")))
                en_cama = _num(d.get("inBed"))
                detalle = {k: d[k] for k in ("sleepStart", "sleepEnd", "inBedStart", "inBedEnd") if k in d}
                agregar("sueno_horas", "h", horas, fecha, detalle)
                if horas is not None and en_cama:
                    agregar("sueno_eficiencia_pct", "%", min(100.0, 100 * horas / en_cama), fecha, detalle)
        else:
            ignoradas += len(datos)
    return salida, ignoradas


@router.post("/apple-health", response_model=IngestOut, status_code=201)
async def apple_health(payload: dict = Body(...), astronauta_id: int = 1):
    mediciones, ignoradas = convertir(payload, astronauta_id)
    if not mediciones and not ignoradas:
        raise HTTPException(422, "No Health Auto Export metrics found in the JSON (expected data.metrics)")
    ya = {(m.tipo, m.fecha) for m in almacen.listar(astronauta_id) if m.fuente == "apple_watch"}
    nuevas, vistas = [], set()
    for m in sorted(mediciones, key=lambda m: m.fecha):
        clave = (m.tipo, m.fecha)
        if clave in ya or clave in vistas:
            continue
        vistas.add(clave)
        nuevas.append(m)
    por_tipo: dict[str, int] = {}
    for m in nuevas:
        por_tipo[m.tipo] = por_tipo.get(m.tipo, 0) + 1
    r = await procesar(nuevas) if nuevas else None
    return IngestOut(
        recibidas=len(mediciones) + ignoradas, guardadas=len(nuevas), duplicadas=len(mediciones) - len(nuevas),
        ignoradas=ignoradas, por_tipo=por_tipo, alerta_id=r.alerta_id if r else None,
    )
