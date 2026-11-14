"""Umbrales compartidos por el semáforo de /status (Back 1) y el triage (Back 2).

Lo editan ambos: si cambias un valor, avisa y anótalo en docs/motor.md.
"""

# z-score contra la línea base personal
Z_AMARILLA = 2.0
Z_ROJA = 3.0

# Rango clínico seguro (fuera de esto se alerta incluso en fase de adaptación)
RANGOS_CLINICOS: dict[str, tuple[float, float]] = {
    "hr_reposo": (60.0, 100.0),
    "presion_sis": (90.0, 140.0),
    "presion_dia": (60.0, 90.0),
    "resp_rpm": (12.0, 20.0),
    "perclos": (0.0, 0.15),
}

# Regla de sueño: deuda de sueño
SUENO_MIN_HORAS = 6.0
SUENO_DIAS_SEGUIDOS = 3

# Detectores que valen en fase de adaptación (días 1 a 14).
# "inmune" se trata como clínico porque viene de reglas de síntomas, no de la línea base.
DETECTORES_ADAPTACION = {"rango_clinico", "inmune"}

# Nivel por defecto de cada detector cuando la anomalía no trae z
NIVEL_POR_DETECTOR: dict[str, str] = {
    "zscore": "amarilla",
    "ewma": "amarilla",
    "cusum": "amarilla",
    "isolation_forest": "amarilla",
    "sueno": "amarilla",
    "rango_clinico": "roja",
    "inmune": "amarilla",
}

# Si en el mismo momento hay N o más señales distintas fuera de lo normal, el nivel sube a roja
SENALES_PARA_SUBIR_NIVEL = 3

# Prioridad en la cola hacia Tierra (1 = más urgente)
PRIORIDAD_COLA = {"roja": 1, "amarilla": 2, "reporte": 3}
