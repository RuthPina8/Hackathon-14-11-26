"""Pruebas del motor de Back 1 (docs/motor.md y api/CLAUDE.md, "Pruebas mínimas")."""

import numpy as np

from app.intelligence import detectors, immune, mood_model, sleep


# ------------------------------------------------------------ detectores

def test_cusum_detecta_escalon_y_el_desde_cae_cerca():
    rng = np.random.default_rng(0)
    serie = list(70 + rng.normal(0, 2, 20)) + list(75 + rng.normal(0, 2, 8))  # +2.5σ desde el índice 20
    r = detectors.cusum(serie, 70, 2, "sube")
    assert r.alarma
    assert 18 <= r.indice_desde <= 22


def test_cusum_sin_cambio_no_avisa():
    rng = np.random.default_rng(1)
    serie = list(70 + rng.normal(0, 2, 30))
    assert not detectors.cusum(serie, 70, 2, "sube").alarma


def test_cusum_deja_de_avisar_cuando_te_recuperas():
    serie = [70.0] * 15 + [76.0] * 5 + [70.0] * 2
    assert not detectors.cusum(serie, 70, 2, "sube").alarma


def test_ewma_detecta_deriva_lenta():
    serie = [70 + 1.0 * i for i in range(7)]  # sube 1 lpm por día (3σ en una semana)
    assert detectors.ewma(serie, 70, 2, "sube").alarma
    assert not detectors.ewma([70, 71, 69, 70, 70, 71, 69], 70, 2, "sube").alarma


def test_regla_sueno_tres_noches():
    assert detectors.regla_sueno([7, 7, 5.5, 5.4, 5.8], 6, 3).alarma
    assert not detectors.regla_sueno([7, 5.5, 7, 5.4, 5.8], 6, 3).alarma


def test_isolation_forest_no_se_activa_antes_de_14_dias():
    hist = [{"hr_reposo": 0.0, "perclos": 0.0}] * 10
    assert not detectors.isolation_forest(hist, {"hr_reposo": 3, "perclos": 3}, ["hr_reposo", "perclos"]).activo


def test_isolation_forest_avisa_combinacion_rara_y_explica():
    rng = np.random.default_rng(42)
    cols = ["hr_reposo", "perclos", "reaccion_ms", "sueno_horas"]
    hist = [{c: float(rng.normal(0, 0.7)) for c in cols} for _ in range(25)]
    raro = {"hr_reposo": 2.5, "perclos": 2.8, "reaccion_ms": 2.2, "sueno_horas": -2.6}
    r = detectors.isolation_forest(hist, raro, cols)
    assert r.activo and r.alarma
    assert set(r.factores) == set(cols) and abs(sum(r.factores.values()) - 100) < 0.5
    normal = {c: 0.1 for c in cols}
    assert not detectors.isolation_forest(hist, normal, cols).alarma


# ------------------------------------------------------------ sueño e inmune

def test_diario_de_sueno():
    r = sleep.calcular(sleep.Diario(acostarse="23:00", intento="23:00", latencia_min=20, waso_min=30,
                                    despertar_final="06:30", levantarse="06:40"))
    assert abs(r.tst_h - 6.67) < 0.01
    assert 86 <= r.eficiencia_pct <= 88


def _dias(*listas):
    return {i + 1: {c: 1 for c in l} for i, l in enumerate(listas)}


def test_inmune_fiebre_y_congestion_un_dia_amarillo():
    assert immune.evaluar(_dias(["fiebre", "congestion"])).estado == "amarillo"


def test_inmune_fiebre_y_congestion_dos_dias_rojo():
    assert immune.evaluar(_dias(["fiebre", "congestion"], ["fiebre", "congestion"])).estado == "rojo"


def test_inmune_congestion_sola():
    assert immune.evaluar(_dias(*[["congestion"]] * 2)).estado == "verde"
    assert immune.evaluar(_dias(*[["congestion"]] * 3)).estado == "amarillo"
    assert immune.evaluar(_dias(*[["congestion"]] * 7)).estado == "rojo"


def test_inmune_guion_de_la_demo():
    # Congestión 25-29, fuego labial 27-29, fiebre 28 y 29 -> amarillo el 27, rojo el 29
    por_dia = {}
    estados = {}
    for d in range(25, 30):
        por_dia[d] = {"congestion": 1}
        if d >= 27:
            por_dia[d]["fuego_labial"] = 1
        if d >= 28:
            por_dia[d]["fiebre"] = 1
        estados[d] = immune.evaluar(dict(por_dia)).estado
    assert estados[26] == "verde" and estados[27] == "amarillo" and estados[29] == "rojo"


