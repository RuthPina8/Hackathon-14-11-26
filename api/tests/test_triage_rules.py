from datetime import datetime, timezone

from app.schemas.anomaly import Anomaly
from app.triage import rules


def a(senal="hr_reposo", detector="zscore", z=2.5, **kw):
    return Anomaly(senal=senal, detector=detector, z=z, **kw)


def test_z_define_el_nivel():
    assert rules.evaluar([a(z=2.1)]).nivel == "amarilla"
    assert rules.evaluar([a(z=-3.2)]).nivel == "roja"


def test_capa_sim_y_fuente_modelo_nunca_alertan():
    assert rules.evaluar([a(capa="sim")]) is None
    assert rules.evaluar([a(senal="animo_estimado", fuente="modelo")]) is None


def test_fase_tierra_no_alerta():
    assert rules.evaluar([a(z=5)], fase="tierra") is None


def test_adaptacion_solo_rango_clinico_e_inmune():
    assert rules.evaluar([a(detector="cusum")], fase="adaptacion") is None
    d = rules.evaluar([a(detector="rango_clinico", z=None, valor=110)], fase="adaptacion")
    assert d is not None and d.nivel == "roja"
    assert rules.evaluar([a(senal="inmune", detector="inmune", z=None, nivel_sugerido="amarilla")], fase="adaptacion")


def test_fase_por_dia():
    assert rules.fase_de_dia(0) == "tierra"
    assert rules.fase_de_dia(1) == "adaptacion"
    assert rules.fase_de_dia(14) == "adaptacion"
    assert rules.fase_de_dia(15) == "personal"


def test_tres_senales_suben_a_roja():
    d = rules.evaluar([a("hr_reposo", z=2.1), a("perclos", z=2.0), a("reaccion_ms", z=2.2)])
    assert d.nivel == "roja"
    assert set(d.senales) == {"hr_reposo", "perclos", "reaccion_ms"}


def test_factores_suman_100_y_principal_es_la_mayor():
    d = rules.evaluar([a("hr_reposo", z=2.0), a("perclos", z=3.0)])
    assert abs(sum(d.factores.values()) - 100) < 0.5
    assert d.factores == {"perclos": 60.0, "hr_reposo": 40.0}
    assert d.senal == "perclos"


def test_desde_es_el_mas_antiguo():
    t1 = datetime(2026, 11, 1, tzinfo=timezone.utc)
    t2 = datetime(2026, 11, 5, tzinfo=timezone.utc)
    d = rules.evaluar([a(desde=t2), a("perclos", desde=t1)])
    assert d.desde == t1


def test_nivel_sugerido_manda():
    d = rules.evaluar([a(senal="inmune", detector="inmune", z=None, nivel_sugerido="roja")])
    assert d.nivel == "roja"
