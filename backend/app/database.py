"""Conexión a la base de datos mediante SQLAlchemy.

En local usa SQLite (`backend/finance.db`). En producción usa el Postgres de `DATABASE_URL`
(la integración de Neon en Vercel la define automáticamente).
"""

import os
import threading
from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

BACKEND_DIR = Path(__file__).resolve().parent.parent


def database_url() -> str:
    url = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL")
    if not url:
        if os.getenv("VERCEL"):
            # El disco de Vercel no se conserva entre ejecuciones: un SQLite ahí perdería los datos.
            raise RuntimeError("Falta DATABASE_URL: conecta una base de datos Postgres (Neon) al proyecto de Vercel")
        return f"sqlite:///{BACKEND_DIR / 'finance.db'}"
    # Neon da URLs `postgres://` o `postgresql://`; SQLAlchemy necesita el driver explícito.
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url.removeprefix(prefix)
    return url


DATABASE_URL = database_url()
IS_SQLITE = DATABASE_URL.startswith("sqlite")

engine = create_engine(
    DATABASE_URL,
    # SQLite solo permite usar una conexión en el hilo que la creó, y FastAPI atiende las
    # peticiones en un pool de hilos. En Postgres se comprueba cada conexión antes de usarla
    # porque Neon cierra las inactivas cuando suspende la base de datos.
    **({"connect_args": {"check_same_thread": False}} if IS_SQLITE else {"pool_pre_ping": True}),
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


_schema_lock = threading.Lock()
_schema_ready = False


def ensure_schema() -> None:
    """Crea las tablas que falten la primera vez que se usa la base de datos.

    Se hace en la primera petición, y no al arrancar, para que funcione igual en un servidor
    normal y en las funciones serverless de Vercel.
    """
    global _schema_ready
    if _schema_ready:
        return
    with _schema_lock:
        if not _schema_ready:
            Base.metadata.create_all(bind=engine)
            _schema_ready = True


def get_db() -> Iterator[Session]:
    """Dependencia de FastAPI: abre una sesión por petición y la cierra al terminar."""
    ensure_schema()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
