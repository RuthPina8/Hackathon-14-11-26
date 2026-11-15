"""ASTRA-MOVE + Environmental Intelligence + inteligencia contextual."""

from datetime import datetime, timedelta, timezone

import pytest

from app.intelligence import correlacion
from app.mision.contexto import contexto
from app.mision.movimiento import movimiento
from app.mision.telemetria import fuera_de_rango, rangos, telemetria
from app.schemas.movement import SesionIn
from app.schemas.telemetry import TelemetriaIn


@pytest.fixture(autouse=True)
def limpio():
    contexto.reset()
    movimiento.reset()
    telemetria.reset()
    yield


def sesion(reps, calidad=0.9, fuente="webcam", ejercicio="brazos", fecha=None):
    return movimiento.registrar(SesionIn(ejercicio=ejercicio, repeticiones=reps, duracion_s=45, calidad=calidad, fuente=fuente), fecha=fecha)


ESTABLE = dict(co2_ppm=800, o2_pct=20.9, temp_c=22, humedad_pct=45, radiacion_msv_dia=1.8)
MALO = dict(co2_ppm=4300, o2_pct=19.2, temp_c=28.5, humedad_pct=80, radiacion_msv_dia=1.8)


def lectura(valores, fecha):
    return telemetria.registrar(TelemetriaIn(**valores), fecha=fecha)


LIM = None


def lim():
    return {r.variable: (r.minimo, r.maximo) for r in rangos()}


# --- Telemetría -----------------------------------------------------------------------

def test_rangos_del_escenario_de_demo():
    assert fuera_de_rango(ESTABLE) == []
    assert set(fuera_de_rango(MALO)) == {"co2_ppm", "o2_pct", "temp_c", "humedad_pct"}


def test_radiacion_fuera_si_pasa_el_doble_del_perfil():
    # entorno nave: 1.8 mSv/día -> fuera arriba de 3.6
    assert "radiacion_msv_dia" not in fuera_de_rango({**ESTABLE, "radiacion_msv_dia": 3.0})
    assert "radiacion_msv_dia" in fuera_de_rango({**ESTABLE, "radiacion_msv_dia": 5.4})


def test_escenarios_cambian_poco_a_poco_y_todo_es_simulado():
    primera = telemetria.simular_lectura()
    assert primera.capa == "sim" and primera.fuente == "simulador" and primera.fuera_de_rango == []
    telemetria.escenario = "revision"
    lecturas = [telemetria.simular_lectura() for _ in range(12)]
    assert lecturas[0].co2_ppm < lecturas[-1].co2_ppm  # se acerca gradualmente
    assert len(lecturas[-1].fuera_de_rango) >= 3
    telemetria.escenario = "cambio"
    for _ in range(15):
        ult = telemetria.simular_lectura()
    assert "co2_ppm" in ult.fuera_de_rango and "temp_c" not in ult.fuera_de_rango


# --- ASTRA-MOVE -----------------------------------------------------------------------

def test_sin_referencia_hasta_dos_sesiones():
    assert sesion(12).comparacion.estado == "sin_referencia"
    assert sesion(11).comparacion.estado == "sin_referencia"
    c = sesion(12).comparacion
    assert c.estado == "estable" and c.referencia_reps == 11.5


def test_baja_de_20_por_ciento_es_cambio_funcional():
    sesion(12); sesion(12)
    c = sesion(9).comparacion
    assert c.estado == "bajo" and c.cambio_pct == -25.0
    assert "25% menos" in c.texto


def test_baja_calidad_no_se_compara_ni_cuenta():
    sesion(12); sesion(12)
    assert sesion(3, calidad=0.4).comparacion.estado == "baja_calidad"
    # la de baja calidad no ensucia la referencia
    assert sesion(12).comparacion.referencia_reps == 12.0


def test_sesion_de_demo_va_marcada():
    s = sesion(10, fuente="demo")
    assert s.dato_demo and s.capa == "sim"


# --- Correlación ----------------------------------------------------------------------

def test_cambio_funcional_y_ambiental_en_la_misma_ventana_da_hallazgo():
    ahora = datetime.now(timezone.utc)
    sesion(12, fecha=ahora - timedelta(days=2)); sesion(12, fecha=ahora - timedelta(days=1))
    baja = sesion(8, fecha=ahora)
    for m in (30, 20, 10):
        lectura(MALO, ahora - timedelta(minutes=m))
    h = correlacion.evaluar(baja, telemetria.lecturas, lim())
    assert h is not None and h.lecturas_fuera == 3
    assert {"co2_ppm", "o2_pct"} <= set(h.variables)
    assert any("ventilación" in a for a in h.acciones)


