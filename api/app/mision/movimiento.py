"""Sesiones de ASTRA-MOVE y su comparación contra la línea base personal.

Referencia = promedio de repeticiones de las sesiones anteriores del mismo ejercicio con buena
calidad. Se necesitan al menos MIN_REFERENCIA sesiones; antes de eso no se compara.
"""

from datetime import datetime, timedelta, timezone

from app.schemas.movement import Comparacion, Sesion, SesionIn

MIN_REFERENCIA = 2
CALIDAD_MINIMA = 0.6  # con menos, la sesión se guarda pero no cuenta ni se compara
CAMBIO_BAJO_PCT = -20.0  # 20% menos repeticiones que tu normal = cambio funcional


def comparar(nueva: SesionIn, previas: list[Sesion]) -> Comparacion:
    if nueva.calidad < CALIDAD_MINIMA:
        return Comparacion(
            estado="baja_calidad",
            texto=f"Detección del cuerpo del {nueva.calidad:.0%}: la sesión no es confiable para comparar. Repite con el cuerpo completo a cuadro y buena luz",
        )
    ref = [s.repeticiones for s in previas if s.ejercicio == nueva.ejercicio and s.calidad >= CALIDAD_MINIMA and not s.practica]
    if len(ref) < MIN_REFERENCIA:
        faltan = MIN_REFERENCIA - len(ref)
        return Comparacion(
            estado="sin_referencia", n_referencia=len(ref),
            texto=f"Aprendiendo tu normal: falta{'n' if faltan > 1 else ''} {faltan} sesión{'es' if faltan > 1 else ''} para comparar",
        )
    media = sum(ref) / len(ref)
    cambio = 100 * (nueva.repeticiones - media) / media if media else 0.0
    bajo = cambio <= CAMBIO_BAJO_PCT
    return Comparacion(
        estado="bajo" if bajo else "estable",
        referencia_reps=round(media, 1), n_referencia=len(ref), cambio_pct=round(cambio, 1),
        texto=(f"{nueva.repeticiones} repeticiones, {abs(cambio):.0f}% {'menos' if cambio < 0 else 'más'} que tu normal ({media:.1f})"
               if abs(cambio) >= 1 else f"{nueva.repeticiones} repeticiones, igual que tu normal"),
    )


class Movimiento:
    def __init__(self) -> None:
        self.sesiones: list[Sesion] = []
        self._sig = 1

    def reset(self) -> None:
        self.__init__()

    def registrar(self, s: SesionIn, fecha: datetime | None = None) -> Sesion:
        previas = [x for x in self.sesiones if x.astronauta_id == s.astronauta_id]
        sesion = Sesion(
            **s.model_dump(), id=self._sig, fecha=fecha or datetime.now(timezone.utc),
            capa="real" if s.fuente == "webcam" else "sim", dato_demo=s.fuente == "demo",
            comparacion=comparar(s, previas),
        )
        self._sig += 1
        self.sesiones.append(sesion)
        return sesion

    def historial(self, astronauta_id: int, ejercicio: str | None = None) -> list[Sesion]:
        out = [s for s in self.sesiones if s.astronauta_id == astronauta_id]
        if ejercicio:
            out = [s for s in out if s.ejercicio == ejercicio]
        return sorted(out, key=lambda s: s.fecha, reverse=True)

    def ultima(self, astronauta_id: int) -> Sesion | None:
        h = self.historial(astronauta_id)
        return h[0] if h else None

    def cargar_demo(self, tipo: str, astronauta_id: int, ejercicio: str) -> list[Sesion]:
        """Plan B del documento: sesiones preparadas, marcadas como dato de demo."""
        ahora = datetime.now(timezone.utc)
        base = {"astronauta_id": astronauta_id, "ejercicio": ejercicio, "fuente": "demo"}
        if tipo == "linea_base":
            reps = [12, 11, 12] if ejercicio == "brazos" else [10, 10, 11]
            return [
                self.registrar(SesionIn(**base, repeticiones=r, duracion_s=45, rango_grados=150 if ejercicio == "brazos" else 85,
                                        regularidad=0.9, simetria=0.92 if ejercicio == "brazos" else None, calidad=0.9),
                               fecha=ahora - timedelta(days=3 - i))
                for i, r in enumerate(reps)
            ]
        r = 8 if ejercicio == "brazos" else 7
        return [self.registrar(SesionIn(**base, repeticiones=r, duracion_s=45, rango_grados=120 if ejercicio == "brazos" else 70,
                                        regularidad=0.72, simetria=0.81 if ejercicio == "brazos" else None, calidad=0.88))]


movimiento = Movimiento()
