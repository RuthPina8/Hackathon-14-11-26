"""POST /measurements (Back 1, mínimo de integración).

Guarda una medición o una lista, actualiza la línea base (respetando congelada), busca
anomalías contra el rango clínico y tu normal, se las pasa al triage de Back 2 y avisa por /ws.
"""

from fastapi import APIRouter
from fastapi.encoders import jsonable_encoder

from app.core import umbrales
from app.core.ws import broadcast
from app.intelligence.readiness import DIRECCION, EXPERIMENTALES, evaluar_senal
from app.models.memoria import almacen
from app.routers.status import construir_estado
from app.schemas.anomaly import Anomaly
from app.schemas.measurements import GuardadoOut, MedicionIn, MedicionOut
from app.triage import alerts as triage

router = APIRouter(prefix="/measurements", tags=["mediciones"])


def _anomalia(m, previa) -> Anomaly | None:
    if m.capa == "sim" or m.fuente == "modelo" or m.tipo not in DIRECCION or m.tipo in EXPERIMENTALES:
        return None
    ev = evaluar_senal(m.tipo, m.valor, previa)
    if ev.estado == "verde":
        return None
    clinico = m.tipo in umbrales.RANGOS_CLINICOS and "rango clínico" in ev.motivo
    return Anomaly(
        senal=m.tipo,
        detector="rango_clinico" if clinico else "zscore",
        valor=m.valor,
        referencia=round(previa.media, 3) if previa and previa.n else None,
        z=round(ev.z, 2) if ev.z is not None else None,
        direccion=DIRECCION.get(m.tipo),  # type: ignore[arg-type]
        capa=m.capa,
        fuente=m.fuente,
        nivel_sugerido="roja" if ev.estado == "rojo" else "amarilla",
        texto=ev.motivo,
    )


@router.post("", response_model=GuardadoOut, status_code=201)
async def guardar(body: MedicionIn | list[MedicionIn]):
    entradas = body if isinstance(body, list) else [body]
    guardadas: list[MedicionOut] = []
    anomalias: list[Anomaly] = []
    astronauta_id = entradas[0].astronauta_id if entradas else 1
    dia_mision = None

    for e in entradas:
        datos = e.model_dump()
        m, previa = almacen.guardar(**datos)
        salida = MedicionOut(**{**datos, "id": m.id, "fecha": m.fecha})
        guardadas.append(salida)
        dia_mision = dia_mision if dia_mision is not None else e.dia_mision
        await broadcast("measurement_added", jsonable_encoder(salida))
        a = _anomalia(m, previa)
        if a:
            anomalias.append(a)

    alerta = await triage.handle_anomalies(astronauta_id, anomalias, dia_mision=dia_mision) if anomalias else None

    estado = construir_estado(astronauta_id)
    await broadcast("status_changed", estado)
    await broadcast("calibration_changed", {"astronauta_id": astronauta_id, "calibracion": estado.calibracion})
    return GuardadoOut(guardadas=len(guardadas), mediciones=guardadas, alerta_id=alerta.id if alerta else None)
