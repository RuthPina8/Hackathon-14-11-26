"""Pruebas de lo que cierra el back: persistencia, tripulación, Apple Watch, anomalías en /indicators
y que reiniciar la demo conserve las mediciones reales."""

import asyncio

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.models import persistencia
from app.models.memoria import almacen
from app.models.tablas import AlertaDB, Astronauta, EntornoDB, MedicionDB
from app.simulator import correr_dia


def _hr(valor, dia, conf=0.9, fuente="camara", astro=1):
    return {"astronauta_id": astro, "tipo": "hr_reposo", "valor": valor, "unidad": "lpm", "capa": "real",
            "fuente": fuente, "confianza": conf, "dia_mision": dia}


# ------------------------------------------------------------------ /indicators

def test_indicators_marca_anomalias_contra_la_linea_base_previa(client):
    client.post("/measurements", json=[_hr(66 + (i % 3), i + 1) for i in range(10)])
    client.post("/measurements", json=_hr(95, 11))
    r = client.get("/indicators/hr").json()
    assert r["nombre"] == "Resting heart rate"
    assert len(r["serie"]) == 11
    assert r["anomalias"] and r["anomalias"][-1]["valor"] == 95
    assert r["serie"][-1]["anomalo"] is True
    assert not any(p["anomalo"] for p in r["serie"][:10])
    assert r["estado"] in ("amarillo", "rojo")
    assert r["dato_demo"] is False


def test_indicators_rango_mision_y_alias(client):
    client.post("/measurements", json={"tipo": "reaccion_ms", "valor": 280, "capa": "real", "fuente": "prueba"})
    assert client.get("/indicators/rt?range=mision").json()["tipo"] == "reaccion_ms"
    assert client.get("/indicators/rt?range=abc").status_code == 422


# ------------------------------------------------------------------ /crew

def test_crew_sin_datos_y_con_datos(client):
    r = client.get("/crew").json()
    assert [c["astronauta_id"] for c in r] == [1, 2, 3, 4]
    assert all(c["estado"] == "sin_datos" for c in r)
    client.post("/measurements", json=[_hr(66, 1, astro=2),
                                       {"astronauta_id": 2, "tipo": "animo", "valor": 4, "capa": "auto", "fuente": "manual"}])
    c2 = client.get("/crew").json()[1]
    assert c2["estado"] == "verde" and c2["ritmo"] == "66 bpm" and c2["animo"] == "4 of 5"


# ------------------------------------------------------------------ Apple Watch

HAE = {"data": {"metrics": [
    {"name": "resting_heart_rate", "units": "count/min", "data": [
        {"date": "2026-11-10 07:00:00 -0600", "qty": 61}, {"date": "2026-11-11 07:00:00 -0600", "qty": 63}]},
    {"name": "heart_rate_variability", "units": "ms", "data": [{"date": "2026-11-11 07:00:00 -0600", "qty": 48.5}]},
    {"name": "sleep_analysis", "units": "hr", "data": [
        {"date": "2026-11-11", "totalSleep": 6.5, "inBed": 7.5, "sleepEnd": "2026-11-11 06:40:00 -0600"}]},
    {"name": "step_count", "units": "count", "data": [{"date": "2026-11-11", "qty": 8000}]},
]}}


def test_apple_health_guarda_y_no_duplica(client):
    r = client.post("/ingest/apple-health", json=HAE)
    assert r.status_code == 201, r.text
    j = r.json()
    assert j["guardadas"] == 5 and j["ignoradas"] == 1
    assert j["por_tipo"] == {"hr_reposo": 2, "hrv_sdnn": 1, "sueno_horas": 1, "sueno_eficiencia_pct": 1}
    m = [x for x in almacen.listar(1) if x.tipo == "sueno_eficiencia_pct"][0]
    assert round(m.valor, 1) == 86.7 and m.fuente == "apple_watch" and m.capa == "real"
    otra = client.post("/ingest/apple-health", json=HAE).json()
    assert otra["guardadas"] == 0 and otra["duplicadas"] == 5


def test_apple_health_rechaza_json_ajeno(client):
    assert client.post("/ingest/apple-health", json={"hola": 1}).status_code == 422


# ------------------------------------------------------------------ demo

def test_reiniciar_demo_conserva_lo_real(client):
    client.post("/measurements", json=[_hr(66, None), _hr(67, None)])
    client.post("/demo/advance", json={"dias": 3})
    assert any(m.fuente == "simulador" for m in almacen.mediciones)
    client.post("/demo/reset")
    assert [m.fuente for m in almacen.mediciones] == ["camara", "camara"]
    assert almacen.linea_base(1, "hr_reposo").n == 2


# ------------------------------------------------------------------ PostgreSQL (con SQLite en la prueba)

def test_persistencia_guarda_y_restaura(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'astro.db'}")
    try:
        assert persistencia.iniciar(engine)
        with Session(engine) as s:
            assert s.scalar(select(func.count()).select_from(Astronauta)) == 4
            assert s.scalar(select(func.count()).select_from(EntornoDB)) >= 4
        for d in range(1, 30):
            asyncio.run(correr_dia(d))
        persistencia.foto()
        n = len(almacen.mediciones)
        media = almacen.linea_base(1, "hr_reposo").media
        with Session(engine) as s:
            assert s.scalar(select(func.count()).select_from(MedicionDB)) == n
            assert s.scalar(select(func.count()).select_from(AlertaDB)) >= 2
        persistencia.detener()

        # "Reinicia la API": memoria vacía y se vuelve a cargar todo desde la base
        almacen.reset()
        from app.triage import alerts

        alerts.reset()
        assert persistencia.iniciar(engine)
        assert len(almacen.mediciones) == n
        assert abs(almacen.linea_base(1, "hr_reposo").media - media) < 1e-9
        assert len(alerts.listar().activas) + len(alerts.listar().resueltas) >= 2
    finally:
        persistencia.detener()


