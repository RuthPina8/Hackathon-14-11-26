"""Tablas de PostgreSQL (SQLAlchemy 2). Modelo de datos de api/CLAUDE.md.

El motor no lee de aquí en cada petición: trabaja con el almacén en memoria y
`persistencia.py` lo mantiene sincronizado con estas tablas.
"""

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Index, Integer, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

# JSONB en PostgreSQL, JSON en SQLite (las pruebas corren con SQLite)
Json = JSON().with_variant(JSONB(), "postgresql")


class Astronauta(Base):
    __tablename__ = "astronauts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    nombre: Mapped[str] = mapped_column(String(80))
    rol: Mapped[str] = mapped_column(String(40), default="")
    entorno: Mapped[str] = mapped_column(String(20), default="nave")
    fase_linea_base: Mapped[str] = mapped_column(String(20), default="tierra")
    dia_inicio_mision: Mapped[int] = mapped_column(Integer, default=1)


class MedicionDB(Base):
    __tablename__ = "measurements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    astronauta_id: Mapped[int] = mapped_column(ForeignKey("astronauts.id"), index=True)
    tipo: Mapped[str] = mapped_column(String(40))
    valor: Mapped[float] = mapped_column(Float)
    unidad: Mapped[str] = mapped_column(String(20), default="")
    capa: Mapped[str] = mapped_column(String(10))
    fuente: Mapped[str] = mapped_column(String(20))
    confianza: Mapped[float] = mapped_column(Float, default=1.0)
    fecha: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    dia_mision: Mapped[int | None] = mapped_column(Integer, nullable=True)
    detalle: Mapped[dict] = mapped_column(Json, default=dict)
    en_linea_base: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    __table_args__ = (
        Index("ix_measurements_astro_tipo_fecha", "astronauta_id", "tipo", "fecha"),
        # La ingesta del Apple Watch no duplica (docs/motor.md §7)
        Index(
            "ux_measurements_apple_watch", "astronauta_id", "tipo", "fecha", unique=True,
            postgresql_where=text("fuente = 'apple_watch'"), sqlite_where=text("fuente = 'apple_watch'"),
        ),
    )


class LineaBaseDB(Base):
    __tablename__ = "baselines"

    astronauta_id: Mapped[int] = mapped_column(ForeignKey("astronauts.id"), primary_key=True)
    tipo: Mapped[str] = mapped_column(String(40), primary_key=True)
    media: Mapped[float | None] = mapped_column(Float, nullable=True)
    desviacion: Mapped[float | None] = mapped_column(Float, nullable=True)
    n: Mapped[int] = mapped_column(Integer, default=0)
    peso_personal: Mapped[float] = mapped_column(Float, default=0.0)
    congelada: Mapped[bool] = mapped_column(Boolean, default=False)


class AlertaDB(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    astronauta_id: Mapped[int] = mapped_column(ForeignKey("astronauts.id"), index=True)
    nivel: Mapped[str] = mapped_column(String(10))
    senal: Mapped[str] = mapped_column(String(40))
    que_cambio: Mapped[str] = mapped_column(String(400))
    cuanto: Mapped[str | None] = mapped_column(String(200), nullable=True)
    desde: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    factores: Mapped[dict] = mapped_column(Json, default=dict)
    estado: Mapped[str] = mapped_column(String(12))
    dia_mision: Mapped[int | None] = mapped_column(Integer, nullable=True)
    creada: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    actualizada: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # La alerta completa del triage y todas sus señales, para restaurarla al reiniciar la API
    datos: Mapped[dict] = mapped_column(Json, default=dict)


class MensajeColaDB(Base):
    __tablename__ = "queue_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    prioridad: Mapped[int] = mapped_column(Integer)
    tipo: Mapped[str] = mapped_column(String(20))
    tamano: Mapped[float] = mapped_column(Float)
    payload: Mapped[dict] = mapped_column(Json, default=dict)
    estado: Mapped[str] = mapped_column(String(14))
    enviado: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    entregado: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class EntornoDB(Base):
    __tablename__ = "environments"

    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    perfil: Mapped[dict] = mapped_column(Json, default=dict)


class FichaDB(Base):
    """Ficha médica pre-misión (schemas/clinico.py FichaMedica completa en JSON)."""

    __tablename__ = "medical_records"

    astronauta_id: Mapped[int] = mapped_column(ForeignKey("astronauts.id"), primary_key=True)
    datos: Mapped[dict] = mapped_column(Json, default=dict)
    actualizada: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ParValidacionDB(Base):
    """Lectura de cámara contra aparato de referencia (o par de una base pública)."""

    __tablename__ = "validation_pairs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    camara: Mapped[float] = mapped_column(Float)
    referencia: Mapped[float] = mapped_column(Float)
    confianza: Mapped[float] = mapped_column(Float)
    origen: Mapped[str] = mapped_column(String(40), index=True)
    astronauta_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fuente_referencia: Mapped[str | None] = mapped_column(String(20), nullable=True)
    fecha: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
