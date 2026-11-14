"""Triage (Back 2): reglas de alertas, ciclo de vida, cola hacia Tierra y modo demo.

Lo que usa Back 1:
    from app.triage import handle_anomalies, resolver, esta_congelada
"""

from app.triage.alerts import handle_anomalies, resolver
from app.triage.baseline import esta_congelada, registrar_persistor

__all__ = ["handle_anomalies", "resolver", "esta_congelada", "registrar_persistor"]
