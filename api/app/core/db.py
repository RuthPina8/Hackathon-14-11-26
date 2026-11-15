"""Conexión a PostgreSQL con SQLAlchemy 2.

Back 1 declara sus modelos heredando de `Base` (app/models/). El motor se crea
solo cuando alguien lo pide, así la API arranca aunque Postgres no esté corriendo.
"""

from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    pass


@lru_cache
def get_engine() -> Engine:
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL no está definido en api/.env")
    return create_engine(settings.database_url, pool_pre_ping=True)


@lru_cache
def _session_factory() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """Dependencia de FastAPI: `db: Session = Depends(get_db)`."""
    db = _session_factory()()
    try:
        yield db
    finally:
        db.close()
