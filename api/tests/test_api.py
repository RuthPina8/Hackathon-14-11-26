def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["ok"] is True


def test_environment_get_put(client):
    r = client.get("/environment")
    assert r.json()["activo"] == "nave"
    assert set(r.json()["disponibles"]) >= {"iss", "luna", "nave", "marte"}

    r = client.put("/environment", json={"id": "marte"})
    assert r.status_code == 200 and r.json()["perfil"]["gravedad_g"] == 0.38
    assert client.put("/environment", json={"id": "pluton"}).status_code == 404


def test_simulation(client):
    r = client.get("/simulation", params={"env": "nave", "day": 120})
    assert r.status_code == 200
    s = r.json()
    assert s["capa"] == "sim"
    assert s["radiacion"]["dosis_msv"] == 216.0  # 1.8 mSv/día * 120
    assert 0 < s["oseo"]["perdida_pct"] < 10
    assert s["oseo"]["serie"][0] == {"dia": 0, "valor": 100.0}
    assert s["riesgo"]["nivel"] in {"bajo", "medio", "alto"}
    assert client.get("/simulation", params={"env": "x"}).status_code == 404


def test_flujo_alerta_ack_escalate(client):
    import asyncio

    from app.schemas.anomaly import Anomaly
    from app.triage import alerts

    a = asyncio.run(alerts.handle_anomalies(1, [Anomaly(senal="hr_reposo", detector="zscore", z=3.1)], dia_mision=20))
    r = client.get("/alerts")
    assert [x["id"] for x in r.json()["activas"]] == [a.id]

    assert client.post(f"/alerts/{a.id}/escalate").json()["estado"] == "escalada"
    assert len(client.get("/queue").json()["mensajes"]) == 1
    assert client.post(f"/alerts/{a.id}/ack").json()["estado"] == "atendida"
    assert client.post("/alerts/999/ack").status_code == 404


def test_websocket_recibe_eventos_del_modo_demo(client):
    with client.websocket_connect("/ws") as ws:
        ws.send_text("ping")
        assert ws.receive_json()["event"] == "pong"

        r = client.post("/demo/advance", json={"dias": 1})
        assert r.json()["dia"] == 1
        eventos = set()
        while True:
            msg = ws.receive_json()
            eventos.add(msg["event"])
            if msg["event"] == "demo_tick":
                break
        assert "measurement_added" in eventos


def test_guion_completo_produce_alertas_y_escalada(client):
    r = client.post("/demo/advance", json={"dias": 30})
    assert r.json()["dia"] == 30
    alertas = client.get("/alerts").json()
    resueltas = alertas["resueltas"]
    activas = alertas["activas"]
    assert any(x["astronauta_id"] == 1 for x in resueltas)  # A1 descansó y se resolvió
    a3 = [x for x in activas if x["astronauta_id"] == 3]
    assert a3 and a3[0]["nivel"] == "roja" and a3[0]["estado"] == "escalada"

    assert client.post("/demo/reset").json()["dia"] == 0
    assert client.get("/alerts").json() == {"activas": [], "resueltas": []}
