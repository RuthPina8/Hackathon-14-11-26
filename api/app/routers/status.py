"""GET /status: disposición para la misión, semáforo por sistema y calibración (Back 1, mínimo)."""

from fastapi import APIRouter

from app.intelligence.baseline import LineaBase
from app.core import umbrales
from app.intelligence.detectors import regla_sueno
from app.intelligence.readiness import PENALIZACION, PESOS_CALIBRACION, calcular_estado, calibracion_ponderada
from app.models.memoria import almacen
from app.schemas.measurements import StatusOut
from app.triage.demo import engine as demo_engine

router = APIRouter(prefix="/status", tags=["estado"])


def construir_estado(astronauta_id: int = 1) -> StatusOut:
    ultimos = almacen.ultimos(astronauta_id)
    # La línea base que se compara es la de ANTES del último valor (si no, el valor se compara consigo mismo).
    # Se guarda al momento de medir: si la señal se congela después, su historia no se pierde.
    lineas: dict[str, LineaBase] = {t: lb for t in ultimos if (lb := almacen.linea_previa(astronauta_id, t))}
    estado = calcular_estado({t: m.valor for t, m in ultimos.items()}, lineas)
    # La calibración sí cuenta todos los datos, incluido el último (pesos de motor.md §3)
    estado.calibracion = calibracion_ponderada(
        {t: lb.n for t in PESOS_CALIBRACION if (lb := almacen.linea_base(astronauta_id, t))}
    )

    from app.routers.measurements import estado_inmune, serie_diaria  # import local: evita ciclo

    # Inmune con las reglas de síntomas (motor.md §5); sin registros, sin_datos (nunca verde)
    inmune = None
    ei = estado_inmune(astronauta_id)
    if ei.estado != "sin_datos":
        inmune = {"estado": ei.estado, "puntaje": ei.puntaje, "motivo": ei.motivo, "dia_desde": ei.dia_desde}
        valor = "sin síntomas" if ei.puntaje == 0 else f"puntaje {ei.puntaje:g}"
        estado.sistemas["inmune"] = {"estado": ei.estado, "valor": valor}
        if ei.estado in PENALIZACION:
            estado.readiness = max(20, estado.readiness - PENALIZACION[ei.estado])
            estado.factores.append({"label": ei.motivo, "delta": -PENALIZACION[ei.estado], "peso": 0})

    # Regla de sueño: deuda de varios días seguidos
    _, horas, _ = serie_diaria(astronauta_id, "sueno_horas")
    racha = regla_sueno(horas, umbrales.SUENO_MIN_HORAS, umbrales.SUENO_DIAS_SEGUIDOS)
    if racha.alarma:
        texto = f"Deuda de sueño: {racha.dias} noches con menos de {umbrales.SUENO_MIN_HORAS:g} h"
        if estado.sistemas.get("sueno", {}).get("estado") in (None, "sin_datos", "verde"):
            estado.sistemas["sueno"] = {"estado": "amarillo", "valor": f"{horas[-1]:.1f} h"}
        estado.readiness = max(20, estado.readiness - PENALIZACION["amarillo"])
        estado.factores.append({"label": texto, "delta": -PENALIZACION["amarillo"], "peso": 0})

    # Pesos de cada factor sobre el total (después de sumar inmune y sueño)
    total = sum(-f["delta"] for f in estado.factores) or 1
    estado.factores = sorted(
        [{**f, "peso": round(100 * -f["delta"] / total)} for f in estado.factores], key=lambda f: f["delta"]
    )

    from app.routers.measurements import estado_animo

    ra = estado_animo(astronauta_id)
    animo_camara = {"estado": ra.estado, "acierto_pct": ra.acierto_pct, "mae": ra.mae, "n": ra.n,
                    "explicacion": ra.explicacion, "estimado_hoy": ra.estimado_hoy}

    dia = demo_engine.dia
    return StatusOut(
        astronauta_id=astronauta_id,
        readiness=estado.readiness,
        factores=estado.factores,
        sistemas=estado.sistemas,
        calibracion=estado.calibracion,
        fase="tierra" if dia <= 0 else "adaptacion" if dia <= 14 else "personal",
        dia_mision=max(dia, 1),
        n_mediciones=len(almacen.listar(astronauta_id)),
        inmune=inmune,
        animo_camara=animo_camara,
    )


@router.get("", response_model=StatusOut)
def ver_estado(astronauta_id: int = 1):
    return construir_estado(astronauta_id)
