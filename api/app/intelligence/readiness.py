"""Semáforo por sistema y disposición para la misión (readiness), a partir del último valor
de cada señal y su línea base. Funciones puras, versión mínima de integración."""

from dataclasses import dataclass, field

from app.core import umbrales
from app.intelligence.baseline import LineaBase, zscore

# Hacia dónde es "malo" que se mueva cada señal (lista cerrada de api/CLAUDE.md)
DIRECCION: dict[str, str] = {
    "hr_reposo": "ambas", "presion_sis": "sube", "presion_dia": "sube", "resp_rpm": "ambas",
    "hrv_rmssd": "baja", "hrv_sdnn": "baja",
    "perclos": "sube", "parpadeo_min": "ambas", "sueno_horas": "baja", "sueno_eficiencia_pct": "baja",
    "sueno_calidad": "baja", "reaccion_ms": "sube", "lapsos": "sube",
    "animo": "baja", "estres": "sube", "sintomas": "sube", "expresividad": "ambas",
}

# Señales experimentales de la cámara: se guardan y entran a tu normal, pero todavía no
# levantan alertas ni bajan la disponibilidad (la VFC y la respiración por cámara son ruidosas)
EXPERIMENTALES = {"hrv_rmssd", "resp_rpm"}

SISTEMAS: dict[str, list[str]] = {
    "cardiovascular": ["hr_reposo", "presion_sis", "presion_dia", "hrv_rmssd", "hrv_sdnn", "resp_rpm"],
    "sueno": ["perclos", "parpadeo_min", "sueno_horas", "sueno_eficiencia_pct", "sueno_calidad"],
    "mental": ["reaccion_ms", "lapsos", "animo", "estres", "expresividad"],
    "inmune": ["sintomas"],
}

NOMBRES = {
    "hr_reposo": "Resting heart rate", "presion_sis": "Systolic pressure", "presion_dia": "Diastolic pressure",
    "perclos": "Visual fatigue (PERCLOS)", "parpadeo_min": "Blinks per minute", "sueno_horas": "Hours of sleep",
    "sueno_eficiencia_pct": "Sleep efficiency", "sueno_calidad": "Sleep quality", "reaccion_ms": "Reaction time",
    "lapsos": "Attention lapses", "animo": "Mood", "estres": "Stress", "sintomas": "Symptoms",
    "hrv_rmssd": "Heart rate variability (HRV)", "resp_rpm": "Breathing", "expresividad": "Facial expressiveness",
}

PENALIZACION = {"amarillo": 8, "rojo": 20}
_ORDEN = {"sin_datos": 0, "verde": 1, "amarillo": 2, "rojo": 3}


@dataclass
class EstadoSenal:
    tipo: str
    valor: float
    estado: str  # verde | amarillo | rojo
    motivo: str
    z: float | None = None


# PERCLOS y respiración por cámara no son rangos clínicos (auditoría P0-3): fuera del umbral
# solo dan amarillo "de atención" y nunca rojo por sí solos.
NO_CLINICOS = {"perclos", "resp_rpm"}
UMBRAL_PERCLOS = 0.15


def _fuera_de_rango(tipo: str, valor: float) -> str | None:
    """Rangos compartidos con el triage (core/umbrales.py): fuera del clínico rojo, fuera del de atención amarillo."""
    if tipo in NO_CLINICOS:
        return None
    nivel = umbrales.clasificar_rango(tipo, valor)
    return {"roja": "rojo", "amarilla": "amarillo"}.get(nivel) if nivel else None


