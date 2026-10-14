"""Acceso con contraseña para la app (mono-usuario).

Con `APP_PASSWORD` definida, las rutas de datos exigen la cabecera
`Authorization: Bearer <token>`. El token se obtiene en `POST /api/auth/login` y es una
firma HMAC derivada de la contraseña, así que cambiarla cierra todas las sesiones.
Sin `APP_PASSWORD` el acceso es libre (desarrollo local), salvo en Vercel, donde todo se
rechaza hasta que se configure.
"""

import hashlib
import hmac
import os
from typing import Annotated

from fastapi import Header, HTTPException, status

TOKEN_MESSAGE = b"finan-session-v1"


def app_password() -> str | None:
    return os.getenv("APP_PASSWORD") or None


def auth_required() -> bool:
    return app_password() is not None or bool(os.getenv("VERCEL"))


def session_token(password: str) -> str:
    return hmac.new(password.encode(), TOKEN_MESSAGE, hashlib.sha256).hexdigest()


def check_password(candidate: str) -> bool:
    password = app_password()
    return password is not None and hmac.compare_digest(candidate.encode(), password.encode())


def bearer_token(authorization: str | None) -> str | None:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    return authorization.removeprefix("Bearer ").strip()


def is_authenticated(authorization: str | None) -> bool:
    if not auth_required():
        return True
    password, token = app_password(), bearer_token(authorization)
    return password is not None and token is not None and hmac.compare_digest(
        token.encode(), session_token(password).encode()
    )


def require_auth(authorization: Annotated[str | None, Header()] = None) -> None:
    """Dependencia de FastAPI para las rutas que exigen sesión."""
    if auth_required() and app_password() is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Falta configurar APP_PASSWORD en el servidor")
    if not is_authenticated(authorization):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Inicia sesión para continuar", headers={"WWW-Authenticate": "Bearer"}
        )
