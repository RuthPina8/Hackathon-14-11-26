from app.entornos.perfiles import activo
from app.triage.queue import QueueEngine, retraso_actual


def test_prioridad_y_un_mensaje_a_la_vez():
    activo.cambiar("nave")  # 32 kbps, retraso demo 8 s
    q = QueueEngine()
    reporte = q.encolar("reporte", 3, 4.0)  # 1 s de transmisión
    alerta = q.encolar("alerta", 1, 4.0)

    q.tick(0.0)
    assert q.mensajes[alerta.id].estado == "transmitiendo"
    assert q.mensajes[reporte.id].estado == "en_cola"

    q.tick(1.0)
    assert q.mensajes[alerta.id].estado == "en_transito"
    assert q.mensajes[reporte.id].estado == "transmitiendo"


def test_llega_despues_del_retraso_y_reporta_progreso():
    activo.cambiar("nave")
    q = QueueEngine()
    m = q.encolar("alerta", 1, 4.0)
    q.tick(0.0)
    q.tick(1.0)  # termina de transmitir
    retraso = retraso_actual()

    mitad = q.vista(q.mensajes[m.id], now=1.0 + retraso / 2)
    assert 0.45 <= mitad.progreso <= 0.55
    assert abs(mitad.eta_s - retraso / 2) < 0.01

    cambiados = q.tick(1.0 + retraso)
    assert q.mensajes[m.id].estado == "entregado"
    assert q.mensajes[m.id].entregado is not None
    assert any(c.id == m.id for c in cambiados)


def test_un_tick_largo_atraviesa_varios_estados():
    activo.cambiar("iss")
    q = QueueEngine()
    m = q.encolar("reporte", 3, 1.0)
    q.tick(0.0)
    q.tick(100.0)
    assert q.mensajes[m.id].estado == "entregado"