def test_ambiente_fuera_de_la_ventana_no_da_hallazgo():
    ahora = datetime.now(timezone.utc)
    sesion(12, fecha=ahora - timedelta(days=2)); sesion(12, fecha=ahora - timedelta(days=1))
    baja = sesion(8, fecha=ahora)
    for h in (5, 6):
        lectura(MALO, ahora - timedelta(hours=h))
    assert correlacion.evaluar(baja, telemetria.lecturas, lim()) is None


def test_sin_cambio_funcional_no_hay_hallazgo_aunque_el_ambiente_cambie():
    ahora = datetime.now(timezone.utc)
    sesion(12); sesion(12)
    normal = sesion(12, fecha=ahora)
    for m in (20, 10):
        lectura(MALO, ahora - timedelta(minutes=m))
    assert correlacion.evaluar(normal, telemetria.lecturas, lim()) is None


def test_una_sola_lectura_fuera_es_ruido():
    ahora = datetime.now(timezone.utc)
    sesion(12); sesion(12)
    baja = sesion(8, fecha=ahora)
    lectura(MALO, ahora - timedelta(minutes=10))
    lectura(ESTABLE, ahora - timedelta(minutes=5))
    assert correlacion.evaluar(baja, telemetria.lecturas, lim()) is None


# --- API y flujo de la demo -----------------------------------------------------------

def test_flujo_completo_de_la_demo(client):
    with client.websocket_connect("/ws") as ws:
        assert client.post("/movement/demo", json={"tipo": "linea_base"}).status_code == 201
        client.post("/telemetry/simulate", json={"escenario": "revision"})
        for _ in range(6):
            telemetria.simular_lectura()

        r = client.post("/movement/demo", json={"tipo": "descenso"})
        assert r.json()[0]["comparacion"]["estado"] == "bajo"

        eventos = set()
        for _ in range(40):
            m = ws.receive_json()
            eventos.add(m["event"])
            if m["event"] == "mission_correlation":
                break
        assert {"movement_recorded", "telemetry_updated", "mission_correlation"} <= eventos

    ctx = client.get("/mission/context").json()
    assert ctx["escenario"] == "revision"
    assert ctx["funcional"]["comparacion"]["estado"] == "bajo"
    obs = ctx["observaciones"]
    assert len(obs) == 1 and obs[0]["nivel"] == "informativa"
    assert "No se establece causa" in obs[0]["causalidad"]
    assert any("SIMULADA" in c for c in obs[0]["confiabilidad"])
    assert any("dato de demo" in c for c in obs[0]["confiabilidad"])
    # Una sesión genera una sola observación aunque lleguen más lecturas
    client.post("/telemetry/simulate", json={"escenario": "revision"})
    assert len(client.get("/mission/context").json()["observaciones"]) == 1


def test_endpoints_de_movimiento_y_telemetria(client):
    assert client.get("/movement/latest").status_code == 404
    r = client.post("/movement/sessions", json={"ejercicio": "sentadilla", "repeticiones": 10, "duracion_s": 42, "calidad": 0.91})
    assert r.status_code == 201 and r.json()["capa"] == "real"
    assert client.get("/movement/latest").json()["repeticiones"] == 10
    assert len(client.get("/movement/history").json()) == 1
    assert client.post("/movement/sessions", json={"ejercicio": "sentadilla", "repeticiones": 10, "duracion_s": 42, "calidad": 1.5}).status_code == 422

    t = client.get("/telemetry/latest").json()
    assert "SIMULADOS" in t["nota"] and {x["variable"] for x in t["rangos"]} >= {"co2_ppm", "o2_pct", "temp_c", "humedad_pct"}
    assert client.post("/telemetry", json={**ESTABLE}).json()["capa"] == "sim"
    assert len(client.get("/telemetry/history").json()) >= 1
    assert client.post("/telemetry/simulate", json={"escenario": "otro"}).status_code == 422


def test_sesion_de_practica_no_cuenta_para_la_referencia_ni_la_correlacion():
    ahora = datetime.now(timezone.utc)
    sesion(12, fecha=ahora - timedelta(days=2)); sesion(12, fecha=ahora - timedelta(days=1))
    p = movimiento.registrar(SesionIn(ejercicio="brazos", repeticiones=3, duracion_s=45, calidad=0.9, practica=True), fecha=ahora)
    assert p.practica and p.comparacion.estado == "bajo"
    for m in (20, 10):
        lectura(MALO, ahora - timedelta(minutes=m))
    assert correlacion.evaluar(p, telemetria.lecturas, lim()) is None
    # la de práctica no ensucia la referencia de la siguiente
    assert sesion(12).comparacion.referencia_reps == 12.0
