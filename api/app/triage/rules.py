"""Reglas del triage: de una lista de anomalías a una decisión de alerta.

Funciones puras (sin FastAPI ni base de datos) para poder probarlas con pytest.
Una llamada = un astronauta en un momento. Sale como mucho UNA decisión con la
señal principal y los factores de todas las señales que contribuyeron.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

from app.core import umbrales
from app.schemas.anomaly import Anomaly, Nivel

Fase = Literal["tierra", "adaptacion", "personal"]

NOMBRES = {
    "hr_reposo": "Ritmo en reposo",
    "hrv_rmssd": "Variabilidad del ritmo",
    "hrv_sdnn": "Variabilidad del ritmo",
    "resp_rpm": "Respiración",
    "presion_sis": "Presión sistólica",
    "presion_dia": "Presión diastólica",
    "perclos": "Fatiga ocular (PERCLOS)",
    "parpadeo_min": "Parpadeos por minuto",
    "parpadeo_dur_ms": "Duración del parpadeo",
    "sueno_horas": "Horas de sueño",
    "sueno_eficiencia_pct": "Eficiencia del sueño",
    "reaccion_ms": "Tiempo de reacción",
    "lapsos": "Lapsos de atención",
    "animo": "Ánimo",
    "estres": "Estrés",
    "expresividad": "Expresividad",
    "movimiento_cabeza": "Inquietud",
    "sintomas": "Síntomas",
    "inmune": "Sistema inmune",
}

_ORDEN_NIVEL = {"amarilla": 1, "roja": 2}


@dataclass
class Decision:
    nivel: Nivel
    senal: str
    senales: list[str]
    que_cambio: str
    cuanto: str | None
    desde: datetime | None
    factores: dict[str, float]
    detectores: list[str] = field(default_factory=list)


def fase_de_dia(dia_mision: int | None) -> Fase:
    if dia_mision is None:
        return "personal"
    if dia_mision <= 0:
        return "tierra"
    if dia_mision <= 14:
        return "adaptacion"
    return "personal"


def nombre(senal: str) -> str:
    return NOMBRES.get(senal, senal)


def max_nivel(a: Nivel, b: Nivel) -> Nivel:
    return a if _ORDEN_NIVEL[a] >= _ORDEN_NIVEL[b] else b


def filtrar(anomalias: list[Anomaly], fase: Fase) -> list[Anomaly]:
    """Regla de honestidad + fases."""
    validas = [a for a in anomalias if a.capa != "sim" and a.fuente != "modelo"]
    if fase == "tierra":
        return []
    if fase == "adaptacion":
        return [a for a in validas if a.detector in umbrales.DETECTORES_ADAPTACION]
    return validas


def nivel_de(a: Anomaly) -> Nivel:
    if a.nivel_sugerido:
        return a.nivel_sugerido
    if a.z is not None:
        if abs(a.z) >= umbrales.Z_ROJA:
            return "roja"
        if abs(a.z) >= umbrales.Z_AMARILLA:
            return "amarilla"
    return umbrales.NIVEL_POR_DETECTOR.get(a.detector, "amarilla")  # type: ignore[return-value]


def calcular_factores(anomalias: list[Anomaly]) -> dict[str, float]:
    """|z_i| / Σ|z| en porcentaje, por señal. Si el motor ya mandó factores, se usan esos."""
    for a in anomalias:
        if a.factores:
            return {k: round(v, 1) for k, v in a.factores.items()}
    pesos: dict[str, float] = {}
    for a in anomalias:
        peso = abs(a.z) if a.z is not None else 1.0
        pesos[a.senal] = max(pesos.get(a.senal, 0.0), peso)
    total = sum(pesos.values()) or 1.0
    return {k: round(100 * v / total, 1) for k, v in sorted(pesos.items(), key=lambda kv: -kv[1])}


def _cuanto(a: Anomaly) -> str | None:
    partes = []
    if a.valor is not None and a.referencia is not None:
        partes.append(f"{a.valor:g} vs {a.referencia:g} de tu normal")
    if a.z is not None:
        partes.append(f"{a.z:+.1f} σ")
    return ", ".join(partes) or None


def _que_cambio(a: Anomaly) -> str:
    if a.texto:
        return a.texto
    verbo = {"sube": "sube", "baja": "baja"}.get(a.direccion or "", "cambia")
    return f"{nombre(a.senal)} {verbo} fuera de tu normal"


def evaluar(anomalias: list[Anomaly], fase: Fase = "personal") -> Decision | None:
    validas = filtrar(anomalias, fase)
    if not validas:
        return None

    nivel: Nivel = "amarilla"
    for a in validas:
        nivel = max_nivel(nivel, nivel_de(a))

    senales = list(dict.fromkeys(a.senal for a in validas))
    if len(senales) >= umbrales.SENALES_PARA_SUBIR_NIVEL:
        nivel = "roja"

    factores = calcular_factores(validas)
    # Principal: la de mayor contribución; empate -> la de nivel más alto
    principal_senal = max(senales, key=lambda s: factores.get(s, 0.0))
    principal = max(
        (a for a in validas if a.senal == principal_senal),
        key=lambda a: (_ORDEN_NIVEL[nivel_de(a)], abs(a.z or 0)),
    )
    desdes = [a.desde for a in validas if a.desde is not None]

    return Decision(
        nivel=nivel,
        senal=principal_senal,
        senales=senales,
        que_cambio=_que_cambio(principal),
        cuanto=_cuanto(principal),
        desde=min(desdes) if desdes else None,
        factores=factores,
        detectores=sorted({a.detector for a in validas}),
    )
