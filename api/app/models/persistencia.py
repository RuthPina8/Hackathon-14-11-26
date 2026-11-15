"""Persistencia en PostgreSQL (Back 1).

Por qué así: el motor (línea base, detectores, triage) trabaja en memoria y es rápido y fácil
de probar. Este módulo solo:

1. Crea las tablas si no existen y siembra astronautas y entornos.
2. Al arrancar, vuelve a cargar las mediciones guardadas en el almacén (las líneas base se
   reconstruyen solas al repetirlas en orden), las alertas en el triage y las líneas congeladas.
3. Escribe cada medición nueva en el momento (gancho del almacén) y guarda una foto de
   alertas, cola y líneas base cada pocos segundos.

Sin `DATABASE_URL` nada de esto se activa y la API sigue en memoria, como antes.
"""

import asyncio
import logging
from datetime import timezone

from sqlalchemy import delete, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import Base, get_engine
from app.entornos import perfiles
from app.models.memoria import Medicion, almacen
from app.models.clinico import ParGuardado, clinico
from app.models.tablas import (
    AlertaDB, Astronauta, EntornoDB, FichaDB, LineaBaseDB, MedicionDB, MensajeColaDB, ParValidacionDB,
)
from app.schemas.alerts import Alert
from app.schemas.clinico import FichaMedica
from app.triage import alerts as triage
from app.triage import baseline as congelamiento
from app.triage import queue as cola

log = logging.getLogger("astrohealth.persistencia")

TRIPULACION = [
    (1, "Astronauta 1", "Especialista de misión"),
    (2, "Astronauta 2", "Ingeniería"),
    (3, "Astronauta 3", "Ciencia"),
    (4, "Astronauta 4", "Comandante"),
]
SEGUNDOS_FOTO = 5.0

_engine: Engine | None = None


def activa() -> bool:
    return _engine is not None


def _aware(dt):
    return dt.replace(tzinfo=timezone.utc) if dt is not None and dt.tzinfo is None else dt


def _sesion() -> Session:
    assert _engine is not None
    return Session(_engine, expire_on_commit=False)


# ---------------------------------------------------------------- arranque

def iniciar(engine: Engine | None = None) -> bool:
    """Conecta, crea tablas, siembra y restaura. Regresa False si no hay base configurada."""
    global _engine
    if engine is None:
        if not settings.database_url:
            return False
        try:
            engine = get_engine()
            with engine.connect():
                pass
        except Exception as e:  # la API no se cae si Postgres no está: sigue en memoria
            log.warning("No se pudo conectar a PostgreSQL, sigo en memoria: %s", e)
            return False
    _engine = engine
    Base.metadata.create_all(engine)
    _sembrar()
    _restaurar()
    almacen.al_guardar.append(guardar_medicion)
    almacen.al_reiniciar_demo.append(borrar_simulador)
    clinico.al_guardar_ficha.append(guardar_ficha)
    clinico.al_guardar_par.append(guardar_par)
    clinico.al_borrar_pares.append(borrar_pares)
    congelamiento.registrar_persistor(guardar_congelada)
    log.info("PostgreSQL activo: %d mediciones cargadas", len(almacen.mediciones))
    return True


def detener() -> None:
    """Quita los ganchos (lo usan las pruebas)."""
    global _engine
    if guardar_medicion in almacen.al_guardar:
        almacen.al_guardar.remove(guardar_medicion)
    if borrar_simulador in almacen.al_reiniciar_demo:
        almacen.al_reiniciar_demo.remove(borrar_simulador)
    for lista, fn in ((clinico.al_guardar_ficha, guardar_ficha), (clinico.al_guardar_par, guardar_par),
                      (clinico.al_borrar_pares, borrar_pares)):
        if fn in lista:
            lista.remove(fn)
    congelamiento.registrar_persistor(None)
    _engine = None


def _sembrar() -> None:
    with _sesion() as s:
        for i, nombre, rol in TRIPULACION:
            if s.get(Astronauta, i) is None:
                s.add(Astronauta(id=i, nombre=nombre, rol=rol, entorno=settings.entorno_inicial))
        for pid, perfil in perfiles.cargar_perfiles().items():
            fila = s.get(EntornoDB, pid)
            datos = perfil.model_dump(mode="json")
            if fila is None:
                s.add(EntornoDB(id=pid, perfil=datos))
            else:
                fila.perfil = datos
        s.commit()


def _restaurar() -> None:
    almacen.reset()
    with _sesion() as s:
        filas = s.scalars(select(MedicionDB).order_by(MedicionDB.fecha, MedicionDB.id)).all()
        congeladas = s.scalars(select(LineaBaseDB).where(LineaBaseDB.congelada.is_(True))).all()
        alertas = s.scalars(select(AlertaDB).order_by(AlertaDB.id)).all()
        fichas = s.scalars(select(FichaDB)).all()
        pares = s.scalars(select(ParValidacionDB).order_by(ParValidacionDB.id)).all()
    clinico.reset()
    for f in fichas:
        try:
            clinico.guardar_ficha(FichaMedica.model_validate(f.datos), persistir=False)
        except Exception:
            log.warning("Ficha de %s inválida en la base, se ignora", f.astronauta_id)
    for p in pares:
        clinico.agregar_par(persistir=False, id=p.id, camara=p.camara, referencia=p.referencia, confianza=p.confianza,
                            origen=p.origen, astronauta_id=p.astronauta_id, fuente_referencia=p.fuente_referencia,
                            fecha=_aware(p.fecha))
    # Primero se repiten las mediciones (sin congelar, para que la línea base quede como estaba
    # antes de la alerta) y después se congelan las señales que tenían una alerta abierta.
    for f in filas:
        almacen.guardar(
            _persistir=False, id=f.id, astronauta_id=f.astronauta_id, tipo=f.tipo, valor=f.valor,
            unidad=f.unidad, capa=f.capa, fuente=f.fuente, confianza=f.confianza,
            fecha=_aware(f.fecha), dia_mision=f.dia_mision, detalle=f.detalle or {}, en_linea_base=f.en_linea_base,
        )
    for lb in congeladas:
        congelamiento._congeladas.add((lb.astronauta_id, lb.tipo))
    for a in alertas:
        if not a.datos:
            continue
        datos = dict(a.datos)
        senales = datos.pop("_senales", [a.senal])
        try:
            alerta = Alert.model_validate(datos)
        except Exception:
            continue
        triage.store.alertas[alerta.id] = alerta
        triage.store.senales[alerta.id] = senales
        triage.store._sig = max(triage.store._sig, alerta.id + 1)
    # El reloj de la demo sigue donde se quedó (último día que generó el simulador)
    dias_sim = [m.dia_mision for m in almacen.mediciones if m.fuente == "simulador" and m.dia_mision]
    if dias_sim:
        from app.triage.demo import engine as demo

        demo.dia = max(dias_sim)


