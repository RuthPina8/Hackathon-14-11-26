"""Modelo personal de ánimo (docs/motor.md §1). Función pura.

La cámara no lee tu ánimo: aprende cómo cambian TUS señales los días que TÚ reportas sentirte
mal. Ridge por astronauta, entradas en z-score contra tu normal, etiqueta = ánimo reportado (1 a 5).
Se evalúa con leave-one-day-out: `acierto_pct` = % de días en que el estimado queda a ±1 punto.
"""

from dataclasses import dataclass

import numpy as np

MIN_DIAS = 10
ALPHAS = (0.1, 1.0, 10.0, 100.0)

COLUMNAS = ["hr_reposo", "hrv_rmssd", "resp_rpm", "perclos", "parpadeo_min", "expresividad", "sonrisa_media",
            "ceno_medio", "movimiento_cabeza", "reaccion_ms", "sueno_horas"]
# Señales que salen de la cámara: un día cuenta solo si tiene al menos una
DE_CAMARA = {"hr_reposo", "hrv_rmssd", "resp_rpm", "perclos", "parpadeo_min", "expresividad", "sonrisa_media",
             "ceno_medio", "movimiento_cabeza"}

FRASE = {
    "hr_reposo": "resting heart rate", "hrv_rmssd": "heart rate variability", "resp_rpm": "breathing",
    "perclos": "visual fatigue", "parpadeo_min": "blinking", "expresividad": "expressiveness",
    "sonrisa_media": "smiling", "ceno_medio": "frowning", "movimiento_cabeza": "head movement",
    "reaccion_ms": "reaction time", "sueno_horas": "sleep",
}


@dataclass
class ResultadoAnimo:
    estado: str  # aprendiendo | activo
    n: int
    acierto_pct: float | None = None
    mae: float | None = None
    explicacion: str | None = None
    estimado_hoy: float | None = None
    coeficientes: dict[str, float] | None = None


def _ridge(X: np.ndarray, y: np.ndarray, alpha: float | None = None):
    """Sin alpha: RidgeCV elige alpha con validación cruzada eficiente (GCV, leave-one-out exacto)."""
    from sklearn.linear_model import Ridge, RidgeCV

    if alpha is not None:
        return Ridge(alpha=alpha).fit(X, y)
    return RidgeCV(alphas=ALPHAS).fit(X, y)


def entrenar(dias: list[dict[str, float]], etiquetas: list[float], hoy: dict[str, float] | None = None) -> ResultadoAnimo:
    """dias: un diccionario por día con el z de cada señal. etiquetas: ánimo reportado ese día."""
    n = len(dias)
    if n < MIN_DIAS:
        return ResultadoAnimo(estado="aprendiendo", n=n)
    cols = [c for c in COLUMNAS if any(c in d for d in dias)]
    X = np.array([[d.get(c, 0.0) for c in cols] for d in dias], dtype=float)
    y = np.array(etiquetas, dtype=float)

    modelo = _ridge(X, y)
    alpha = float(modelo.alpha_)

    # Leave-one-day-out: cada día se predice con un modelo que nunca lo vio
    errores = []
    for i in range(n):
        mask = np.arange(n) != i
        pred = float(np.clip(_ridge(X[mask], y[mask], alpha).predict(X[i:i + 1])[0], 1, 5))
        errores.append(abs(pred - y[i]))
    errores_arr = np.array(errores)

    coef = dict(zip(cols, (float(c) for c in modelo.coef_)))
    top = sorted(coef.items(), key=lambda kv: -abs(kv[1]))[:3]
    # coef > 0: más de esa señal → mejor ánimo, así que los días bajos vienen con MENOS de ella
    partes = [f"{'lower' if c > 0 else 'higher'} {FRASE.get(s, s)}" for s, c in top if abs(c) >= 0.05]
    explicacion = f"Your low days usually come with {', '.join(partes)}" if partes else None

    estimado = None
    if hoy:
        estimado = round(float(np.clip(modelo.predict(np.array([[hoy.get(c, 0.0) for c in cols]]))[0], 1, 5)), 1)
    return ResultadoAnimo(
        estado="activo", n=n, acierto_pct=round(100 * float(np.mean(errores_arr <= 1.0)), 1),
        mae=round(float(errores_arr.mean()), 2), explicacion=explicacion, estimado_hoy=estimado,
        coeficientes={k: round(v, 3) for k, v in coef.items()},
    )
