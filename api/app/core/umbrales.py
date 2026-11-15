"""Umbrales compartidos por el semáforo de /status (Back 1) y el triage (Back 2).

Lo editan ambos: si cambias un valor, avisa y anótalo en docs/motor.md.
Los rangos son una propuesta del equipo para la demo, NO son criterio médico.
"""

# z-score contra la línea base personal
Z_AMARILLA = 2.0
Z_ROJA = 3.0

# Fuera de esto: amarilla ("vale la pena revisarlo")
# hr 50: en personas en forma 45-50 lpm en reposo puede ser normal (Harvard Health, bradicardia)
# presión 140/90: etapa 2 de la guía AHA/ACC
RANGOS_ATENCION: dict[str, tuple[float, float]] = {
    "hr_reposo": (50.0, 100.0),
    "presion_sis": (90.0, 140.0),
    "presion_dia": (60.0, 90.0),
}

# Fuera de esto: roja. Presión > 180/120 = hipertensión severa (AHA/ACC).
# PERCLOS y resp_rpm de cámara NO van aquí: son lecturas de cámara, no rangos clínicos.
RANGOS_CLINICOS: dict[str, tuple[float, float]] = {
    "hr_reposo": (40.0, 130.0),
    "presion_sis": (80.0, 180.0),
    "presion_dia": (45.0, 120.0),
}


def clasificar_rango(tipo: str, valor: float) -> str | None:
    """'roja' if it leaves the clinical range, 'amarilla' si sale del de atención, None si está dentro.

    Back 1 lo usa para mandar detector="rango_clinico" con nivel_sugerido=clasificar_rango(...).
    """
    lo, hi = RANGOS_CLINICOS.get(tipo, (float("-inf"), float("inf")))
    if not lo <= valor <= hi:
        return "roja"
    lo, hi = RANGOS_ATENCION.get(tipo, (float("-inf"), float("inf")))
    if not lo <= valor <= hi:
        return "amarilla"
    return None


# Regla de sueño: deuda de sueño
SUENO_MIN_HORAS = 6.0
SUENO_DIAS_SEGUIDOS = 3

# Detectores que valen en fase de adaptación (días 1 a 14).
# "inmune" se trata como clínico porque viene de reglas de síntomas, no de la línea base.
DETECTORES_ADAPTACION = {"rango_clinico", "inmune"}

# Nivel por defecto de cada detector cuando la anomalía no trae z ni nivel_sugerido.
# rango_clinico sin nivel ni valor queda en amarilla: lo conservador es no inventar una roja.
NIVEL_POR_DETECTOR: dict[str, str] = {
    "zscore": "amarilla",
    "ewma": "amarilla",
    "cusum": "amarilla",
    "isolation_forest": "amarilla",
    "sueno": "amarilla",
    "rango_clinico": "amarilla",
    "inmune": "amarilla",
}

# Confianza (0 a 1) que trae cada lectura.
# motor.md: con confianza < 0.5 no se actualiza la línea base; tampoco alerta.
CONFIANZA_MIN_ALERTA = 0.5
# Una lectura de cámara sola necesita esta confianza para llegar a roja
CONFIANZA_MIN_ROJA_CAMARA = 0.7

# Origen físico de cada señal. Señales del mismo origen NO son independientes:
# hr, VFC y respiración salen de la misma onda rPPG; un video malo las ensucia a las tres.
ORIGEN: dict[str, str] = {
    "hr_reposo": "rppg",
    "hrv_rmssd": "rppg",
    "resp_rpm": "rppg",
    "perclos": "ojos",
    "parpadeo_min": "ojos",
    "parpadeo_dur_ms": "ojos",
    "expresividad": "expresion",
    "sonrisa_media": "expresion",
    "ceno_medio": "expresion",
    "movimiento_cabeza": "expresion",
    "presion_sis": "presion",
    "presion_dia": "presion",
    "reaccion_ms": "prueba",
    "lapsos": "prueba",
    "sueno_horas": "sueno",
    "sueno_eficiencia_pct": "sueno",
    "sueno_latencia_min": "sueno",
    "sueno_waso_min": "sueno",
    "sueno_despertares": "sueno",
    "sueno_calidad": "sueno",
}

# Si hay N o más ORÍGENES independientes fuera de lo normal a la vez, el nivel sube a roja
SENALES_PARA_SUBIR_NIVEL = 3

# Prioridad en la cola hacia Tierra (1 = más urgente)
PRIORIDAD_COLA = {"roja": 1, "amarilla": 2, "reporte": 3}
