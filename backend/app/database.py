"""Conexión a la base de datos mediante SQLAlchemy.

En local usa SQLite (`backend/finance.db`). En producción usa el Postgres de `DATABASE_URL`
(la integración de Neon en Vercel la define automáticamente).
"""

import os
import threading
from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
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


def add_missing_columns() -> None:
    """Añade a las tablas que ya existen las columnas nuevas de los modelos.

    `create_all` crea las tablas que faltan pero no toca las existentes, así que una columna
    añadida a un modelo (p. ej. `settings.goal_amount`) no llegaría a una base con datos,
    como la de Neon. Solo sirve para columnas que admiten NULL y sin valor por defecto en la
    base; cambios mayores necesitarían una migración de verdad (Alembic).
    """
    inspector = inspect(engine)
    for table in Base.metadata.sorted_tables:
        if not inspector.has_table(table.name):
            continue
        existing = {column["name"] for column in inspector.get_columns(table.name)}
        for column in table.columns:
            if column.name in existing:
                continue
            column_type = column.type.compile(dialect=engine.dialect)
            # En Postgres, IF NOT EXISTS evita el error si otra instancia de Vercel la añade a la vez.
            if_not_exists = "" if IS_SQLITE else "IF NOT EXISTS "
            with engine.begin() as connection:
                connection.execute(
                    text(f'ALTER TABLE "{table.name}" ADD COLUMN {if_not_exists}"{column.name}" {column_type}')
                )


def ensure_schema() -> None:
    """Crea las tablas y columnas que falten la primera vez que se usa la base de datos.

    Se hace en la primera petición, y no al arrancar, para que funcione igual en un servidor
    normal y en las funciones serverless de Vercel. Después se pasan los datos que hayan cambiado
    de sitio (`migrations.py`).
    """
    global _schema_ready
    if _schema_ready:
        return
    with _schema_lock:
        if not _schema_ready:
            from . import migrations  # importa los modelos, que a su vez importan este módulo

            Base.metadata.create_all(bind=engine)
            add_missing_columns()
            with SessionLocal() as db:
                migrations.run(db)
            _schema_ready = True


def get_db() -> Iterator[Session]:
    """Dependencia de FastAPI: abre una sesión por petición y la cierra al terminar."""
    ensure_schema()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
