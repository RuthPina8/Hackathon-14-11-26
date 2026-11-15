"""Pruebas de la versión mínima de Back 1 (mediciones, estado e indicadores en memoria)."""

from app.intelligence.baseline import LineaBase, actualizar, peso_personal, zscore
from app.triage import baseline as congelamiento


def test_peso_personal_de_7_es_la_mitad():
    assert peso_personal(7) == 0.5


def test_zscore_necesita_tres_datos():
    lb = LineaBase()
    for v in (68, 70):
        lb = actualizar(lb, v)
    assert zscore(lb, 90) is None
    lb = actualizar(lb, 66)
    assert zscore(lb, 90) > 2


def test_guardar_lista_y_ver_estado(client):
    r = client.post("/measurements", json=[
        {"tipo": "hr_reposo", "valor": 70, "unidad": "lpm", "capa": "real", "fuente": "camara", "confianza": 0.6},
        {"tipo": "animo", "valor": 4, "unidad": "1-5", "capa": "auto", "fuente": "manual"},
    ])
    assert r.status_code == 201
    assert r.json()["guardadas"] == 2
    s = client.get("/status").json()
    assert s["sistemas"]["cardiovascular"]["estado"] == "verde"
    assert s["sistemas"]["inmune"]["estado"] == "sin_datos"
    assert s["n_mediciones"] == 2


def test_rango_clinico_crea_alerta_y_baja_readiness(client):
    r = client.post("/measurements", json={"tipo": "perclos", "valor": 0.3, "unidad": "fraccion", "capa": "real", "fuente": "camara"})
    assert r.json()["alerta_id"] is not None
    s = client.get("/status").json()
    assert s["sistemas"]["sueno"]["estado"] == "rojo"
    assert s["readiness"] < 100
    activas = client.get("/alerts").json()["activas"]
    assert activas and activas[0]["senal"] == "perclos"


def test_sim_y_modelo_no_entran_a_la_linea_base(client):
    client.post("/measurements", json={"tipo": "animo", "valor": 2, "capa": "real", "fuente": "modelo"})
    client.post("/measurements", json={"tipo": "hr_reposo", "valor": 99, "capa": "sim", "fuente": "simulador"})
    assert client.get("/indicators/animo").json()["linea_base"]["n"] == 0
    assert client.get("/indicators/hr").json()["linea_base"]["n"] == 0


def test_linea_base_congelada_no_cambia(client):
    congelamiento.congelar(1, "hr_reposo")
    client.post("/measurements", json={"tipo": "hr_reposo", "valor": 70, "capa": "real", "fuente": "camara"})
    assert client.get("/indicators/hr_reposo").json()["linea_base"]["n"] == 0


def test_practica_no_cuenta(client):
    client.post("/measurements", json={"tipo": "reaccion_ms", "valor": 300, "capa": "real", "fuente": "prueba", "detalle": {"practica": True}})
    assert client.get("/indicators/rt").json()["linea_base"]["n"] == 0


def test_experimentales_no_levantan_alertas(client):
    # Una VFC muy baja y respiración rara por cámara se guardan, pero no generan alerta
    r = client.post("/measurements", json=[
        {"tipo": "hrv_rmssd", "valor": 4, "unidad": "ms", "capa": "real", "fuente": "camara", "confianza": 0.3},
        {"tipo": "resp_rpm", "valor": 40, "unidad": "resp/min", "capa": "real", "fuente": "camara", "confianza": 0.4},
    ])
    assert r.status_code == 201
    assert r.json()["guardadas"] == 2
    assert r.json()["alerta_id"] is None
    estado = client.get("/status").json()
    assert estado["readiness"] == 100


def test_expresividad_cuenta_en_mental(client):
    r = client.post("/measurements", json={"tipo": "expresividad", "valor": 0.3, "unidad": "0-1", "capa": "real", "fuente": "camara", "confianza": 0.7})
    assert r.status_code == 201
    estado = client.get("/status").json()
    assert estado["sistemas"]["mental"]["estado"] == "verde"
