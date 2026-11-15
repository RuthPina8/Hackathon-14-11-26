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


def zscore(lb: LineaBase, valor: float) -> float | None:
    """z contra tu normal. Necesita al menos 3 datos y una desviación distinta de cero."""
    sd = lb.desviacion
    if lb.n < 3 or not sd:
        return None
    return (valor - lb.media) / sd
