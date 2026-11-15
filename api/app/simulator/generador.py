"""Generador sintético con semilla fija (función pura: mismo día -> mismas mediciones).

Las señales están correlacionadas a través de dos variables ocultas por astronauta y día:
- fatiga: deuda de sueño (horas por debajo de su normal)
- humor: variación del ánimo del día
Poco sueño -> más PERCLOS, reacción más lenta, VFC más baja, menos expresividad y ánimo más bajo.
Así el modelo personal de ánimo y el Isolation Forest tienen algo real que aprender.

Guion (motor.md §8):
- Días 1 a 14: adaptación, la calibración sube.
- Días 18 a 22: A1 duerme menos de 6 h; su resting heart rate sube ~2σ (lo detecta CUSUM) y la
  regla de sueño avisa. Desde el día 23 descansa y la alerta se resuelve sola.
- Días 25 a 29: A3 con congestión desde el 25, fuego labial desde el 27 (amarillo) y fiebre los
  días 28 y 29 (rojo el 29, se escala a Tierra). La congestión sigue hasta el 31 y la alerta se
  cierra sola el 32.
"""

import random

ULTIMO_DIA = 35
ASTRONAUTAS = (1, 2, 3, 4)
FUENTE = "simulador"
CONFIANZA = 0.9

# Normal de cada astronauta (ritmo, VFC, reacción, sueño, presión)
PERFIL = {
    1: {"hr": 66.0, "hrv": 48.0, "rt": 285.0, "sueno": 7.3, "sis": 116.0, "dia": 76.0},
    2: {"hr": 70.0, "hrv": 42.0, "rt": 300.0, "sueno": 7.0, "sis": 120.0, "dia": 78.0},
    3: {"hr": 68.0, "hrv": 45.0, "rt": 295.0, "sueno": 7.2, "sis": 112.0, "dia": 72.0},
    4: {"hr": 64.0, "hrv": 52.0, "rt": 275.0, "sueno": 7.5, "sis": 118.0, "dia": 74.0},
}

# Ruido diario de cada señal. Se recorta a ±1.3σ para que un día normal no parezca una anomalía:
# en datos reales sí habría colas, y esa tasa de falsas alarmas se mide con las grabaciones del equipo.
RECORTE = 1.3


def _ruido(rng: random.Random, sd: float) -> float:
    return max(-RECORTE, min(RECORTE, rng.gauss(0, 1))) * sd


def _clip(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def _sintomas_a3(d: int) -> list[dict]:
    lista = []
    if 25 <= d <= 31:  # la congestión sigue un par de días más: la alerta baja sola hasta el 32
        lista.append({"clave": "congestion", "intensidad": 1 if d < 27 or d > 29 else 2})
    if 27 <= d <= 29:
        lista.append({"clave": "fuego_labial", "intensidad": 1})
    if d in (28, 29):
        lista.append({"clave": "fiebre", "intensidad": 2})
    return lista


def _medicion(astro: int, d: int, tipo: str, valor: float, unidad: str, capa: str = "real", **detalle) -> dict:
    return {
        "astronauta_id": astro, "tipo": tipo, "valor": round(valor, 4), "unidad": unidad, "capa": capa,
        "fuente": FUENTE, "confianza": CONFIANZA, "dia_mision": d, "detalle": {"demo": True, **detalle},
    }


def dia_astronauta(astro: int, d: int) -> list[dict]:
    rng = random.Random(1000 * astro + d)
    p = PERFIL[astro]

    sueno = p["sueno"] + _ruido(rng, 0.35)
    extra_hr = 0.0
    if astro == 1 and 18 <= d <= 22:
        sueno = 5.2 + _ruido(rng, 0.15)
        extra_hr = 4.5  # ~2σ: CUSUM lo detecta en 2 a 3 días (motor.md §8)
    if astro == 1 and 23 <= d <= 25:
        sueno = p["sueno"] + 0.4 + _ruido(rng, 0.2)  # descansa: el cierre del ciclo "actuar"
    fatiga = max(0.0, p["sueno"] - sueno)
    humor = _ruido(rng, 0.6) - 0.35 * fatiga
    enfermo = astro == 3 and 25 <= d <= 29
    if enfermo:
        humor -= 0.4

    hr = p["hr"] + _ruido(rng, 2.0) + extra_hr + (3.0 if astro == 3 and d in (28, 29) else 0.0)
    hrv = p["hrv"] + _ruido(rng, 4.0) - 2.0 * fatiga
    perclos = _clip(0.06 + _ruido(rng, 0.012) + 0.008 * fatiga, 0.0, 1.0)
    parpadeo = 15 + _ruido(rng, 2.0) + 1.0 * fatiga
    reaccion = p["rt"] + _ruido(rng, 15.0) + 9.0 * fatiga
    animo = _clip(round(3.8 + 0.9 * humor + _ruido(rng, 0.45)), 1, 5)  # el autorreporte también tiene ruido
    estres = _clip(round(3 + _ruido(rng, 0.8) + 0.6 * fatiga - 0.8 * humor), 0, 10)
    expresividad = _clip(0.5 + 0.08 * humor + _ruido(rng, 0.03), 0, 1)
    sonrisa = _clip(0.3 + 0.06 * humor + _ruido(rng, 0.03), 0, 1)
    ceno = _clip(0.2 - 0.04 * humor + _ruido(rng, 0.02), 0, 1)
    cabeza = _clip(0.1 + 0.02 * fatiga + _ruido(rng, 0.015), 0, 1)
    calidad = _clip(round(3.6 - 0.8 * fatiga + _ruido(rng, 0.5)), 1, 5)
    sintomas = _sintomas_a3(d) if astro == 3 else []

    return [
        _medicion(astro, d, "hr_reposo", hr, "lpm"),
        _medicion(astro, d, "hrv_rmssd", hrv, "ms", experimental=True),
        _medicion(astro, d, "perclos", perclos, "fraccion"),
        _medicion(astro, d, "parpadeo_min", parpadeo, "/min"),
        _medicion(astro, d, "expresividad", expresividad, "0-1"),
        _medicion(astro, d, "sonrisa_media", sonrisa, "0-1"),
        _medicion(astro, d, "ceno_medio", ceno, "0-1"),
        _medicion(astro, d, "movimiento_cabeza", cabeza, "0-1"),
        _medicion(astro, d, "reaccion_ms", reaccion, "ms"),
        _medicion(astro, d, "sueno_horas", sueno, "h", capa="auto"),
        _medicion(astro, d, "sueno_calidad", calidad, "1-5", capa="auto"),
        _medicion(astro, d, "animo", animo, "1-5", capa="auto"),
        _medicion(astro, d, "estres", estres, "0-10", capa="auto"),
        _medicion(astro, d, "presion_sis", p["sis"] + _ruido(rng, 5.0), "mmHg", capa="auto"),
        _medicion(astro, d, "presion_dia", p["dia"] + _ruido(rng, 4.0), "mmHg", capa="auto"),
        _medicion(astro, d, "sintomas", len(sintomas), "n", capa="auto", lista=sintomas),
    ]


def dia(d: int) -> list[dict]:
    return [m for a in ASTRONAUTAS for m in dia_astronauta(a, d)]
