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
    "hr_reposo": "Ritmo en reposo", "presion_sis": "Presión sistólica", "presion_dia": "Presión diastólica",
    "perclos": "Fatiga visual (PERCLOS)", "parpadeo_min": "Parpadeos por minuto", "sueno_horas": "Horas de sueño",
    "sueno_eficiencia_pct": "Eficiencia del sueño", "sueno_calidad": "Calidad del sueño", "reaccion_ms": "Tiempo de reacción",
    "lapsos": "Lapsos de atención", "animo": "Ánimo", "estres": "Estrés", "sintomas": "Síntomas",
    "hrv_rmssd": "Variabilidad del ritmo (VFC)", "resp_rpm": "Respiración", "expresividad": "Expresividad facial",
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


def _fuera_de_rango(tipo: str, valor: float) -> str | None:
    rango = umbrales.RANGOS_CLINICOS.get(tipo)
    if not rango:
        return None
    lo, hi = rango
    if lo <= valor <= hi:
        return None
    # Hasta 20% fuera del límite es amarillo; más allá, rojo
    limite = hi if valor > hi else lo
    exceso = abs(valor - limite) / (abs(limite) or 1)
    return "rojo" if exceso > 0.2 else "amarillo"


def evaluar_senal(tipo: str, valor: float, lb: LineaBase | None) -> EstadoSenal:
    nombre = NOMBRES.get(tipo, tipo)
    clinico = _fuera_de_rango(tipo, valor)
    if clinico:
        return EstadoSenal(tipo, valor, clinico, f"{nombre} fuera del rango clínico de referencia")
    # Reglas simples para señales sin rango clínico
    if tipo == "sueno_horas" and valor < umbrales.SUENO_MIN_HORAS:
        return EstadoSenal(tipo, valor, "amarillo", f"Dormiste {valor:.1f} h, menos de {umbrales.SUENO_MIN_HORAS:g} h")
    if tipo == "animo" and valor <= 2:
        return EstadoSenal(tipo, valor, "amarillo", "Ánimo bajo reportado")
    if tipo == "estres" and valor >= 8:
        return EstadoSenal(tipo, valor, "amarillo", "Estrés alto reportado")
    if tipo == "sintomas" and valor >= 3:
        return EstadoSenal(tipo, valor, "amarillo", f"{valor:g} síntomas reportados")
    z = zscore(lb, valor) if lb else None
    if z is not None:
        direccion = DIRECCION.get(tipo, "ambas")
        malo = abs(z) if direccion == "ambas" else (z if direccion == "sube" else -z)
        if malo >= umbrales.Z_ROJA:
            return EstadoSenal(tipo, valor, "rojo", f"{nombre} muy fuera de tu normal", z)
        if malo >= umbrales.Z_AMARILLA:
            return EstadoSenal(tipo, valor, "amarillo", f"{nombre} fuera de tu normal", z)
    return EstadoSenal(tipo, valor, "verde", f"{nombre} dentro de lo esperado", z)


def _formato(tipo: str, valor: float) -> str:
    if tipo == "hr_reposo":
        return f"{valor:.0f} lpm"
    if tipo == "perclos":
        return f"{valor:.2f}"
    if tipo == "reaccion_ms":
        return f"{valor:.0f} ms"
    if tipo == "sintomas":
        return "sin síntomas" if valor == 0 else f"{valor:.0f} síntomas"
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

    con_dato = [lineas[t].peso_personal for t in ultimos if t in lineas and t in DIRECCION and t not in EXPERIMENTALES]
    calibracion = round(100 * sum(con_dato) / len(con_dato)) if con_dato else 0
    return Estado(readiness=readiness, factores=factores, sistemas=sistemas, calibracion=calibracion, senales=senales)
