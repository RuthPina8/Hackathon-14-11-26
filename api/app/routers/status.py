"""GET /status: disposición para la misión, semáforo por sistema y calibración (Back 1, mínimo)."""

from fastapi import APIRouter

from app.intelligence.baseline import LineaBase, actualizar
from app.intelligence.readiness import calcular_estado
from app.models.memoria import almacen
from app.schemas.measurements import StatusOut
from app.triage.demo import engine as demo_engine

router = APIRouter(prefix="/status", tags=["estado"])


def construir_estado(astronauta_id: int = 1) -> StatusOut:
    ultimos = almacen.ultimos(astronauta_id)
    # La línea base que se compara es la de ANTES del último valor (si no, el valor se compara consigo mismo)
    lineas: dict[str, LineaBase] = {}
    for tipo, m in ultimos.items():
        serie = [x.valor for x in almacen.listar(astronauta_id, tipo) if almacen.cuenta_para_linea_base(x) and x.id != m.id]
        lb = LineaBase()
        for v in serie:
            lb = actualizar(lb, v)
        lineas[tipo] = lb
    estado = calcular_estado({t: m.valor for t, m in ultimos.items()}, lineas)
    # La calibración sí cuenta todos los datos, incluido el último
    pesos = [lb.peso_personal for t in ultimos if (lb := almacen.linea_base(astronauta_id, t))]
    estado.calibracion = round(100 * sum(pesos) / len(pesos)) if pesos else 0

    inmune = None
    sintomas = ultimos.get("sintomas")
    if sintomas:
        lista = sintomas.detalle.get("lista", [])
        fiebre = any(s.get("id") == "fiebre" for s in lista if isinstance(s, dict))
        puntaje = min(100, int(sintomas.valor) * 20 + (40 if fiebre else 0))
        motivo = "Sin síntomas reportados" if sintomas.valor == 0 else (f"{int(sintomas.valor)} síntoma" if int(sintomas.valor) == 1 else f"{int(sintomas.valor)} síntomas") + (", incluye fiebre" if fiebre else "")
        inmune = {"puntaje": puntaje, "motivo": motivo}
        if fiebre:
            estado.sistemas["inmune"] = {"estado": "amarillo", "valor": "fiebre"}

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
    )


@router.get("", response_model=StatusOut)
def ver_estado(astronauta_id: int = 1):
    return construir_estado(astronauta_id)
