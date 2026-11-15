"""Ficha médica pre-misión, evolución del astronauta y confiabilidad de la cámara (Back 1).

- La ficha es la referencia de la evaluación médica en Tierra (como la que tienen los astronautas
  antes de volar). NO entra al motor como medición: es contra lo que se compara la evolución.
- La evolución compara lo reciente contra la ficha (o contra la primera semana si no hay ficha).
- La confiabilidad empareja lecturas de la cámara con un aparato de referencia y calcula MAE,
  Bland-Altman y el umbral de confianza verificado (app/intelligence/validacion.py).
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException

from app.intelligence import validacion
from app.intelligence.readiness import DIRECCION, NOMBRES
from app.models.clinico import clinico
from app.models.memoria import almacen
from app.routers.measurements import serie_diaria
from app.schemas.clinico import (
    ConfiabilidadOut, EvolucionOut, FichaMedica, ItemEvolucion, LoteIn, ParOut, ReferenciaIn,
)

router = APIRouter(tags=["clínico"])

# Señales que se siguen en la evolución, con su unidad
EVOLUCION = [
    ("hr_reposo", "bpm"), ("presion_sis", "mmHg"), ("presion_dia", "mmHg"), ("hrv_rmssd", "ms"),
    ("reaccion_ms", "ms"), ("perclos", ""), ("sueno_horas", "h"), ("animo", "of 5"), ("estres", "of 10"),
]
VENTANA_PAREO = timedelta(minutes=15)


# ------------------------------------------------------------------ ficha médica

@router.get("/ficha/{astronauta_id}", response_model=FichaMedica)
def ver_ficha(astronauta_id: int):
    return clinico.fichas.get(astronauta_id) or FichaMedica(astronauta_id=astronauta_id)


@router.put("/ficha/{astronauta_id}", response_model=FichaMedica)
def guardar_ficha(astronauta_id: int, ficha: FichaMedica):
    if ficha.astronauta_id != astronauta_id:
        raise HTTPException(422, "The record’s astronaut doesn’t match the route")
    f = ficha.model_copy(update={"actualizada": datetime.now(timezone.utc)})
    return clinico.guardar_ficha(f)


# ------------------------------------------------------------------ evolución

def _prom(v: list[float]) -> float | None:
    return sum(v) / len(v) if v else None


def _pendiente(dias: list[int], vals: list[float]) -> float | None:
    if len(vals) < 4:
        return None
    mx, my = sum(dias) / len(dias), sum(vals) / len(vals)
    sxx = sum((d - mx) ** 2 for d in dias)
    if sxx == 0:
        return None
    return sum((d - mx) * (v - my) for d, v in zip(dias, vals)) / sxx * 7


def evolucion_de(astronauta_id: int, tipo: str, unidad: str, ficha_valor: float | None) -> ItemEvolucion:
    nombre = NOMBRES.get(tipo, tipo)
    dias, vals, _ = serie_diaria(astronauta_id, tipo)
    item = ItemEvolucion(tipo=tipo, nombre=nombre, unidad=unidad, ficha=ficha_valor, n=len(vals),
                         serie=[{"dia": d, "valor": round(v, 3)} for d, v in zip(dias, vals)][-60:])
    if not vals:
        item.explicacion = "No measurements yet"
        return item
    item.inicio = round(_prom(vals[:7]), 3)
    item.reciente = round(_prom(vals[-7:]), 3)
    item.tendencia_semana = (round(p, 3) if (p := _pendiente(dias[-14:], vals[-14:])) is not None else None)
    if ficha_valor is not None:
        ref, item.referencia = ficha_valor, "ficha"
    elif len(vals) >= 10:
        ref, item.referencia = item.inicio, "inicio"
    else:
        item.explicacion = f"Not enough data: {len(vals)} days, comparison starts at 10 days or with the medical record"
        return item
    item.cambio = round(item.reciente - ref, 3)
    item.cambio_pct = round(100 * item.cambio / ref, 1) if ref else None
    # Tolerancia: medio desvío de tu propia variación diaria, y al menos 3% del valor de referencia
    media = sum(vals) / len(vals)
    sd = (sum((v - media) ** 2 for v in vals) / max(1, len(vals) - 1)) ** 0.5
    tol = max(0.5 * sd, 0.03 * abs(ref), 1e-9)
    direccion = DIRECCION.get(tipo, "ambas")
    contra = "your pre-flight medical record" if item.referencia == "ficha" else "your first week"
    if abs(item.cambio) <= tol:
        item.estado = "estable"
        item.explicacion = f"Same as {contra}"
    else:
        sube = item.cambio > 0
        malo = (direccion == "ambas") or (direccion == "sube" and sube) or (direccion == "baja" and not sube)
        item.estado = "empeora" if malo else "mejora"
        item.explicacion = f"{'Up' if sube else 'Down'} {abs(item.cambio):.3g} {unidad} vs {contra}".replace("  ", " ")
    return item


@router.get("/evolucion/{astronauta_id}", response_model=EvolucionOut)
def ver_evolucion(astronauta_id: int):
    ficha = clinico.fichas.get(astronauta_id)
    basales = ficha.basales.model_dump() if ficha else {}
    items = [evolucion_de(astronauta_id, t, u, basales.get(t)) for t, u in EVOLUCION]
    peores = [i for i in items if i.estado == "empeora"]
    mejores = [i for i in items if i.estado == "mejora"]
    dias = len({d for t, _ in EVOLUCION for d in serie_diaria(astronauta_id, t)[0]})
    if dias == 0:
        resumen = "No measurements yet. Do your daily check-up and load your medical record to see your progress."
    elif peores:
        resumen = f"{len(peores)} signals are drifting from your reference: " + ", ".join(i.nombre.lower() for i in peores[:3])
    elif mejores:
        resumen = f"You’re doing well: {len(mejores)} signals improved and none got worse"
    else:
        resumen = "Stable: your signals match your reference"
    return EvolucionOut(astronauta_id=astronauta_id, tiene_ficha=ficha is not None, dias_con_datos=dias,
                        resumen=resumen, items=items)


# ------------------------------------------------------------------ confiabilidad de la cámara

def _out(p) -> ParOut:
    return ParOut(id=p.id, camara=p.camara, referencia=p.referencia, confianza=p.confianza, origen=p.origen,
                  astronauta_id=p.astronauta_id, fuente_referencia=p.fuente_referencia, fecha=p.fecha)


@router.get("/validacion", response_model=ConfiabilidadOut, response_model_by_alias=True)
def ver_confiabilidad(origen: str | None = None):
    pares = [p for p in clinico.pares if origen is None or p.origen == origen]
    c = validacion.evaluar([validacion.Par(p.camara, p.referencia, p.confianza, p.origen) for p in pares])
    return ConfiabilidadOut(
        estado=c.estado, explicacion=c.explicacion, umbral=c.umbral,
        tolerancia_lpm=validacion.TOLERANCIA_LPM, objetivo=validacion.EXITO_OBJETIVO,
        global_=c.global_.__dict__, sobre_umbral=c.sobre_umbral.__dict__ if c.sobre_umbral else None,
        por_origen={k: v.__dict__ for k, v in c.por_origen.items()},
        tramos=[t.__dict__ for t in c.tramos], referencia_publicada=validacion.REFERENCIA_PUBLICADA,
        pares=[_out(p) for p in pares[-300:]],
    )


@router.post("/validacion/referencia", response_model=ParOut, status_code=201)
def registrar_referencia(body: ReferenciaIn):
    """Pulso de un aparato de referencia tomado junto al chequeo: se empareja con la lectura de cámara más cercana."""
    fecha = body.fecha or datetime.now(timezone.utc)
    if fecha.tzinfo is None:
        fecha = fecha.replace(tzinfo=timezone.utc)
    candidatas = [m for m in almacen.listar(body.astronauta_id, "hr_reposo")
                  if m.fuente == "camara" and abs(m.fecha - fecha) <= VENTANA_PAREO]
    if not candidatas:
        raise HTTPException(404, "There’s no camera heart rate reading within 15 minutes. Do the camera check-up and log the reference right after")
    m = min(candidatas, key=lambda m: abs(m.fecha - fecha))
    if any(p.astronauta_id == body.astronauta_id and p.fecha == m.fecha and p.fuente_referencia == body.fuente for p in clinico.pares):
        raise HTTPException(409, "That camera reading already has a reference from that device")
    p = clinico.agregar_par(camara=m.valor, referencia=body.hr_lpm, confianza=m.confianza, origen="propio",
                            astronauta_id=body.astronauta_id, fuente_referencia=body.fuente, fecha=m.fecha)
    return _out(p)


@router.post("/validacion/lote", response_model=list[ParOut], status_code=201)
def cargar_lote(body: LoteIn):
    """Pares de una base pública (UBFC-rPPG, PURE) evaluada con api/ml/validar_dataset.py."""
    return [_out(clinico.agregar_par(camara=p.camara, referencia=p.referencia, confianza=p.confianza, origen=p.origen))
            for p in body.pares]


@router.delete("/validacion")
def borrar_pares(origen: str | None = None):
    return {"borrados": clinico.borrar_pares(origen)}
