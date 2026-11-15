"""Inmune por síntomas autorreportados (docs/motor.md, sección 5). Funciones puras.

Basado en la incidencia de síntomas en la ISS (Crucian et al. 2016). No es un diagnóstico:
el color dice "vigila esto", y el motivo explica por qué.
"""

from dataclasses import dataclass

# clave -> peso inmune (ajustable). Lo que no está aquí pesa 0 y no cuenta como inmune.
PESOS: dict[str, float] = {
    "erupcion_piel": 1, "congestion": 1, "fuego_labial": 2, "infeccion_piel": 2,
    "garganta": 1, "oido": 1, "urinario": 1, "fiebre": 3,
}
PESO_CONGESTION_ADAPTACION = 0.5  # en adaptación puede ser redistribución de líquidos

NOMBRES = {
    "erupcion_piel": "erupción en la piel", "congestion": "congestión", "fuego_labial": "fuego labial",
    "infeccion_piel": "herida infectada", "garganta": "dolor de garganta", "oido": "dolor de oído",
    "urinario": "ardor al orinar", "fiebre": "fiebre",
}


def claves_del_dia(lista: list) -> dict[str, int]:
    """Normaliza la lista de síntomas del `detalle`: acepta "fiebre" o {"id"/"clave": ..., "intensidad": 1-3}."""
    res: dict[str, int] = {}
    for s in lista or []:
        if isinstance(s, str):
            clave, intensidad = s, 1
        elif isinstance(s, dict):
            clave = s.get("clave") or s.get("id")
            intensidad = int(s.get("intensidad", 1) or 1)
        else:
            continue
        if clave:
            res[clave] = max(res.get(clave, 0), max(1, min(3, intensidad)))
    return res


@dataclass
class EstadoInmune:
    estado: str  # verde | amarillo | rojo | sin_datos
    puntaje: float
    motivo: str
    dia_desde: int | None = None


def _racha(dias: list[int], presentes: set[int]) -> int:
    """Días seguidos hasta el último día registrado en que se cumple `presentes`."""
    n = 0
    for d in reversed(dias):
        if d in presentes:
            n += 1
        else:
            break
    return n


def evaluar(por_dia: dict[int, dict[str, int]], fase: str = "personal", contexto_riesgo: bool = False) -> EstadoInmune:
    """por_dia: día de misión -> {clave: intensidad}. Se evalúa el último día registrado."""
    if not por_dia:
        return EstadoInmune("sin_datos", 0.0, "Sin registros de síntomas")
    dias = sorted(por_dia)
    hoy = dias[-1]

    def peso(clave: str) -> float:
        if clave == "congestion" and fase == "adaptacion":
            return PESO_CONGESTION_ADAPTACION
        return PESOS.get(clave, 0.0)

    ultimos7 = [d for d in dias if d > hoy - 7]
    puntaje = sum(peso(c) * i for d in ultimos7 for c, i in por_dia[d].items())

    inmunes_hoy = {c for c in por_dia[hoy] if c in PESOS}
    dias_con: dict[str, set[int]] = {}
    for d in dias:
        for c in por_dia[d]:
            if c in PESOS:
                dias_con.setdefault(c, set()).add(d)
    rachas = {c: _racha(dias, ds) for c, ds in dias_con.items()}
    racha_fiebre = rachas.get("fiebre", 0)
    otro_hoy = bool(inmunes_hoy - {"fiebre"})

    estado, motivo = "verde", "Sin señales inmunes"
    peor = max(rachas.items(), key=lambda kv: kv[1], default=(None, 0))
    if racha_fiebre >= 2 and otro_hoy:
        estado, motivo = "rojo", f"Fiebre {racha_fiebre} días seguidos junto con {', '.join(NOMBRES[c] for c in sorted(inmunes_hoy - {'fiebre'}))}"
    elif peor[1] >= 7:
        estado, motivo = "rojo", f"{NOMBRES[peor[0]].capitalize()} {peor[1]} días seguidos (prolongado)"
    elif "fiebre" in inmunes_hoy:
        estado, motivo = "amarillo", "Fiebre reportada hoy"
    elif len(inmunes_hoy) >= 2:
        estado, motivo = "amarillo", f"Dos síntomas inmunes el mismo día: {', '.join(NOMBRES[c] for c in sorted(inmunes_hoy))}"
    elif peor[1] >= 3:
        estado, motivo = "amarillo", f"{NOMBRES[peor[0]].capitalize()} {peor[1]} días seguidos"
    elif inmunes_hoy:
        motivo = f"{NOMBRES[sorted(inmunes_hoy)[0]].capitalize()} reportado; aún sin patrón"

    if estado != "verde" and contexto_riesgo:
        motivo += ". Tu sueño y estrés de esta semana aumentan el riesgo; vigila síntomas"

    desde = None
    if estado != "verde":
        largo = max((r for c, r in rachas.items() if c in inmunes_hoy), default=1)
        desde = hoy - largo + 1
    return EstadoInmune(estado, round(puntaje, 1), motivo, desde)
