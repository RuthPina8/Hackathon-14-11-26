"""GET /indicators/{tipo}: serie, banda de línea base, anomalías y desde cuándo (Back 1).

Las anomalías de la gráfica se calculan igual que el motor: cada punto se compara contra la
línea base que había ANTES de él (no contra la final, que ya lo incluye).
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Query

from app.core import umbrales
from app.intelligence.baseline import LineaBase, actualizar
from app.intelligence.readiness import EXPERIMENTALES, NOMBRES, evaluar_senal
from app.models.memoria import CONFIANZA_MIN_LINEA_BASE, almacen
from app.schemas.measurements import IndicatorOut
from app.triage import alerts as triage
from app.triage import baseline as congelamiento

router = APIRouter(prefix="/indicators", tags=["indicadores"])

# Nombres cortos que usa el front en sus rutas
ALIAS = {"hr": "hr_reposo", "bp": "presion_sis", "rt": "reaccion_ms", "sleep": "sueno_horas", "mood": "animo",
         "stress": "estres", "hrv": "hrv_rmssd", "resp": "resp_rpm", "blink": "parpadeo_min"}


def _cuenta(m) -> bool:
    return m.capa != "sim" and m.fuente != "modelo" and m.confianza >= CONFIANZA_MIN_LINEA_BASE and not m.detalle.get("practica")


@router.get("/{tipo}", response_model=IndicatorOut)
def ver_indicador(tipo: str, astronauta_id: int = 1, range: str = Query(default="30d", pattern=r"^(\d+d|mision)$")):
    tipo = ALIAS.get(tipo, tipo)
    todas = sorted(almacen.listar(astronauta_id, tipo), key=lambda m: (m.fecha, m.id))
    desde_fecha = None if range == "mision" else datetime.now(timezone.utc) - timedelta(days=int(range[:-1]))

    # Recorre la historia completa para tener la línea base de cada momento
    lb = LineaBase()
    serie, anomalias = [], []
    for m in todas:
        previa = lb if lb.n else None
        anomalo, motivo, z = False, None, None
        if _cuenta(m) and tipo not in EXPERIMENTALES:
            e = evaluar_senal(tipo, m.valor, previa)
            z = round(e.z, 2) if e.z is not None else None
            if e.estado in ("amarillo", "rojo"):
                anomalo, motivo = True, e.motivo
        if desde_fecha is None or m.fecha >= desde_fecha:
            serie.append({"fecha": m.fecha, "valor": m.valor, "capa": m.capa, "fuente": m.fuente,
                          "confianza": m.confianza, "dia_mision": m.dia_mision, "z": z, "anomalo": anomalo})
            if anomalo:
                anomalias.append({"fecha": m.fecha, "valor": m.valor, "z": z, "motivo": motivo, "dia_mision": m.dia_mision})
        if _cuenta(m):
            lb = actualizar(lb, m.valor)

    # Alerta abierta que involucra esta señal: de ahí sale el "desde cuándo" (CUSUM)
    alerta = None
    for a in triage.listar(astronauta_id).activas:
        if a.senal == tipo or tipo in a.factores or tipo in triage.store.senales.get(a.id, []):
            alerta = a
            break

    final = almacen.linea_base(astronauta_id, tipo)
    ultimo = next((m for m in reversed(todas) if _cuenta(m)), None)
    estado = "sin_datos"
    if ultimo is not None:
        estado = evaluar_senal(tipo, ultimo.valor, almacen.linea_previa(astronauta_id, tipo)).estado
    return IndicatorOut(
        tipo=tipo,
        nombre=NOMBRES.get(tipo, tipo),
        unidad=next((m.unidad for m in reversed(todas) if m.unidad), ""),
        serie=serie,
        linea_base={
            "media": round(final.media, 3) if final and final.n else None,
            "desviacion": round(final.desviacion, 3) if final and final.desviacion else None,
            "n": final.n if final else 0,
            "peso_personal": round(final.peso_personal, 3) if final else 0.0,
            "congelada": congelamiento.esta_congelada(astronauta_id, tipo),
        },
        rango_clinico=umbrales.RANGOS_CLINICOS.get(tipo),
        rango_atencion=umbrales.RANGOS_ATENCION.get(tipo),
        anomalias=anomalias,
        estado=estado,
        alerta_id=alerta.id if alerta else None,
        desde=alerta.desde if alerta else None,
        experimental=tipo in EXPERIMENTALES,
        dato_demo=any(m.fuente == "simulador" for m in todas),
    )
