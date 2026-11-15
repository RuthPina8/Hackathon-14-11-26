"""Telemetría ambiental simulada con escenarios de demostración.

- Cada SEGUNDOS_LECTURA se genera una lectura que se acerca poco a poco a los valores del
  escenario activo (así el cambio se ve en vivo y no de golpe) con un poco de ruido.
- Todo sale con capa `sim` y fuente `simulador`: la UI lo marca SIMULADO.
- Los rangos son del ESCENARIO DE DEMOSTRACIÓN (ajustables). Antes de citarlos como límites de
  la NASA hay que verificarlos contra NASA-STD-3001 Vol. 2.
"""

import asyncio
import random
from datetime import datetime, timezone

from app.core.ws import broadcast
from app.entornos.perfiles import activo
from app.schemas.telemetry import Escenario, Lectura, RangoVariable, TelemetriaEstado, TelemetriaIn

SEGUNDOS_LECTURA = 3.0
MAX_HISTORIAL = 600
SUAVIZADO = 0.35  # qué tanto se acerca cada lectura al valor objetivo del escenario

NOTA = ("Datos SIMULADOS para la demostración: no provienen de un sensor físico. "
        "Rangos del escenario de demo, ajustables; verificar contra NASA-STD-3001 antes de citarlos.")

# variable -> (nombre, unidad, mínimo, máximo); None = sin límite de ese lado
RANGOS: dict[str, tuple[str, str, float | None, float | None]] = {
    "co2_ppm": ("CO₂", "ppm", None, 2500.0),
    "o2_pct": ("Oxígeno", "%", 19.5, 23.5),
    "temp_c": ("Temperatura", "°C", 18.0, 27.0),
    "humedad_pct": ("Humedad", "%", 25.0, 75.0),
    # La radiación se compara contra el perfil del entorno activo (ver fuera_de_rango)
    "radiacion_msv_dia": ("Radiación", "mSv/día", None, None),
}
# Radiación fuera de rango si pasa este múltiplo de la del perfil del entorno (evento solar)
FACTOR_RADIACION = 2.0


def objetivos(escenario: Escenario) -> dict[str, float]:
    rad = activo.perfil.radiacion_msv_dia
    if escenario == "estable":
        return {"co2_ppm": 800, "o2_pct": 20.9, "temp_c": 22.0, "humedad_pct": 45, "radiacion_msv_dia": rad}
    if escenario == "cambio":
        # Una variable sale de rango (CO₂) y otra se mueve sin salir (temperatura)
        return {"co2_ppm": 3000, "o2_pct": 20.7, "temp_c": 25.5, "humedad_pct": 50, "radiacion_msv_dia": rad}
    # revision: combinación de cambios
    return {"co2_ppm": 4300, "o2_pct": 19.2, "temp_c": 28.5, "humedad_pct": 80, "radiacion_msv_dia": rad * 3}


RUIDO = {"co2_ppm": 40, "o2_pct": 0.05, "temp_c": 0.15, "humedad_pct": 1.0, "radiacion_msv_dia": 0.02}


def fuera_de_rango(valores: dict[str, float]) -> list[str]:
    fuera = []
    for var, (_, _, lo, hi) in RANGOS.items():
        v = valores[var]
        if var == "radiacion_msv_dia":
            if v > activo.perfil.radiacion_msv_dia * FACTOR_RADIACION:
                fuera.append(var)
        elif (lo is not None and v < lo) or (hi is not None and v > hi):
            fuera.append(var)
    return fuera


def rangos() -> list[RangoVariable]:
    out = []
    for var, (nombre, unidad, lo, hi) in RANGOS.items():
        if var == "radiacion_msv_dia":
            hi = round(activo.perfil.radiacion_msv_dia * FACTOR_RADIACION, 2)
        out.append(RangoVariable(variable=var, nombre=nombre, unidad=unidad, minimo=lo, maximo=hi))
    return out


def nombre(var: str) -> str:
    return RANGOS[var][0]


class Telemetria:
    def __init__(self) -> None:
        self.escenario: Escenario = "estable"
        self.lecturas: list[Lectura] = []
        self._sig = 1
        self._actual = dict(objetivos("estable"))
        self._rng = random.Random(42)

    def reset(self) -> None:
        self.__init__()

    def registrar(self, t: TelemetriaIn, escenario: Escenario | None = None, fecha: datetime | None = None) -> Lectura:
        valores = t.model_dump(include=set(RANGOS))
        lectura = Lectura(
            **t.model_dump(), id=self._sig, fecha=fecha or datetime.now(timezone.utc),
            escenario=escenario, fuera_de_rango=fuera_de_rango(valores),
        )
        self._sig += 1
        self.lecturas.append(lectura)
        del self.lecturas[:-MAX_HISTORIAL]
        return lectura

    def simular_lectura(self, fecha: datetime | None = None) -> Lectura:
        obj = objetivos(self.escenario)
        for var in RANGOS:
            self._actual[var] += (obj[var] - self._actual[var]) * SUAVIZADO
        valores = {
            var: round(max(0.0, self._actual[var] + self._rng.gauss(0, RUIDO[var])), 2) for var in RANGOS
        }
        return self.registrar(TelemetriaIn(**valores), escenario=self.escenario, fecha=fecha)

    def ultima(self) -> Lectura | None:
        return self.lecturas[-1] if self.lecturas else None

    def estado(self) -> TelemetriaEstado:
        return TelemetriaEstado(escenario=self.escenario, ultima=self.ultima(), rangos=rangos(), nota=NOTA)

    def en_ventana(self, desde: datetime, hasta: datetime) -> list[Lectura]:
        return [x for x in self.lecturas if desde <= x.fecha <= hasta]


telemetria = Telemetria()


async def publicar(lectura: Lectura) -> None:
    await broadcast("telemetry_updated", lectura)
    # La lectura nueva puede completar una coincidencia con una sesión de movimiento
    from app.mision import contexto

    await contexto.revisar()


async def run_forever() -> None:
    while True:
        await publicar(telemetria.simular_lectura())
        await asyncio.sleep(SEGUNDOS_LECTURA)
