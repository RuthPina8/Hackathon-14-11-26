"""Sueño con el Consensus Sleep Diary, versión "core" (docs/motor.md, sección 4). Funciones puras.

Front 1 manda los horarios del registro; aquí salen TST, eficiencia y las mediciones que se guardan.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta


def _hora(h: str, base: datetime) -> datetime:
    hh, mm = (int(x) for x in h.split(":")[:2])
    return base.replace(hour=hh, minute=mm, second=0, microsecond=0)


def _despues(t: datetime, ref: datetime) -> datetime:
    """Las horas pasan de medianoche: si t queda antes que ref, es del día siguiente."""
    return t + timedelta(days=1) if t < ref else t


@dataclass
class Diario:
    acostarse: str  # "23:00"
    despertar_final: str  # "06:30"
    levantarse: str | None = None  # por defecto, igual que el despertar
    intento: str | None = None  # por defecto, igual que acostarse
    latencia_min: float = 0
    waso_min: float = 0
    despertares: int = 0
    calidad: int | None = None  # 1 a 5
    medicamento: bool = False


@dataclass
class ResultadoSueno:
    tib_h: float
    tst_h: float
    eficiencia_pct: float


def calcular(d: Diario) -> ResultadoSueno:
    base = datetime(2000, 1, 1)
    acostarse = _hora(d.acostarse, base)
    intento = _despues(_hora(d.intento or d.acostarse, base), acostarse)
    despertar = _despues(_hora(d.despertar_final, base), intento)
    levantarse = _despues(_hora(d.levantarse or d.despertar_final, base), despertar - timedelta(minutes=1))
    tib = (levantarse - acostarse).total_seconds() / 3600
    tst = (despertar - intento).total_seconds() / 3600 - (d.latencia_min + d.waso_min) / 60
    tst = max(0.0, tst)
    eficiencia = 100 * tst / tib if tib > 0 else 0.0
    return ResultadoSueno(tib_h=round(tib, 2), tst_h=round(tst, 2), eficiencia_pct=round(eficiencia, 1))


def a_mediciones(d: Diario) -> list[dict]:
    """Lo que se guarda en /measurements (capa auto, fuente manual), con los horarios en `detalle`."""
    r = calcular(d)
    detalle = {"diario": d.__dict__, "tib_h": r.tib_h}
    filas = [
        ("sueno_horas", r.tst_h, "h"),
        ("sueno_eficiencia_pct", r.eficiencia_pct, "%"),
        ("sueno_latencia_min", d.latencia_min, "min"),
        ("sueno_waso_min", d.waso_min, "min"),
        ("sueno_despertares", d.despertares, "n"),
        ("sueno_medicamento", 1 if d.medicamento else 0, "0/1"),
    ]
    if d.calidad is not None:
        filas.append(("sueno_calidad", d.calidad, "1-5"))
    return [{"tipo": t, "valor": float(v), "unidad": u, "capa": "auto", "fuente": "manual", "detalle": detalle}
            for t, v, u in filas]
