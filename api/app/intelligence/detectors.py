"""Detectores estadísticos del motor (docs/motor.md, sección 3). Funciones puras.

Reciben series de valores (en orden de tiempo) y la referencia de tu normal (media y
desviación). Regresan dataclasses; no saben nada de FastAPI ni de la base de datos.

- EWMA: deriva lenta.
- CUSUM: cambio sostenido y desde cuándo empezó.
- Regla de sueño: deuda de sueño de varios días seguidos.
- Isolation Forest: combinación rara de señales en el vector diario (no supervisado).
"""

from dataclasses import dataclass, field
from math import sqrt

import numpy as np

# Parámetros (ajustable, documentados en motor.md)
EWMA_LAMBDA = 0.2
EWMA_L = 3.0
CUSUM_K = 0.5  # en desviaciones
CUSUM_H = 5.0  # en desviaciones
IF_MIN_DIAS = 14
IF_CONTAMINATION = 0.05
IF_SEMILLA = 42
IF_Z_MIN_FACTOR = 2.0  # una señal "explica" la rareza si su |z| llega a esto
IF_MIN_FACTORES = 2  # sin al menos 2 señales que lo expliquen, no se avisa


def _malo(desvio: float, direccion: str) -> float:
    """Convierte un desvío con signo en "cuánto empeora" según la dirección mala de la señal."""
    if direccion == "sube":
        return desvio
    if direccion == "baja":
        return -desvio
    return abs(desvio)


@dataclass
class ResultadoEwma:
    alarma: bool
    ewma: float
    limite: float


def ewma(serie: list[float], media: float, desviacion: float, direccion: str = "ambas",
         lam: float = EWMA_LAMBDA, L: float = EWMA_L) -> ResultadoEwma | None:
    """EWMA con límite asintótico L·σ·sqrt(λ / (2 − λ))."""
    if not serie or not desviacion:
        return None
    z = media
    for x in serie:
        z = lam * x + (1 - lam) * z
    limite = L * desviacion * sqrt(lam / (2 - lam))
    return ResultadoEwma(alarma=_malo(z - media, direccion) > limite, ewma=z, limite=limite)


@dataclass
class ResultadoCusum:
    alarma: bool
    indice_desde: int | None  # posición en la serie donde empezó el cambio
    s: float  # suma acumulada en desviaciones
    lado: str | None = None  # "sube" | "baja"


def cusum(serie: list[float], media: float, desviacion: float, direccion: str = "ambas",
          k: float = CUSUM_K, h: float = CUSUM_H) -> ResultadoCusum | None:
    """CUSUM tabular en unidades de σ.

    Solo avisa mientras el cambio sigue: si el último valor ya volvió cerca de tu normal
    (menos de k·σ hacia el lado malo), no hay alarma aunque la suma siga alta. Así la
    alerta se puede resolver sola cuando la persona se recupera.
    """
    if not serie or not desviacion:
        return None
    lados = ["sube", "baja"] if direccion == "ambas" else [direccion]
    mejor: ResultadoCusum | None = None
    for lado in lados:
        signo = 1.0 if lado == "sube" else -1.0
        s, inicio = 0.0, None
        for i, x in enumerate(serie):
            paso = signo * (x - media) / desviacion - k
            nuevo = max(0.0, s + paso)
            if s == 0.0 and nuevo > 0.0:
                inicio = i
            if nuevo == 0.0:
                inicio = None
            s = nuevo
        sigue = signo * (serie[-1] - media) / desviacion > k
        r = ResultadoCusum(alarma=s > h and sigue, indice_desde=inicio, s=s, lado=lado)
        if mejor is None or r.s > mejor.s:
            mejor = r
    return mejor


@dataclass
class ResultadoSueno:
    alarma: bool
    dias: int  # días seguidos con poco sueño, contando hacia atrás desde el último
    indice_desde: int | None


def regla_sueno(horas_por_dia: list[float], minimo: float, dias_seguidos: int) -> ResultadoSueno:
    racha = 0
    for h in reversed(horas_por_dia):
        if h < minimo:
            racha += 1
        else:
            break
    desde = len(horas_por_dia) - racha if racha else None
    return ResultadoSueno(alarma=racha >= dias_seguidos, dias=racha, indice_desde=desde)


@dataclass
class ResultadoIsolation:
    activo: bool  # False mientras no hay días suficientes
    alarma: bool = False
    puntaje: float | None = None  # más negativo = más raro
    factores: dict[str, float] = field(default_factory=dict)  # signal -> % contribution
    z_hoy: dict[str, float] = field(default_factory=dict)
    dias: int = 0


def isolation_forest(historial: list[dict[str, float]], hoy: dict[str, float],
                     columnas: list[str]) -> ResultadoIsolation:
    """Combinación rara de señales en el día de hoy contra tus días anteriores.

    historial: un diccionario por día anterior con el z-score de cada señal (contra tu normal).
    hoy: el z-score de cada señal hoy. Las señales que falten valen 0 (= en tu normal).

    No supervisado: nadie le dice qué día fue malo. Aprende cómo se ven tus días normales
    y avisa cuando hoy no se parece a ninguno. Para que no sea una caja negra, solo se avisa
    si al menos 2 señales están claramente fuera (|z| ≥ 2) y esas son la explicación.
    """
    dias = len(historial)
    if dias < IF_MIN_DIAS or not columnas:
        return ResultadoIsolation(activo=False, dias=dias)

    from sklearn.ensemble import IsolationForest  # import tardío: la API arranca rápido

    X = np.array([[d.get(c, 0.0) for c in columnas] for d in historial], dtype=float)
    x_hoy = np.array([[hoy.get(c, 0.0) for c in columnas]], dtype=float)
    modelo = IsolationForest(n_estimators=100, contamination=IF_CONTAMINATION, random_state=IF_SEMILLA)
    modelo.fit(X)
    raro = bool(modelo.predict(x_hoy)[0] == -1)
    puntaje = float(modelo.score_samples(x_hoy)[0])

    fuertes = {c: abs(hoy.get(c, 0.0)) for c in columnas if abs(hoy.get(c, 0.0)) >= IF_Z_MIN_FACTOR}
    total = sum(fuertes.values()) or 1.0
    factores = {c: round(100 * v / total, 1) for c, v in sorted(fuertes.items(), key=lambda kv: -kv[1])}
    alarma = raro and len(fuertes) >= IF_MIN_FACTORES
    return ResultadoIsolation(activo=True, alarma=alarma, puntaje=round(puntaje, 4), factores=factores,
                              z_hoy={c: round(hoy.get(c, 0.0), 2) for c in columnas}, dias=dias)
