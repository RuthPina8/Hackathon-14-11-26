"""Pruebas de las tareas de Back 2 en la auditoría técnica del 14 nov (P0 3, P0 4 y P2 14)."""

import asyncio

from app.core import umbrales
from app.schemas.anomaly import Anomaly
from app.triage import alerts, rules


def run(coro):
    return asyncio.run(coro)


def cam(senal, z=2.2, confianza=0.9, **kw):
    return Anomaly(senal=senal, detector="zscore", z=z, fuente="camara", confianza=confianza, **kw)


# --- P0 3: umbrales clínicos sin rojas falsas -------------------------------------------

def test_hr_55_ya_no_es_roja():
    assert umbrales.clasificar_rango("hr_reposo", 55) is None
    d = rules.evaluar([Anomaly(senal="hr_reposo", detector="rango_clinico", valor=55)], fase="adaptacion")
    assert d is None or d.nivel != "roja"


def test_rangos_de_atencion_y_clinicos():
    assert umbrales.clasificar_rango("hr_reposo", 45) == "amarilla"
    assert umbrales.clasificar_rango("hr_reposo", 35) == "roja"
    assert umbrales.clasificar_rango("presion_sis", 150) == "amarilla"
    assert umbrales.clasificar_rango("presion_sis", 185) == "roja"
    assert umbrales.clasificar_rango("presion_dia", 125) == "roja"


def test_perclos_y_respiracion_no_son_rango_clinico():
    assert "perclos" not in umbrales.RANGOS_CLINICOS
    assert "resp_rpm" not in umbrales.RANGOS_CLINICOS
    assert umbrales.clasificar_rango("perclos", 0.16) is None
    d = rules.evaluar([Anomaly(senal="perclos", detector="rango_clinico", valor=0.16)], fase="adaptacion")
    assert d is None or d.nivel == "amarilla"


def test_rango_clinico_sin_valor_ni_nivel_es_amarilla():
    d = rules.evaluar([Anomaly(senal="hr_reposo", detector="rango_clinico")], fase="adaptacion")
    assert d.nivel == "amarilla"


# --- P0 4: confianza y señales independientes -------------------------------------------

def test_tres_senales_rppg_de_la_misma_lectura_dan_amarilla():
    d = rules.evaluar([cam("hr_reposo"), cam("hrv_rmssd"), cam("resp_rpm")])
    assert d.nivel == "amarilla"


def test_tres_origenes_independientes_si_dan_roja():
    d = rules.evaluar([cam("hr_reposo"), cam("perclos"), Anomaly(senal="reaccion_ms", detector="zscore", z=2.1)])
    assert d.nivel == "roja"


def test_confianza_baja_no_alerta():
    assert rules.evaluar([cam("hr_reposo", z=4.0, confianza=0.3)]) is None


def test_camara_sola_con_confianza_media_no_llega_a_roja():
    d = rules.evaluar([cam("hr_reposo", z=3.5, confianza=0.6)])
    assert d.nivel == "amarilla"


def test_camara_con_confianza_alta_si_llega_a_roja():
    d = rules.evaluar([cam("hr_reposo", z=3.5, confianza=0.85)])
    assert d.nivel == "roja"


def test_camara_poco_confiable_confirmada_por_otra_fuente_si_llega_a_roja():
    d = rules.evaluar([cam("hr_reposo", z=3.5, confianza=0.6),
                       Anomaly(senal="presion_sis", detector="zscore", z=3.1, fuente="manual")])
    assert d.nivel == "roja"


def test_confianza_fuera_de_rango_se_rechaza():
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        Anomaly(senal="hr_reposo", detector="zscore", confianza=1.5)


# --- P2 14: detalles del triage ---------------------------------------------------------

def test_sin_dia_es_fase_conservadora():
    # Sin dia_mision, un z-score no alerta (adaptación); un rango clínico sí
    assert run(alerts.handle_anomalies(1, [cam("hr_reposo", z=3.5)])) is None
    a = run(alerts.handle_anomalies(1, [Anomaly(senal="hr_reposo", detector="rango_clinico", valor=135)]))
    assert a is not None and a.nivel == "roja"


def test_factores_combinan_todas_las_anomalias():
    d = rules.evaluar([
        Anomaly(senal="hr_reposo", detector="zscore", z=2.0, factores={"hr_reposo": 50, "perclos": 50}),
        Anomaly(senal="sueno_horas", detector="sueno", z=-2.0),
    ])
    # hr aporta 2 repartido mitad y mitad; sueño aporta 2 completo -> 25 / 25 / 50
    assert d.factores == {"sueno_horas": 50.0, "hr_reposo": 25.0, "perclos": 25.0}
    assert abs(sum(d.factores.values()) - 100) < 0.5


def test_no_duplica_si_cambia_la_senal_principal():
    a1 = run(alerts.handle_anomalies(1, [
        Anomaly(senal="hr_reposo", detector="zscore", z=3.0),
        Anomaly(senal="perclos", detector="zscore", z=2.0),
    ], dia_mision=20))
    assert a1.senal == "hr_reposo"
    # Siguiente lectura: ahora PERCLOS pesa más que el ritmo
    a2 = run(alerts.handle_anomalies(1, [
        Anomaly(senal="perclos", detector="zscore", z=3.2),
        Anomaly(senal="hr_reposo", detector="zscore", z=2.1),
    ], dia_mision=21))
    assert a2.id == a1.id
    assert len(alerts.listar().activas) == 1


def test_resolver_encuentra_la_alerta_por_una_senal_secundaria():
    a = run(alerts.handle_anomalies(1, [
        Anomaly(senal="hr_reposo", detector="zscore", z=3.0),
        Anomaly(senal="perclos", detector="zscore", z=2.0),
    ], dia_mision=20))
    r = run(alerts.resolver(1, "perclos"))
    assert r is not None and r.id == a.id and r.estado == "resuelta"


# --- Demo alineada con docs/motor.md (secciones 5 y 8): corre con el simulador de Back 1 si existe, si no con el guion de respaldo

def test_guion_inmune_a3_amarillo_el_27_y_rojo_el_29_por_fiebre(client):
    from app.triage import guion

    # La fiebre aparece 2 días seguidos (28 y 29) junto a otro síntoma inmune
    fiebre = [d for d, s in guion.SINTOMAS_A3.items() if any(x["clave"] == "fiebre" for x in s)]
    assert fiebre == [28, 29]

    client.post("/demo/advance", json={"dias": 27})
    a3 = [x for x in client.get("/alerts").json()["activas"] if x["astronauta_id"] == 3]
    assert len(a3) == 1 and a3[0]["nivel"] == "amarilla"

    client.post("/demo/advance", json={"dias": 1})  # día 28: fiebre un día, sigue amarillo
    a3 = [x for x in client.get("/alerts").json()["activas"] if x["astronauta_id"] == 3]
    assert len(a3) == 1 and a3[0]["nivel"] == "amarilla"

    client.post("/demo/advance", json={"dias": 1})  # día 29: fiebre 2 días -> rojo y a Tierra
    a3 = [x for x in client.get("/alerts").json()["activas"] if x["astronauta_id"] == 3]
    assert len(a3) == 1 and a3[0]["nivel"] == "roja" and a3[0]["estado"] == "escalada"
    assert "Fiebre 2 días" in a3[0]["que_cambio"]
