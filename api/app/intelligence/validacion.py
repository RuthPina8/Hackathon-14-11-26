"""Confiabilidad de la cámara: qué tanto se parece su ritmo al de un aparato de referencia. Funciones puras.

Por qué así (lo que dice la literatura):
- No hay un umbral universal de SNR o confianza que garantice precisión: los umbrales calibrados en
  una base de datos no se transfieren a otra cámara o luz. Hay que calibrarlos con datos propios.
- Las métricas estándar de validación de rPPG son MAE, RMSE, correlación de Pearson, Bland-Altman
  (sesgo y límites de acuerdo, ±1.96 SD) y la tasa de éxito: % de lecturas con error <= 5 lpm.
- Referencia publicada del método POS: ~1 a 4 lpm de MAE en UBFC-rPPG y PURE (sujetos quietos, buena luz).

El "umbral verificado" es la confianza mínima a partir de la cual, con NUESTROS pares, al menos el
90% de las lecturas cae a ±5 lpm del aparato de referencia. Sin pares suficientes no se inventa:
se dice "sin validar" y se muestra la referencia publicada.
"""

from dataclasses import dataclass, field
from math import sqrt

TOLERANCIA_LPM = 5.0
EXITO_OBJETIVO = 0.90
MIN_PARES = 10  # con menos no se declara un umbral
MIN_PARES_TRAMO = 5
CORTES = (0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9)

REFERENCIA_PUBLICADA = {
    "metodo": "POS (Wang et al. 2017)",
    "mae_lpm": [1.0, 4.0],
    "bases": ["UBFC-rPPG", "PURE"],
    "nota": "Sujetos quietos y luz controlada; con movimiento, poca luz o piel más oscura el error sube.",
}


@dataclass
class Par:
    camara: float
    referencia: float
    confianza: float
    origen: str = "propio"  # propio | UBFC-rPPG | PURE | ...


@dataclass
class Metricas:
    n: int
    mae: float | None = None
    rmse: float | None = None
    sesgo: float | None = None  # Bland-Altman: promedio de (cámara - referencia)
    loa: tuple[float, float] | None = None  # límites de acuerdo al 95%
    pearson: float | None = None
    exito_5: float | None = None  # fracción con |error| <= 5 lpm


@dataclass
class Tramo:
    desde: float
    n: int
    mae: float | None
    exito_5: float | None


@dataclass
class Confiabilidad:
    global_: Metricas
    por_origen: dict[str, Metricas] = field(default_factory=dict)
    tramos: list[Tramo] = field(default_factory=list)
    umbral: float | None = None  # confianza mínima verificada
    sobre_umbral: Metricas | None = None
    estado: str = "sin_validar"  # sin_validar | validando | verificado
    explicacion: str = ""


def metricas(pares: list[Par]) -> Metricas:
    n = len(pares)
    if n == 0:
        return Metricas(n=0)
    err = [p.camara - p.referencia for p in pares]
    mae = sum(abs(e) for e in err) / n
    rmse = sqrt(sum(e * e for e in err) / n)
    sesgo = sum(err) / n
    sd = sqrt(sum((e - sesgo) ** 2 for e in err) / (n - 1)) if n > 1 else 0.0
    pearson = None
    if n >= 3:
        xs, ys = [p.camara for p in pares], [p.referencia for p in pares]
        mx, my = sum(xs) / n, sum(ys) / n
        sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
        sxx = sum((x - mx) ** 2 for x in xs)
        syy = sum((y - my) ** 2 for y in ys)
        pearson = round(sxy / sqrt(sxx * syy), 3) if sxx > 0 and syy > 0 else None
    return Metricas(
        n=n, mae=round(mae, 2), rmse=round(rmse, 2), sesgo=round(sesgo, 2),
        loa=(round(sesgo - 1.96 * sd, 2), round(sesgo + 1.96 * sd, 2)), pearson=pearson,
        exito_5=round(sum(abs(e) <= TOLERANCIA_LPM for e in err) / n, 3),
    )


def evaluar(pares: list[Par]) -> Confiabilidad:
    g = metricas(pares)
    por_origen: dict[str, list[Par]] = {}
    for p in pares:
        por_origen.setdefault(p.origen, []).append(p)
    tramos = []
    for c in CORTES:
        sub = [p for p in pares if p.confianza >= c]
        m = metricas(sub)
        tramos.append(Tramo(desde=c, n=m.n, mae=m.mae, exito_5=m.exito_5))

    # Umbral: el corte más bajo que cumple el objetivo con pares suficientes (más cobertura)
    umbral = None
    for t in tramos:
        if t.n >= MIN_PARES_TRAMO and t.exito_5 is not None and t.exito_5 >= EXITO_OBJETIVO:
            umbral = t.desde
            break

    if g.n < MIN_PARES:
        estado = "sin_validar" if g.n == 0 else "validando"
        texto = (f"Aún no hay pares cámara contra aparato de referencia." if g.n == 0 else
                 f"Van {g.n} de {MIN_PARES} pares para declarar un umbral.")
        texto += f" Referencia publicada de POS: {REFERENCIA_PUBLICADA['mae_lpm'][0]:g} a {REFERENCIA_PUBLICADA['mae_lpm'][1]:g} lpm de error medio."
        return Confiabilidad(global_=g, por_origen={k: metricas(v) for k, v in por_origen.items()}, tramos=tramos,
                             umbral=None, estado=estado, explicacion=texto)

    sobre = metricas([p for p in pares if umbral is not None and p.confianza >= umbral]) if umbral is not None else None
    if umbral is None:
        texto = (f"Con {g.n} pares, ningún nivel de confianza llega a {EXITO_OBJETIVO:.0%} de lecturas a ±{TOLERANCIA_LPM:g} lpm. "
                 "Mejora la luz y repite las validaciones.")
        estado = "validando"
    else:
        texto = (f"Con confianza de {umbral:.1f} o más, {sobre.exito_5:.0%} de las lecturas quedan a ±{TOLERANCIA_LPM:g} lpm "
                 f"del aparato de referencia (error medio {sobre.mae:g} lpm, {sobre.n} pares).")
        estado = "verificado"
    return Confiabilidad(global_=g, por_origen={k: metricas(v) for k, v in por_origen.items()}, tramos=tramos,
                         umbral=umbral, sobre_umbral=sobre, estado=estado, explicacion=texto)