# ---------------------------------------------------------------- escritura

def guardar_medicion(m: Medicion) -> None:
    if _engine is None:
        return
    try:
        with _sesion() as s:
            s.add(MedicionDB(
                id=m.id, astronauta_id=m.astronauta_id, tipo=m.tipo, valor=m.valor, unidad=m.unidad,
                capa=m.capa, fuente=m.fuente, confianza=m.confianza, fecha=m.fecha,
                dia_mision=m.dia_mision, detalle=m.detalle, en_linea_base=m.en_linea_base,
            ))
            s.commit()
    except Exception as e:
        log.warning("No se guardó la medición %s en la base: %s", m.id, e)


def guardar_ficha(f: FichaMedica) -> None:
    if _engine is None:
        return
    try:
        with _sesion() as s:
            s.merge(FichaDB(astronauta_id=f.astronauta_id, datos=f.model_dump(mode="json"), actualizada=f.actualizada))
            s.commit()
    except Exception as e:
        log.warning("No se guardó la ficha de %s: %s", f.astronauta_id, e)


def guardar_par(p: ParGuardado) -> None:
    if _engine is None:
        return
    try:
        with _sesion() as s:
            s.add(ParValidacionDB(**p.__dict__))
            s.commit()
    except Exception as e:
        log.warning("No se guardó el par de validación %s: %s", p.id, e)


def borrar_pares(origen: str | None) -> None:
    if _engine is None:
        return
    with _sesion() as s:
        q = delete(ParValidacionDB)
        if origen is not None:
            q = q.where(ParValidacionDB.origen == origen)
        s.execute(q)
        s.commit()


def borrar_simulador() -> None:
    """Reiniciar la demo borra lo simulado y lo derivado; lo real del equipo se queda."""
    if _engine is None:
        return
    with _sesion() as s:
        s.execute(delete(MedicionDB).where(MedicionDB.fuente == "simulador"))
        s.execute(delete(AlertaDB))
        s.execute(delete(MensajeColaDB))
        s.execute(delete(LineaBaseDB))
        s.commit()


def guardar_congelada(astronauta_id: int, tipo: str, congelada: bool) -> None:
    if _engine is None:
        return
    try:
        with _sesion() as s:
            fila = s.get(LineaBaseDB, (astronauta_id, tipo))
            if fila is None:
                fila = LineaBaseDB(astronauta_id=astronauta_id, tipo=tipo)
                s.add(fila)
            fila.congelada = congelada
            s.commit()
    except Exception as e:
        log.warning("No se guardó congelada=%s de %s/%s: %s", congelada, astronauta_id, tipo, e)


def foto() -> None:
    """Escribe el estado actual de líneas base, alertas y cola (upsert por id).

    Corre en otro hilo: por eso recorre copias (list(...)) y no los diccionarios vivos del motor."""
    if _engine is None:
        return
    with _sesion() as s:
        for (astro, tipo), lb in list(almacen.lineas.items()):
            fila = s.get(LineaBaseDB, (astro, tipo)) or LineaBaseDB(astronauta_id=astro, tipo=tipo)
            fila.media = lb.media if lb.n else None
            fila.desviacion = lb.desviacion or None
            fila.n = lb.n
            fila.peso_personal = lb.peso_personal
            fila.congelada = congelamiento.esta_congelada(astro, tipo)
            s.merge(fila)
        for a in list(triage.store.alertas.values()):
            datos = a.model_dump(mode="json")
            datos["_senales"] = triage.store.senales.get(a.id, [a.senal])
            s.merge(AlertaDB(
                id=a.id, astronauta_id=a.astronauta_id, nivel=a.nivel, senal=a.senal,
                que_cambio=a.que_cambio[:400], cuanto=(a.cuanto or None) and a.cuanto[:200], desde=a.desde,
                factores=a.factores, estado=a.estado, dia_mision=a.dia_mision,
                creada=a.creada, actualizada=a.actualizada, datos=datos,
            ))
        for m in list(cola.engine.mensajes.values()):
            s.merge(MensajeColaDB(
                id=m.id, prioridad=m.prioridad, tipo=m.tipo, tamano=m.tamano, payload=m.payload,
                estado=m.estado, enviado=m.enviado, entregado=m.entregado,
            ))
        s.commit()


async def correr_fotos() -> None:
    while True:
        await asyncio.sleep(SEGUNDOS_FOTO)
        if _engine is None:
            continue
        try:
            await asyncio.to_thread(foto)
        except Exception as e:
            log.warning("Foto de la base falló: %s", e)
