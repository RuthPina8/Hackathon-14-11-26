"""GET /indicators/{tipo}: serie, línea base y rango clínico (Back 1, mínimo de integración)."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Query

from app.core import umbrales
from app.models.memoria import almacen
from app.schemas.measurements import IndicatorOut
from app.triage import baseline as congelamiento

router = APIRouter(prefix="/indicators", tags=["indicadores"])

# Nombres cortos que usa el front en sus rutas
ALIAS = {"hr": "hr_reposo", "bp": "presion_sis", "rt": "reaccion_ms", "sleep": "sueno_horas", "mood": "animo"}


@router.get("/{tipo}", response_model=IndicatorOut)
def ver_indicador(tipo: str, astronauta_id: int = 1, range: str = Query(default="30d", pattern=r"^\d+d$")):
    tipo = ALIAS.get(tipo, tipo)
    desde = datetime.now(timezone.utc) - timedelta(days=int(range[:-1]))
    serie = [m for m in almacen.listar(astronauta_id, tipo) if m.fecha >= desde]
    lb = almacen.linea_base(astronauta_id, tipo)
    return IndicatorOut(
        tipo=tipo,
        unidad=serie[-1].unidad if serie else "",
        serie=[{"fecha": m.fecha, "valor": m.valor, "capa": m.capa, "fuente": m.fuente, "confianza": m.confianza} for m in serie],
        linea_base={
            "media": round(lb.media, 3) if lb and lb.n else None,
            "desviacion": round(lb.desviacion, 3) if lb and lb.desviacion else None,
            "n": lb.n if lb else 0,
            "peso_personal": round(lb.peso_personal, 3) if lb else 0.0,
            "congelada": congelamiento.esta_congelada(astronauta_id, tipo),
        },
        rango_clinico=umbrales.RANGOS_CLINICOS.get(tipo),
    )
