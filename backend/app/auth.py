"""Acceso con contraseña para la app (mono-usuario).

Con `APP_PASSWORD` definida, las rutas de datos exigen la cabecera
`Authorization: Bearer <token>`. El token se obtiene en `POST /api/auth/login`, caduca a
los 30 días y está firmado con la contraseña, así que cambiarla cierra todas las sesiones.
Sin `APP_PASSWORD` el acceso es libre (desarrollo local), salvo en Vercel, donde todo se
rechaza hasta que se configure.

Cada 3 contraseñas incorrectas seguidas desde una IP, esa IP queda bloqueada 1 minuto; el
siguiente bloqueo dura el doble (2, 4, 8… minutos, como mucho 24 horas). Acertar la
contraseña, o pasar 24 horas sin fallos tras el último bloqueo, vuelve a empezar.
"""

import hashlib
import hmac
import math
import os
import time
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from .models import LoginAttempt

SESSION_DURATION = timedelta(days=30)
FAILURES_PER_LOCKOUT = 3
FIRST_LOCKOUT = timedelta(minutes=1)
MAX_LOCKOUT = timedelta(hours=24)
RESET_AFTER = timedelta(hours=24)


def now_ts() -> float:
    """Hora actual (segundos Unix). Las pruebas la sustituyen para simular el paso del tiempo."""
    return time.time()


def utcnow() -> datetime:
    return datetime.fromtimestamp(now_ts(), UTC).replace(tzinfo=None)


def app_password() -> str | None:
    return os.getenv("APP_PASSWORD") or None


def auth_required() -> bool:
    return app_password() is not None or bool(os.getenv("VERCEL"))


def check_password(candidate: str) -> bool:
    password = app_password()
    return password is not None and hmac.compare_digest(candidate.encode(), password.encode())


# --- Token de sesión: "<caducidad unix>.<firma HMAC de la caducidad>" ----------------


def _signature(password: str, expires: int) -> str:
    return hmac.new(password.encode(), f"finan-session-v2:{expires}".encode(), hashlib.sha256).hexdigest()


def session_token(password: str) -> str:
    expires = int(now_ts() + SESSION_DURATION.total_seconds())
    return f"{expires}.{_signature(password, expires)}"


def token_is_valid(token: str, password: str) -> bool:
    expires_text, _, signature = token.partition(".")
    if not (expires_text.isascii() and expires_text.isdigit()) or int(expires_text) <= now_ts():
        return False
    return hmac.compare_digest(signature.encode(), _signature(password, int(expires_text)).encode())


def bearer_token(authorization: str | None) -> str | None:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    return authorization.removeprefix("Bearer ").strip()


def is_authenticated(authorization: str | None) -> bool:
    if not auth_required():
        return True
    password, token = app_password(), bearer_token(authorization)
    return password is not None and token is not None and token_is_valid(token, password)


def require_auth(authorization: Annotated[str | None, Header()] = None) -> None:
    """Dependencia de FastAPI para las rutas que exigen sesión."""
    if auth_required() and app_password() is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Falta configurar APP_PASSWORD en el servidor")
    if not is_authenticated(authorization):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Inicia sesión para continuar", headers={"WWW-Authenticate": "Bearer"}
        )


# --- Bloqueo por intentos fallidos ---------------------------------------------------


def client_ip(request: Request) -> str:
    if os.getenv("VERCEL"):
        # Vercel sustituye estas cabeceras por la IP real del cliente: no se pueden falsear.
        forwarded = request.headers.get("x-real-ip") or request.headers.get("x-forwarded-for", "")
        ip = forwarded.split(",")[0].strip()
        if ip:
            return ip[:64]
    return request.client.host if request.client else "desconocida"


def _locked_attempt_row(db: Session, ip: str) -> LoginAttempt:
    """Fila de intentos de la IP, bloqueada hasta el commit para contar en orden los intentos simultáneos."""
    insert = postgres_insert if db.get_bind().dialect.name == "postgresql" else sqlite_insert
    db.execute(insert(LoginAttempt).values(ip=ip, failures=0, lockouts=0).on_conflict_do_nothing(index_elements=["ip"]))
    return db.scalars(select(LoginAttempt).where(LoginAttempt.ip == ip).with_for_update()).one()


def _format_wait(seconds: int) -> str:
    hours, rest = divmod(seconds, 3600)
    minutes, secs = divmod(rest, 60)
    parts = [f"{hours} h"] if hours else []
    if minutes:
        parts.append(f"{minutes} min")
    if secs and not hours:
        parts.append(f"{secs} s")
    return " ".join(parts)


def _too_many_attempts(wait: timedelta) -> HTTPException:
    seconds = max(1, math.ceil(wait.total_seconds()))
    return HTTPException(
        status.HTTP_429_TOO_MANY_REQUESTS,
        f"Demasiados intentos fallidos. Vuelve a intentarlo en {_format_wait(seconds)}.",
        headers={"Retry-After": str(seconds)},
    )


def login(db: Session, request: Request, password: str) -> str:
    """Comprueba la contraseña aplicando el bloqueo por IP y devuelve un token de sesión."""
    now = utcnow()
    attempt = _locked_attempt_row(db, client_ip(request))

    if attempt.locked_until and attempt.locked_until > now:
        db.commit()
        raise _too_many_attempts(attempt.locked_until - now)

    if check_password(password):
        db.delete(attempt)
        db.commit()
        return session_token(password)

    quiet_since = max(filter(None, [attempt.last_failure, attempt.locked_until]), default=None)
    if quiet_since and now - quiet_since > RESET_AFTER:
        attempt.failures = attempt.lockouts = 0
    attempt.failures += 1
    attempt.last_failure = now

    if attempt.failures >= FAILURES_PER_LOCKOUT:
        # 1, 2, 4, 8… minutos (el exponente se acota para no desbordar antes de aplicar el máximo).
        wait = min(FIRST_LOCKOUT * 2 ** min(attempt.lockouts, 12), MAX_LOCKOUT)
        attempt.locked_until = now + wait
        attempt.lockouts += 1
        attempt.failures = 0
        db.commit()
        raise _too_many_attempts(wait)

    db.commit()
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Contraseña incorrecta")
