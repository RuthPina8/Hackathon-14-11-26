"""El guion de la demo (motor.md §8) sale del motor real, no de reglas escritas a mano."""

from app.simulator import generador


def test_generador_es_determinista_y_honesto():
    a, b = generador.dia(20), generador.dia(20)
    assert a == b
    assert all(m["fuente"] == "simulador" and m["capa"] in ("real", "auto") for m in a)


def test_guion_completo(client):
    client.post("/demo/advance", json={"dias": 23})
    alertas = client.get("/alerts").json()
    a1 = [x for x in alertas["activas"] + alertas["resueltas"] if x["astronauta_id"] == 1]
    # A1: deuda de sueño y ritmo que sube de forma sostenida (CUSUM), en un solo episodio
    assert any("sueno" in x["detectores"] for x in a1)
    assert any("cusum" in x["detectores"] and "hr_reposo" in x["factores"] for x in a1)
    # A2 y A4 no tienen nada raro en el guion: ninguna alerta
    assert not [x for x in alertas["activas"] + alertas["resueltas"] if x["astronauta_id"] in (2, 4)]

    # Un solo episodio para A1, y sigue abierto mientras el ritmo siga alto (día 23)
    assert len(a1) == 1 and a1[0]["estado"] != "resuelta"

    client.post("/demo/advance", json={"dias": 9})  # día 32
    alertas = client.get("/alerts").json()
    assert not [x for x in alertas["activas"] if x["astronauta_id"] == 1]  # A1 descansó: se resolvió sola
    a3 = [x for x in alertas["resueltas"] if x["astronauta_id"] == 3 and x["senal"] == "sintomas"]
    assert a3 and a3[0]["nivel"] == "roja" and a3[0]["mensaje_cola_id"] is not None  # escalada y luego resuelta

    s = client.get("/status").json()
    assert s["animo_camara"]["estado"] == "activo" and s["animo_camara"]["acierto_pct"] >= 70
    assert s["calibracion"] >= 70
