"""Crea y llena la base de PostgreSQL para la demo.

Uso (desde api/, con el venv activo y DATABASE_URL en api/.env):
    python -m app.seed                 # tablas + tripulación + entornos
    python -m app.seed --dias 30       # además, 30 días del simulador de la misión (dato de demo)
    python -m app.seed --fichas-demo   # además, fichas médicas DE EJEMPLO para A1 a A4
    python -m app.seed --reiniciar     # borra lo simulado antes (lo real del equipo se queda)

Lo simulado entra con fuente="simulador" y la app lo marca como "demo data". Las fichas de
ejemplo dicen en sus notas que son de ejemplo: no son datos médicos de nadie.
"""

import argparse
import asyncio
import sys
from datetime import date

from app.core.config import settings
from app.models import persistencia
from app.models.clinico import clinico
from app.models.memoria import almacen
from app.schemas.clinico import Basales, FichaMedica

FICHAS_DEMO = {
    1: dict(sexo="F", estatura_cm=168, tipo_sangre="O+", basales=Basales(hr_reposo=64, presion_sis=114, presion_dia=74, reaccion_ms=280, sueno_horas=7.3, hrv_rmssd=50, peso_kg=61, spo2_pct=98)),
    2: dict(sexo="M", estatura_cm=181, tipo_sangre="A+", basales=Basales(hr_reposo=69, presion_sis=121, presion_dia=79, reaccion_ms=298, sueno_horas=7.0, hrv_rmssd=41, peso_kg=79, spo2_pct=98)),
    3: dict(sexo="F", estatura_cm=172, tipo_sangre="B+", basales=Basales(hr_reposo=67, presion_sis=111, presion_dia=71, reaccion_ms=292, sueno_horas=7.2, hrv_rmssd=46, peso_kg=64, spo2_pct=99)),
    4: dict(sexo="M", estatura_cm=176, tipo_sangre="O-", basales=Basales(hr_reposo=63, presion_sis=117, presion_dia=75, reaccion_ms=274, sueno_horas=7.5, hrv_rmssd=53, peso_kg=74, spo2_pct=98)),
}


async def _simular(dias: int) -> None:
    from app.simulator import correr_dia
    from app.triage.demo import engine

    for d in range(1, dias + 1):
        await correr_dia(d)
        engine.dia = d
        if d % 5 == 0:
            print(f"  day {d}: {len(almacen.mediciones)} measurements", file=sys.stderr)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dias", type=int, default=0, help="simulator days to load (1 to 35)")
    ap.add_argument("--fichas-demo", action="store_true", help="sample medical records for A1 to A4")
    ap.add_argument("--reiniciar", action="store_true", help="delete simulated data before loading")
    a = ap.parse_args()

    if not settings.database_url:
        sys.exit("DATABASE_URL is missing in api/.env (copy .env.example and set your PostgreSQL password)")
    if not persistencia.iniciar():
        sys.exit("Couldn’t connect to PostgreSQL: check that the service is running, the password, and that the database exists "
                 "(psql -U postgres -c \"CREATE DATABASE astrohealth;\")")
    print(f"Connected. There were already {len(almacen.mediciones)} measurements.", file=sys.stderr)

    if a.reiniciar:
        almacen.reiniciar_demo()
        print(f"Deleted simulated data; {len(almacen.mediciones)} real measurements remain.", file=sys.stderr)
    if a.dias:
        if any(m.fuente == "simulador" for m in almacen.mediciones) and not a.reiniciar:
            sys.exit("Simulator data already exists. Use --reiniciar to reload it from day 1")
        asyncio.run(_simular(min(35, max(1, a.dias))))
    if a.fichas_demo:
        for i, datos in FICHAS_DEMO.items():
            clinico.guardar_ficha(FichaMedica(
                astronauta_id=i, nombre=f"Astronaut {i}", fecha_evaluacion=date.today(), medico="Demo medical team",
                notas="SAMPLE RECORD for the demo: not medical data of a real person.", **datos,
            ))
    persistencia.foto()
    print(f"Done: {len(almacen.mediciones)} measurements, {len(clinico.fichas)} records, "
          f"{len(clinico.pares)} validation pairs in the database.", file=sys.stderr)
    persistencia.detener()


if __name__ == "__main__":
    main()