# ------------------------------------------------------------------ confiabilidad, ficha y evolución

from app.intelligence import validacion  # noqa: E402


def test_validacion_metricas_y_umbral():
    # Confianza alta = error chico, confianza baja = error grande: el umbral debe quedar en medio
    pares = [validacion.Par(70 + i % 3, 70, 0.8) for i in range(12)] + [validacion.Par(90, 70, 0.35) for _ in range(6)]
    c = validacion.evaluar(pares)
    assert c.estado == "verificado"
    assert c.umbral == 0.4 or c.umbral == 0.5
    assert c.sobre_umbral.exito_5 >= 0.9
    assert c.global_.n == 18 and c.global_.loa[0] < c.global_.sesgo < c.global_.loa[1]


def test_validacion_sin_pares_no_inventa():
    c = validacion.evaluar([])
    assert c.estado == "sin_validar" and c.umbral is None and "POS" in c.explicacion


def test_referencia_se_empareja_con_la_camara(client):
    assert client.post("/validacion/referencia", json={"hr_lpm": 70}).status_code == 404
    client.post("/measurements", json=_hr(72, 1, conf=0.7))
    r = client.post("/validacion/referencia", json={"hr_lpm": 70, "fuente": "oximetro"})
    assert r.status_code == 201 and r.json()["camara"] == 72
    assert client.post("/validacion/referencia", json={"hr_lpm": 70, "fuente": "oximetro"}).status_code == 409
    v = client.get("/validacion").json()
    assert v["global"]["n"] == 1 and v["estado"] == "validando"


def test_lote_de_base_publica(client):
    r = client.post("/validacion/lote", json={"pares": [{"camara": 80, "referencia": 79, "confianza": 0.9, "origen": "UBFC-rPPG"}] * 3})
    assert r.status_code == 201
    assert client.get("/validacion?origen=UBFC-rPPG").json()["global"]["mae"] == 1.0
    assert client.delete("/validacion?origen=UBFC-rPPG").json()["borrados"] == 3


def test_ficha_y_evolucion(client):
    assert client.get("/ficha/1").json()["basales"]["hr_reposo"] is None
    ficha = {"astronauta_id": 1, "nombre": "Astronauta 1", "tipo_sangre": "O+", "alergias": ["penicilina"],
             "basales": {"hr_reposo": 62, "presion_sis": 115, "presion_dia": 74}}
    assert client.put("/ficha/1", json=ficha).status_code == 200
    assert client.put("/ficha/2", json=ficha).status_code == 422
    assert client.get("/ficha/1").json()["alergias"] == ["penicilina"]
    client.post("/measurements", json=[_hr(72 + (i % 2), i + 1) for i in range(8)])
    e = client.get("/evolucion/1").json()
    hr = next(i for i in e["items"] if i["tipo"] == "hr_reposo")
    assert e["tiene_ficha"] and hr["referencia"] == "ficha" and hr["estado"] == "empeora" and hr["cambio"] > 9
    assert next(i for i in e["items"] if i["tipo"] == "animo")["estado"] == "sin_datos"


def test_persistencia_de_ficha_y_pares(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'c.db'}")
    from app.models.clinico import clinico
    from app.schemas.clinico import FichaMedica

    try:
        persistencia.iniciar(engine)
        clinico.guardar_ficha(FichaMedica(astronauta_id=1, tipo_sangre="A+"))
        clinico.agregar_par(camara=70, referencia=71, confianza=0.8, origen="propio")
        persistencia.detener()
        clinico.reset()
        persistencia.iniciar(engine)
        assert clinico.fichas[1].tipo_sangre == "A+" and len(clinico.pares) == 1
    finally:
        persistencia.detener()


def test_script_de_bases_publicas_con_senal_sintetica():
    """Ventanas de 20 s del script de UBFC/PURE: un pulso de 1.2 Hz debe dar ~72 lpm contra referencia 72."""
    import numpy as np

    from ml.validar_dataset import _ventanas

    fs, dur = 30.0, 60.0
    t = np.arange(0, dur, 1 / fs)
    rng = np.random.default_rng(1)
    pulso = 0.6 * np.sin(2 * np.pi * 1.2 * t)
    rgb = np.stack([120 + 0.3 * pulso, 90 + pulso, 70 + 0.5 * pulso], axis=1) + rng.normal(0, 0.05, (len(t), 3))
    pares = _ventanas(t * 1000, rgb, t, np.full(len(t), 72.0), "sintetico")
    assert len(pares) >= 7
    assert all(abs(p["camara"] - 72) <= 3 for p in pares)


def test_seed_llena_la_base(tmp_path, monkeypatch):
    """python -m app.seed con una base SQLite: tablas, 10 días simulados y fichas de ejemplo."""
    from app import seed
    from app.core import db

    url = f"sqlite:///{tmp_path / 'seed.db'}"
    monkeypatch.setattr(seed.settings, "database_url", url)
    db.get_engine.cache_clear()
    monkeypatch.setattr("sys.argv", ["seed", "--dias", "10", "--fichas-demo"])
    try:
        seed.main()
        engine = create_engine(url)
        with Session(engine) as s:
            assert s.scalar(select(func.count()).select_from(MedicionDB)) > 400
        from app.models.tablas import FichaDB

        with Session(engine) as s:
            assert s.scalar(select(func.count()).select_from(FichaDB)) == 4
    finally:
        persistencia.detener()
        monkeypatch.setattr(seed.settings, "database_url", "")
        db.get_engine.cache_clear()
