"""Proyección de /simulation: hueso, radiación, retraso y riesgo.

Todo es capa `sim`: se muestra, pero nunca entra al motor de anomalías.
Funciones puras, sin FastAPI.
"""

from app.schemas.environment import EnvironmentProfile
from app.schemas.simulation import Oseo, PuntoSerie, Radiacion, Retraso, Riesgo, Simulation

# Límite de carrera de la NASA (NASA-STD-3001, 2022): 600 mSv
LIMITE_CARRERA_MSV = 600.0
PUNTOS_SERIE = 30


def _dias_serie(dia: int) -> list[int]:
    if dia <= PUNTOS_SERIE:
        return list(range(0, dia + 1))
    paso = dia / PUNTOS_SERIE
    dias = sorted({round(i * paso) for i in range(PUNTOS_SERIE + 1)})
    return dias


def densidad_osea(perfil: EnvironmentProfile, dia: int) -> float:
    """Densidad relativa (100 = inicio). Pérdida compuesta mensual."""
    r = perfil.perdida_osea_pct_mes / 100
    return 100 * (1 - r) ** (dia / 30)


def dosis(perfil: EnvironmentProfile, dia: int) -> float:
    return perfil.radiacion_msv_dia * dia


def texto_retraso(segundos: float) -> str:
    if segundos < 2:
        return f"{segundos:.1f} s de ida: conversación casi en vivo"
    if segundos < 60:
        return f"{segundos:.0f} s de ida: se nota la pausa"
    minutos = segundos / 60
    return f"{minutos:.1f} min de ida, {2 * minutos:.0f} min ida y vuelta: el astronauta decide solo"


def riesgo(perfil: EnvironmentProfile, perdida_pct: float, pct_limite: float) -> Riesgo:
    puntaje = 0
    motivos: list[str] = []
    if perdida_pct >= 10:
        puntaje += 40
        motivos.append(f"Pérdida ósea de {perdida_pct:.1f}%: riesgo de fractura")
    elif perdida_pct >= 5:
        puntaje += 20
        motivos.append(f"Pérdida ósea de {perdida_pct:.1f}%: vigilar ejercicio de resistencia")
    if pct_limite >= 50:
        puntaje += 40
        motivos.append(f"Dosis al {pct_limite:.0f}% del límite de carrera")
    elif pct_limite >= 20:
        puntaje += 20
        motivos.append(f"Dosis al {pct_limite:.0f}% del límite de carrera")
    if perfil.retraso_s >= 60:
        puntaje += 20
        motivos.append("Retraso de minutos: el apoyo de Tierra no es inmediato")
    if not motivos:
        motivos.append("Sin factores de riesgo relevantes a este día")
    nivel = "alto" if puntaje >= 60 else "medio" if puntaje >= 30 else "bajo"
    return Riesgo(nivel=nivel, puntaje=min(puntaje, 100), motivos=motivos)


def simular(perfil: EnvironmentProfile, dia: int) -> Simulation:
    dias = _dias_serie(dia)
    densidad = densidad_osea(perfil, dia)
    perdida = 100 - densidad
    dosis_total = dosis(perfil, dia)
    pct_limite = 100 * dosis_total / LIMITE_CARRERA_MSV
    return Simulation(
        entorno=perfil.id,
        dia=dia,
        oseo=Oseo(
            perdida_pct=round(perdida, 2),
            densidad_relativa=round(densidad, 2),
            serie=[PuntoSerie(dia=d, valor=round(densidad_osea(perfil, d), 2)) for d in dias],
        ),
        radiacion=Radiacion(
            dosis_msv=round(dosis_total, 1),
            limite_carrera_msv=LIMITE_CARRERA_MSV,
            pct_limite=round(pct_limite, 1),
            serie=[PuntoSerie(dia=d, valor=round(dosis(perfil, d), 1)) for d in dias],
        ),
        retraso=Retraso(
            ida_s=perfil.retraso_s,
            ida_vuelta_s=2 * perfil.retraso_s,
            texto=texto_retraso(perfil.retraso_s),
        ),
        riesgo=riesgo(perfil, perdida, pct_limite),
    )
