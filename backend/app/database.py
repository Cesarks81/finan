"""Conexión a la base de datos SQLite mediante SQLAlchemy."""

import os
from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BACKEND_DIR / 'finance.db'}")

engine = create_engine(
    DATABASE_URL,
    # SQLite solo permite usar una conexión en el hilo que la creó; FastAPI
    # atiende las peticiones en un pool de hilos.
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[Session]:
    """Dependencia de FastAPI: abre una sesión por petición y la cierra al terminar."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
