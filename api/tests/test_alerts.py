import asyncio

from app.schemas.anomaly import Anomaly
from app.triage import alerts, baseline


def run(coro):
    return asyncio.run(coro)


def anom(senal="hr_reposo", z=2.4, **kw):
    return Anomaly(senal=senal, detector="zscore", z=z, **kw)


def test_alerta_congela_la_linea_base_y_ack_la_descongela():
    alerta = run(alerts.handle_anomalies(1, [anom(), anom("perclos", z=2.1)], dia_mision=20))
    assert alerta.estado == "activa"
    assert baseline.esta_congelada(1, "hr_reposo")
    assert baseline.esta_congelada(1, "perclos")

    alerta = run(alerts.ack(alerta.id))
    assert alerta.estado == "atendida"
    assert not baseline.esta_congelada(1, "hr_reposo")
    assert not baseline.esta_congelada(1, "perclos")


def test_misma_senal_no_duplica_y_puede_subir_de_nivel():
    a1 = run(alerts.handle_anomalies(1, [anom(z=2.1)], dia_mision=20))
    a2 = run(alerts.handle_anomalies(1, [anom(z=3.4)], dia_mision=21))
    assert a1.id == a2.id
    assert a2.nivel == "roja"
    assert len(alerts.listar().activas) == 1


def test_baja_de_z_no_baja_el_nivel():
    run(alerts.handle_anomalies(1, [anom(z=3.4)], dia_mision=20))
    a = run(alerts.handle_anomalies(1, [anom(z=2.1)], dia_mision=21))
    assert a.nivel == "roja"


def test_fase_de_adaptacion_no_alerta_por_zscore():
    assert run(alerts.handle_anomalies(1, [anom(z=4)], dia_mision=5)) is None
    assert alerts.listar().activas == []


def test_escalar_encola_hacia_tierra_y_es_idempotente():
    from app.triage.queue import engine

    a = run(alerts.handle_anomalies(2, [anom(z=3.5)], dia_mision=20))
    e1 = run(alerts.escalate(a.id))
    e2 = run(alerts.escalate(a.id))
    assert e1.estado == "escalada"
    assert e1.mensaje_cola_id == e2.mensaje_cola_id
    assert len(engine.mensajes) == 1
    msg = engine.mensajes[e1.mensaje_cola_id]
    assert msg.prioridad == 1 and msg.tipo == "alerta"


def test_resolver_cierra_y_descongela():
    a = run(alerts.handle_anomalies(1, [anom()], dia_mision=20))
    r = run(alerts.resolver(1, "hr_reposo"))
    assert r.id == a.id and r.estado == "resuelta"
    assert not baseline.esta_congelada(1, "hr_reposo")
    assert alerts.listar().resueltas[0].id == a.id
    # Una anomalía nueva después de resolver abre otra alerta
    b = run(alerts.handle_anomalies(1, [anom()], dia_mision=30))
    assert b.id != a.id


def test_no_se_atiende_una_resuelta():
    a = run(alerts.handle_anomalies(1, [anom()], dia_mision=20))
    run(alerts.resolver(1, "hr_reposo"))
    try:
        run(alerts.ack(a.id))
        raise AssertionError("debió fallar")
    except alerts.AlertError as e:
        assert e.status == 409
