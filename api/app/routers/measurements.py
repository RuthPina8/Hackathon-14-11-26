"""POST /measurements (Back 1).

Guarda una medición o una lista, actualiza la línea base (respetando congelada y la confianza
mínima), corre los detectores del motor (docs/motor.md §3 y §5), le pasa las anomalías al triage
de Back 2 y avisa por /ws. El simulador del modo demo usa este mismo pipeline (`procesar`).
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter
from fastapi.encoders import jsonable_encoder

from app.core import umbrales
from app.core.ws import broadcast
from app.intelligence import detectors, immune, mood_model
from app.intelligence.baseline import desviacion_efectiva
from app.intelligence.readiness import DIRECCION, EXPERIMENTALES, NO_CLINICOS, NOMBRES, evaluar_senal
from app.models.memoria import CONFIANZA_MIN_LINEA_BASE, Medicion, almacen
from app.routers.status import construir_estado
from app.schemas.anomaly import Anomaly
from app.schemas.measurements import GuardadoOut, MedicionIn, MedicionOut
from app.triage import alerts as triage

router = APIRouter(prefix="/measurements", tags=["mediciones"])

# Días mínimos de historia para CUSUM y EWMA, y cuántos días recientes se excluyen de la referencia
MIN_DIAS_TENDENCIA = 21  # 14 de referencia + 7 recientes
VENTANA_RECIENTE = 7
# Señales del vector diario de Isolation Forest (las que tienen un "tu normal" diario).
# Sin las experimentales (VFC y respiración por cámara): no deben levantar alertas.
COLUMNAS_IF = ["hr_reposo", "perclos", "parpadeo_min", "reaccion_ms", "sueno_horas",
               "animo", "estres", "expresividad"]
# Calibración anterior por astronauta, para emitir calibration_changed {antes, despues, delta}
_calibracion_previa: dict[int, int] = {}


def reset() -> None:
    _calibracion_previa.clear()


# ---------------------------------------------------------------- series diarias

def clave_dia(m: Medicion) -> int:
    """Día de misión si viene; si no, el día del calendario (sirve para agrupar y ordenar)."""
    if m.dia_mision is not None:
        return m.dia_mision
    return m.fecha.date().toordinal()


def serie_diaria(astronauta_id: int, tipo: str) -> tuple[list[int], list[float], dict[int, datetime]]:
    """Promedio por día de las mediciones que sí cuentan (sin sim, modelo, baja confianza ni práctica)."""
    por_dia: dict[int, list[float]] = {}
    fechas: dict[int, datetime] = {}
    for m in almacen.listar(astronauta_id, tipo):
        if m.capa == "sim" or m.fuente == "modelo" or m.confianza < CONFIANZA_MIN_LINEA_BASE or m.detalle.get("practica"):
            continue
        d = clave_dia(m)
        por_dia.setdefault(d, []).append(m.valor)
        fechas.setdefault(d, m.fecha)
    dias = sorted(por_dia)
    return dias, [sum(por_dia[d]) / len(por_dia[d]) for d in dias], fechas


def _referencia(valores: list[float], tipo: str | None = None) -> tuple[float, float] | None:
    """Tu normal para tendencias: los días anteriores a la ventana reciente."""
    if len(valores) < MIN_DIAS_TENDENCIA:
        return None
    ref = valores[:-VENTANA_RECIENTE]
    media = sum(ref) / len(ref)
    var = sum((x - media) ** 2 for x in ref) / max(1, len(ref) - 1)
    sd = var ** 0.5
    sd = desviacion_efectiva(tipo, sd) or 0.0
    if sd == 0:
        sd = abs(media) * 0.05 or 1.0
    return media, sd


# ---------------------------------------------------------------- detectores por señal

def _anomalia_puntual(m: Medicion, previa) -> Anomaly | None:
    ev = evaluar_senal(m.tipo, m.valor, previa)
    if ev.estado == "verde":
        return None
    clinico = m.tipo not in NO_CLINICOS and umbrales.clasificar_rango(m.tipo, m.valor) is not None
    return Anomaly(
        senal=m.tipo,
        detector="rango_clinico" if clinico else "zscore",
        valor=m.valor,
        referencia=round(previa.media, 3) if previa and previa.n else None,
        z=round(ev.z, 2) if ev.z is not None else None,
        direccion=DIRECCION.get(m.tipo),  # type: ignore[arg-type]
        capa=m.capa,  # type: ignore[arg-type]
        fuente=m.fuente,
        confianza=m.confianza,
        nivel_sugerido=("roja" if ev.estado == "rojo" else "amarilla") if clinico or ev.z is None else None,
        texto=ev.motivo,
    )


def _anomalia_tendencia(m: Medicion) -> Anomaly | None:
    dias, valores, fechas = serie_diaria(m.astronauta_id, m.tipo)
    ref = _referencia(valores, m.tipo)
    if not ref:
        return None
    media, sd = ref
    direccion = DIRECCION.get(m.tipo, "ambas")
    nombre = NOMBRES.get(m.tipo, m.tipo)
    z = round((valores[-1] - media) / sd, 2)

    # CUSUM y EWMA solo sobre los días recientes, comparados contra la referencia anterior
    reciente = valores[-VENTANA_RECIENTE:]
    offset = len(valores) - len(reciente)
    c = detectors.cusum(reciente, media, sd, direccion)
    if c and c.alarma and c.indice_desde is not None:
        desde_dia = dias[offset + c.indice_desde]
        return Anomaly(
            senal=m.tipo, detector="cusum", valor=round(valores[-1], 3), referencia=round(media, 3), z=z,
            desde=fechas.get(desde_dia), direccion=direccion,  # type: ignore[arg-type]
            capa=m.capa, fuente=m.fuente, confianza=m.confianza,  # type: ignore[arg-type]
            texto=f"{nombre} {'sube' if c.lado == 'sube' else 'baja'} de forma sostenida desde hace {len(reciente) - c.indice_desde} días",
        )
    e = detectors.ewma(reciente, media, sd, direccion)
    if e and e.alarma:
        return Anomaly(
            senal=m.tipo, detector="ewma", valor=round(valores[-1], 3), referencia=round(media, 3), z=z,
            direccion=direccion, capa=m.capa, fuente=m.fuente, confianza=m.confianza,  # type: ignore[arg-type]
            texto=f"{nombre} se aleja poco a poco de tu normal",
        )
    return None


def _anomalia_sueno(m: Medicion) -> Anomaly | None:
    dias, valores, fechas = serie_diaria(m.astronauta_id, "sueno_horas")
    r = detectors.regla_sueno(valores, umbrales.SUENO_MIN_HORAS, umbrales.SUENO_DIAS_SEGUIDOS)
    if not r.alarma or r.indice_desde is None:
        return None
    return Anomaly(
        senal="sueno_horas", detector="sueno", valor=round(valores[-1], 2), direccion="baja",
        desde=fechas.get(dias[r.indice_desde]), capa=m.capa, fuente=m.fuente, confianza=m.confianza,  # type: ignore[arg-type]
        texto=f"Deuda de sueño: {r.dias} noches seguidas con menos de {umbrales.SUENO_MIN_HORAS:g} h",
    )


def sintomas_por_dia(astronauta_id: int) -> dict[int, dict[str, int]]:
    res: dict[int, dict[str, int]] = {}
    for m in almacen.listar(astronauta_id, "sintomas"):
        if m.capa == "sim" or m.fuente == "modelo":
            continue
        dia = res.setdefault(clave_dia(m), {})
        for c, i in immune.claves_del_dia(m.detalle.get("lista", [])).items():
            dia[c] = max(dia.get(c, 0), i)
    return res


def contexto_riesgo(astronauta_id: int) -> bool:
    """Deuda de sueño o estrés ≥ 7 en la última semana (motor.md §5)."""
    _, sueno, _ = serie_diaria(astronauta_id, "sueno_horas")
    _, estres, _ = serie_diaria(astronauta_id, "estres")
    poco_sueno = detectors.regla_sueno(sueno[-7:], umbrales.SUENO_MIN_HORAS, umbrales.SUENO_DIAS_SEGUIDOS).alarma
    return poco_sueno or any(e >= 7 for e in estres[-7:])


def fase(dia_mision: int | None) -> str:
    if dia_mision is None:
        return "personal"
    return "tierra" if dia_mision <= 0 else "adaptacion" if dia_mision <= 14 else "personal"


def estado_inmune(astronauta_id: int, dia_mision: int | None = None) -> immune.EstadoInmune:
    return immune.evaluar(sintomas_por_dia(astronauta_id), fase(dia_mision), contexto_riesgo(astronauta_id))


def _anomalia_inmune(m: Medicion) -> Anomaly | None:
    ei = estado_inmune(m.astronauta_id, m.dia_mision)
    if ei.estado not in ("amarillo", "rojo"):
        return None
    return Anomaly(
        senal="sintomas", detector="inmune", valor=ei.puntaje, direccion="sube", capa=m.capa,  # type: ignore[arg-type]
        fuente=m.fuente, confianza=m.confianza, nivel_sugerido="roja" if ei.estado == "rojo" else "amarilla", texto=ei.motivo,
    )


def _anomalia_isolation(astronauta_id: int, m: Medicion) -> Anomaly | None:
    vector = vectores_diarios(astronauta_id)
    if not vector:
        return None
    dias = sorted(vector)
    hoy = dias[-1]
    r = detectors.isolation_forest([vector[d] for d in dias[:-1]], vector[hoy], COLUMNAS_IF)
    if not r.alarma:
        return None
    principales = [NOMBRES.get(s, s).lower() for s in list(r.factores)[:3]]
    return Anomaly(
        senal=next(iter(r.factores)), detector="isolation_forest", z=r.puntaje, factores=r.factores,
        capa=m.capa, fuente=m.fuente, confianza=m.confianza,  # type: ignore[arg-type]
        texto=f"Combinación poco común para ti: {', '.join(principales)}",
    )


def vectores_diarios(astronauta_id: int, columnas: list[str] | None = None) -> dict[int, dict[str, float]]:
    """Día -> {señal: z contra tu normal}. Es la entrada de Isolation Forest y del modelo de ánimo."""
    vector: dict[int, dict[str, float]] = {}
    for tipo in columnas or COLUMNAS_IF:
        lb = almacen.linea_base(astronauta_id, tipo)
        sd = desviacion_efectiva(tipo, lb.desviacion) if lb else None
        if not lb or not sd:
            continue
        dias, valores, _ = serie_diaria(astronauta_id, tipo)
        for d, v in zip(dias, valores):
            vector.setdefault(d, {})[tipo] = (v - lb.media) / sd
    return vector


def _volvio_a_su_normal(astronauta_id: int, tipo: str) -> bool:
    """Los 2 últimos días dentro de tu normal: la alerta de esa señal se puede cerrar sola."""
    if tipo == "sintomas":
        return estado_inmune(astronauta_id).estado == "verde"
    dias, valores, _ = serie_diaria(astronauta_id, tipo)
    if len(valores) < 2:
        return False
    if tipo == "sueno_horas":
        return all(v >= umbrales.SUENO_MIN_HORAS for v in valores[-2:])
    ref = _referencia(valores, tipo)
    lb = almacen.linea_base(astronauta_id, tipo)
    if ref:
        media, sd = ref
    elif lb and lb.desviacion:
        media, sd = lb.media, desviacion_efectiva(tipo, lb.desviacion) or lb.desviacion
    else:
        return False
    direccion = DIRECCION.get(tipo, "ambas")
    return all(detectors._malo((v - media) / sd, direccion) < umbrales.Z_AMARILLA for v in valores[-2:])


def analizar(astronauta_id: int, ultimas: dict[str, tuple[Medicion, object]]) -> list[Anomaly]:
    """Corre todos los detectores sobre las señales que cambiaron."""
    anomalias: list[Anomaly] = []
    ultima_m: Medicion | None = None
    for tipo, (m, previa) in ultimas.items():
        if m.capa == "sim" or m.fuente == "modelo" or m.confianza < CONFIANZA_MIN_LINEA_BASE or m.detalle.get("practica"):
            continue
        ultima_m = m
        propias: list[Anomaly] = []
        if tipo == "sintomas":
            a = _anomalia_inmune(m)
            propias += [a] if a else []
        elif tipo in DIRECCION and tipo not in EXPERIMENTALES:
            for f in (_anomalia_puntual(m, previa), _anomalia_tendencia(m)):
                if f:
                    propias.append(f)
            if tipo == "sueno_horas":
                a = _anomalia_sueno(m)
                propias += [a] if a else []
        anomalias += propias
    if ultima_m and any(t in COLUMNAS_IF for t in ultimas):
        a = _anomalia_isolation(astronauta_id, ultima_m)
        if a:
            anomalias.append(a)
    return anomalias


# ---------------------------------------------------------------- pipeline

def _senales_de_alerta(alerta) -> set[str]:
    # El schema Alert no expone todas sus señales; se leen del almacén del triage (solo lectura)
    return set(triage.store.senales.get(alerta.id, [])) | {alerta.senal} | set(alerta.factores)


async def _resolver_alertas(astronauta_id: int, anomalias: list[Anomaly]) -> None:
    """Cierra una alerta solo cuando TODAS sus señales llevan 2 días en su normal.

    El triage (auditoría P2-14) encuentra la alerta por cualquiera de sus señales, así que
    resolver por una señal secundaria cerraría el episodio completo antes de tiempo.
    """
    activas_ahora = {a.senal for a in anomalias} | {s for a in anomalias for s in a.factores}
    for alerta in triage.listar(astronauta_id).activas:
        senales = _senales_de_alerta(alerta)
        if senales & activas_ahora:
            continue
        if all(_volvio_a_su_normal(astronauta_id, s) for s in senales):
            await triage.resolver(astronauta_id, alerta.senal)


async def procesar(entradas: list[MedicionIn]) -> GuardadoOut:
    guardadas: list[MedicionOut] = []
    por_astro: dict[int, dict[str, tuple[Medicion, object]]] = {}
    dia_por_astro: dict[int, int | None] = {}
    alerta_id = None

    for e in entradas:
        datos = e.model_dump()
        m, previa = almacen.guardar(**datos)
        salida = MedicionOut(**{**datos, "id": m.id, "fecha": m.fecha})
        guardadas.append(salida)
        await broadcast("measurement_added", jsonable_encoder(salida))
        por_astro.setdefault(m.astronauta_id, {})[m.tipo] = (m, previa)
        if e.dia_mision is not None:
            dia_por_astro[m.astronauta_id] = e.dia_mision
        else:
            dia_por_astro.setdefault(m.astronauta_id, None)

    # El astronauta 1 al final: el front muestra el último status_changed que recibe
    for astro, ultimas in sorted(por_astro.items(), key=lambda kv: (kv[0] == 1, kv[0])):
        anomalias = analizar(astro, ultimas)
        dia = dia_por_astro.get(astro)
        if anomalias:
            alerta = await triage.handle_anomalies(astro, anomalias, dia_mision=dia)
            if alerta and alerta_id is None:
                alerta_id = alerta.id
        await _resolver_alertas(astro, anomalias)

        estado = construir_estado(astro)
        await broadcast("status_changed", jsonable_encoder(estado))
        antes = _calibracion_previa.get(astro, 0)
        despues = estado.calibracion
        if despues != antes:
            _calibracion_previa[astro] = despues
            # Las dos formas que esperan Front 2 ({calibracion}) y el contrato de Back 2 ({antes, despues, delta})
            await broadcast("calibration_changed", {"astronauta_id": astro, "calibracion": despues,
                                                    "antes": antes, "despues": despues, "delta": despues - antes})

    return GuardadoOut(guardadas=len(guardadas), mediciones=guardadas, alerta_id=alerta_id)


@router.post("", response_model=GuardadoOut, status_code=201)
async def guardar(body: MedicionIn | list[MedicionIn]):
    entradas = body if isinstance(body, list) else [body]
    return await procesar(entradas)


def fecha_de_dia(dia: int, ultimo_dia: int = 35) -> datetime:
    """Fecha sintética de un día de misión (el simulador la usa para que /indicators?range=30d lo muestre)."""
    hoy = datetime.now(timezone.utc).replace(hour=8, minute=0, second=0, microsecond=0)
    return hoy - timedelta(days=ultimo_dia - dia)


def estado_animo(astronauta_id: int) -> mood_model.ResultadoAnimo:
    """Junta los días con chequeo de cámara y ánimo reportado y entrena el modelo personal."""
    vector = vectores_diarios(astronauta_id, mood_model.COLUMNAS)
    dias_animo, animo, _ = serie_diaria(astronauta_id, "animo")
    etiqueta = dict(zip(dias_animo, animo))
    dias = [d for d in sorted(vector) if d in etiqueta and mood_model.DE_CAMARA & vector[d].keys()]
    hoy = vector[max(vector)] if vector else None
    return mood_model.entrenar([vector[d] for d in dias], [etiqueta[d] for d in dias], hoy)
