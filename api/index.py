"""Punto de entrada en Vercel: expone la app FastAPI de `backend/` como función Python.

`vercel.json` envía aquí todas las peticiones a `/api/*`; la app conserva la ruta original.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.main import app  # noqa: E402, F401