def test_inmune_sin_registros():
    assert immune.evaluar({}).estado == "sin_datos"


# ------------------------------------------------------------ modelo de ánimo

def test_modelo_animo_aprende_de_tus_senales():
    rng = np.random.default_rng(7)
    dias, etiquetas = [], []
    for _ in range(20):
        sueno = float(rng.normal(0, 1))
        expres = float(rng.normal(0, 1))
        dias.append({"sueno_horas": sueno, "expresividad": expres, "perclos": -sueno + float(rng.normal(0, 0.3))})
        etiquetas.append(float(np.clip(round(3.2 + 0.8 * sueno + 0.5 * expres), 1, 5)))
    r = mood_model.entrenar(dias, etiquetas, hoy={"sueno_horas": -2, "expresividad": -1})
    assert r.estado == "activo" and r.acierto_pct >= 70
    assert r.estimado_hoy < 3
    assert "sueño" in r.explicacion


def test_modelo_animo_aprendiendo_con_pocos_dias():
    assert mood_model.entrenar([{"perclos": 0.1}] * 5, [3] * 5).estado == "aprendiendo"


# ------------------------------------------------------------ pipeline

def test_confianza_baja_no_entra_a_la_linea_base_ni_alerta(client):
    r = client.post("/measurements", json={"tipo": "hr_reposo", "valor": 140, "capa": "real", "fuente": "camara", "confianza": 0.3})
    assert r.json()["alerta_id"] is None
    assert client.get("/indicators/hr").json()["linea_base"]["n"] == 0


def test_alerta_congelada_no_pinta_verde(client):
    for d, v in enumerate((64, 65, 63, 64, 66, 64)):
        client.post("/measurements", json={"tipo": "hr_reposo", "valor": v, "capa": "real", "fuente": "camara", "dia_mision": 15 + d})
    r = client.post("/measurements", json={"tipo": "hr_reposo", "valor": 99, "capa": "real", "fuente": "camara", "dia_mision": 21})
    assert r.json()["alerta_id"] is not None
    # La alerta congela hr_reposo; el semáforo debe seguir comparando con la historia previa
    assert client.get("/status").json()["sistemas"]["cardiovascular"]["estado"] != "verde"


def test_inmune_por_pipeline_y_status(client):
    for d in (1, 2):
        client.post("/measurements", json={"tipo": "sintomas", "valor": 2, "capa": "auto", "fuente": "manual", "dia_mision": 20 + d,
                                           "detalle": {"lista": [{"clave": "fiebre", "intensidad": 2}, {"clave": "congestion", "intensidad": 1}]}})
    s = client.get("/status").json()
    assert s["sistemas"]["inmune"]["estado"] == "rojo"
    assert s["inmune"]["estado"] == "rojo" and "Fiebre" in s["inmune"]["motivo"]
    assert client.get("/alerts").json()["activas"][0]["nivel"] == "roja"


def test_status_trae_animo_camara(client):
    client.post("/measurements", json={"tipo": "animo", "valor": 4, "capa": "auto", "fuente": "manual"})
    s = client.get("/status").json()
    assert s["animo_camara"]["estado"] == "aprendiendo"


# ------------------------------------------------------------ rPPG

def _video_sintetico(f_hz: float, seg: float = 30, fps: float = 30, ruido: float = 0.3, pulso: float = 1.0, seed: int = 0):
    rng = np.random.default_rng(seed)
    t = np.arange(0, seg, 1 / fps)
    p = pulso * np.sin(2 * np.pi * f_hz * t)
    rgb = np.stack([150 + 0.3 * p, 110 + 1.0 * p, 90 + 0.5 * p], axis=1) + rng.normal(0, ruido, (len(t), 3))
    rgb += np.linspace(0, 3, len(t))[:, None]  # deriva de luz
    return list(t * 1000), rgb.tolist()


def test_rppg_seno_de_1_2_hz_da_72_lpm():
    from app.intelligence import rppg
    t, rgb = _video_sintetico(1.2)
    r = rppg.estimar(t, rgb, 30)
    assert abs(r.hr_lpm - 72) <= 3
    assert r.confianza >= 0.5


def test_rppg_solo_ruido_da_confianza_baja():
    from app.intelligence import rppg
    t, rgb = _video_sintetico(1.2, pulso=0.0, ruido=1.0, seed=3)
    assert rppg.estimar(t, rgb, 30).confianza < 0.5


def test_rppg_endpoint(client):
    t, rgb = _video_sintetico(1.0)
    r = client.post("/rppg/estimate", json={"fps": 30, "t_ms": t, "rgb": rgb}).json()
    assert abs(r["hr_lpm"] - 60) <= 3 and "hrv_rmssd" in r and "resp_rpm" in r
