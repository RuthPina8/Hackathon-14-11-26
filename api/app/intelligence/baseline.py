"""Línea base personal: media y desviación que se actualizan medición a medición (Welford).

Versión mínima de integración. La especificación completa (EWMA, CUSUM, fases) está en docs/motor.md.
"""

from dataclasses import dataclass
from math import sqrt

K_ARRANQUE = 7  # peso_personal = n / (n + 7)


@dataclass
class LineaBase:
    n: int = 0
    media: float = 0.0
    m2: float = 0.0  # suma de cuadrados de las diferencias, para la desviación

    @property
    def desviacion(self) -> float | None:
        if self.n < 2:
            return None
        return sqrt(self.m2 / (self.n - 1))

    @property
    def peso_personal(self) -> float:
        return peso_personal(self.n)


def peso_personal(n: int) -> float:
    """Arranque en frío: con pocos datos manda el rango clínico, con muchos manda tu normal."""
    return n / (n + K_ARRANQUE)


def actualizar(lb: LineaBase, valor: float) -> LineaBase:
    n = lb.n + 1
    delta = valor - lb.media
    media = lb.media + delta / n
    m2 = lb.m2 + delta * (valor - media)
    return LineaBase(n=n, media=media, m2=m2)


# Cambio mínimo con significado por señal (resolución de la medición o del autorreporte).
# Evita que una desviación muy chica, o un brinco de 1 punto en una escala entera, parezca anomalía.
SD_MINIMA: dict[str, float] = {
    "hr_reposo": 2.0, "hrv_rmssd": 4.0, "hrv_sdnn": 4.0, "resp_rpm": 1.5,
    "presion_sis": 5.0, "presion_dia": 4.0, "perclos": 0.01, "parpadeo_min": 2.0,
    "sueno_horas": 0.4, "sueno_eficiencia_pct": 4.0, "sueno_calidad": 0.8, "reaccion_ms": 15.0,
    "lapsos": 1.0, "animo": 0.8, "estres": 1.2, "sintomas": 1.0,
    "expresividad": 0.08, "sonrisa_media": 0.04, "ceno_medio": 0.03, "movimiento_cabeza": 0.02,
}


def desviacion_efectiva(tipo: str | None, sd: float | None) -> float | None:
    if sd is None:
        return None
    return max(sd, SD_MINIMA.get(tipo or "", 0.0))


def zscore(lb: LineaBase, valor: float, tipo: str | None = None) -> float | None:
    """z contra tu normal. Necesita al menos 3 datos y una desviación distinta de cero."""
    sd = desviacion_efectiva(tipo, lb.desviacion)
    if lb.n < 3 or not sd:
        return None
    return (valor - lb.media) / sd