def evaluar_senal(tipo: str, valor: float, lb: LineaBase | None) -> EstadoSenal:
    nombre = NOMBRES.get(tipo, tipo)
    clinico = _fuera_de_rango(tipo, valor)
    if clinico:
        rango = "clinical" if clinico == "rojo" else "watch"
        return EstadoSenal(tipo, valor, clinico, f"{nombre} outside the {rango} reference range")
    # Reglas simples para señales sin rango clínico
    if tipo == "perclos" and valor > UMBRAL_PERCLOS:
        return EstadoSenal(tipo, valor, "amarillo", f"Visual fatigue (PERCLOS {valor:.2f}) above the {UMBRAL_PERCLOS} threshold")
    if tipo == "sueno_horas" and valor < umbrales.SUENO_MIN_HORAS:
        return EstadoSenal(tipo, valor, "amarillo", f"You slept {valor:.1f} h, less than {umbrales.SUENO_MIN_HORAS:g} h")
    if tipo == "animo" and valor <= 2:
        return EstadoSenal(tipo, valor, "amarillo", "Low mood reported")
    if tipo == "estres" and valor >= 8:
        return EstadoSenal(tipo, valor, "amarillo", "High stress reported")
    if tipo == "sintomas" and valor >= 3:
        return EstadoSenal(tipo, valor, "amarillo", f"{valor:g} symptoms reported")
    z = zscore(lb, valor, tipo) if lb else None
    if z is not None:
        direccion = DIRECCION.get(tipo, "ambas")
        malo = abs(z) if direccion == "ambas" else (z if direccion == "sube" else -z)
        if malo >= umbrales.Z_ROJA:
            return EstadoSenal(tipo, valor, "rojo", f"{nombre} far outside your normal", z)
        if malo >= umbrales.Z_AMARILLA:
            return EstadoSenal(tipo, valor, "amarillo", f"{nombre} outside your normal", z)
    return EstadoSenal(tipo, valor, "verde", f"{nombre} as expected", z)


def _formato(tipo: str, valor: float) -> str:
    if tipo == "hr_reposo":
        return f"{valor:.0f} bpm"
    if tipo == "perclos":
        return f"{valor:.2f}"
    if tipo == "reaccion_ms":
        return f"{valor:.0f} ms"
    if tipo == "sintomas":
        return "no symptoms" if valor == 0 else f"{valor:.0f} symptoms"
    if tipo.startswith("presion"):
        return f"{valor:.0f} mmHg"
    if tipo == "sueno_horas":
        return f"{valor:.1f} h"
    return f"{valor:g}"


@dataclass
class Estado:
    readiness: int
    factores: list[dict] = field(default_factory=list)
    sistemas: dict[str, dict] = field(default_factory=dict)
    calibracion: int = 0
    senales: list[EstadoSenal] = field(default_factory=list)


def calcular_estado(ultimos: dict[str, float], lineas: dict[str, LineaBase]) -> Estado:
    """ultimos: tipo -> último valor. lineas: tipo -> línea base ANTES de ese valor."""
    senales = [evaluar_senal(t, v, lineas.get(t)) for t, v in ultimos.items() if t in DIRECCION and t not in EXPERIMENTALES]
    por_tipo = {s.tipo: s for s in senales}

    sistemas: dict[str, dict] = {}
    for sistema, tipos in SISTEMAS.items():
        presentes = [por_tipo[t] for t in tipos if t in por_tipo]
        if not presentes:
            sistemas[sistema] = {"estado": "sin_datos", "valor": None}
            continue
        peor = max(presentes, key=lambda s: _ORDEN[s.estado])
        principal = presentes[0]
        sistemas[sistema] = {"estado": peor.estado, "valor": _formato(principal.tipo, principal.valor)}

    malas = [s for s in senales if s.estado in PENALIZACION]
    total = sum(PENALIZACION[s.estado] for s in malas)
    factores = [
        {"label": s.motivo, "delta": -PENALIZACION[s.estado], "peso": round(100 * PENALIZACION[s.estado] / (total or 1))}
        for s in sorted(malas, key=lambda s: -PENALIZACION[s.estado])
    ]
    readiness = max(20, 100 - total)
    calibracion = calibracion_ponderada({t: lb.n for t, lb in lineas.items()})

    return Estado(readiness=readiness, factores=factores, sistemas=sistemas, calibracion=calibracion, senales=senales)


# motor.md §3: calibración general = promedio ponderado de peso_personal
PESOS_CALIBRACION = {"hr_reposo": 0.25, "perclos": 0.25, "reaccion_ms": 0.20, "presion_sis": 0.15, "animo": 0.15}


def calibracion_ponderada(n_por_tipo: dict[str, int]) -> int:
    from app.intelligence.baseline import peso_personal

    total = sum(PESOS_CALIBRACION.values())
    return round(100 * sum(w * peso_personal(n_por_tipo.get(t, 0)) for t, w in PESOS_CALIBRACION.items()) / total)
