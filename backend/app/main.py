"""API REST de finanzas personales: flujos (GFM, GVM, IFM, IVM) y proyección de patrimonio.

Todas las rutas cuelgan de `/api`, igual en local que en Vercel (donde `/api/*` llega a
esta app como función Python y el resto lo sirve el frontend estático).
"""

import os
from datetime import date, timedelta
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Query, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError
from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session

from . import auth, models, schemas
from .auth import app_password, auth_required, is_authenticated, require_auth
from .database import get_db
from .projection import add_months, build_periods, project

MAX_POINTS = {schemas.Granularity.D: 1100, schemas.Granularity.M: 600, schemas.Granularity.A: 100}

DbSession = Annotated[Session, Depends(get_db)]


API_PREFIX = "/api"

app = FastAPI(
    title="Finan API",
    version="0.1.0",
    docs_url=f"{API_PREFIX}/docs",
    redoc_url=None,
    openapi_url=f"{API_PREFIX}/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    # 5173: `pnpm dev`; 4173: `pnpm preview` (build de producción con la PWA).
    allow_origins=os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173"
    ).split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


# Rutas abiertas (salud y sesión) y rutas de datos, que exigen sesión si hay contraseña.
public = APIRouter(prefix=API_PREFIX)
private = APIRouter(prefix=API_PREFIX, dependencies=[Depends(require_auth)])


@public.get("/health", tags=["sistema"])
def health(db: DbSession) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "ok"}


# --- Sesión ----------------------------------------------------------------


@public.get("/auth/status", response_model=schemas.AuthStatus, tags=["sesión"])
def auth_status(authorization: Annotated[str | None, Header()] = None) -> schemas.AuthStatus:
    return schemas.AuthStatus(required=auth_required(), authenticated=is_authenticated(authorization))


@public.post("/auth/login", response_model=schemas.LoginResponse, tags=["sesión"])
def login(payload: schemas.LoginRequest, request: Request, db: DbSession) -> schemas.LoginResponse:
    if not auth_required():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Esta instalación no usa contraseña")
    if app_password() is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Falta configurar APP_PASSWORD en el servidor")
    return schemas.LoginResponse(token=auth.login(db, request, payload.password))


# --- Flujos ----------------------------------------------------------------


def get_flow_or_404(db: Session, flow_id: int) -> models.Flow:
    flow = db.get(models.Flow, flow_id)
    if flow is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Flujo {flow_id} no encontrado")
    return flow


@private.post("/flows", response_model=schemas.FlowRead, status_code=status.HTTP_201_CREATED, tags=["flujos"])
def create_flow(payload: schemas.FlowCreate, db: DbSession) -> models.Flow:
    flow = models.Flow(**payload.model_dump())
    db.add(flow)
    db.commit()
    db.refresh(flow)
    return flow


@private.get("/flows", response_model=list[schemas.FlowRead], tags=["flujos"])
def list_flows(
    db: DbSession,
    flow_type: Annotated[list[models.FlowType] | None, Query(description="Filtra por uno o varios tipos")] = None,
) -> list[models.Flow]:
    query = select(models.Flow).order_by(models.Flow.start_date.desc(), models.Flow.id.desc())
    if flow_type:
        query = query.where(models.Flow.flow_type.in_(flow_type))
    return list(db.scalars(query))


@private.get("/flows/{flow_id}", response_model=schemas.FlowRead, tags=["flujos"])
def read_flow(flow_id: int, db: DbSession) -> models.Flow:
    return get_flow_or_404(db, flow_id)


@private.patch("/flows/{flow_id}", response_model=schemas.FlowRead, tags=["flujos"])
def update_flow(flow_id: int, payload: schemas.FlowUpdate, db: DbSession) -> models.Flow:
    flow = get_flow_or_404(db, flow_id)
    current = schemas.FlowCreate.model_validate(flow, from_attributes=True).model_dump()
    try:
        # Se valida el resultado completo para respetar las reglas de cada tipo.
        merged = schemas.FlowCreate.model_validate(current | payload.model_dump(exclude_unset=True))
    except ValidationError as exc:
        raise RequestValidationError(exc.errors(include_url=False)) from exc
    for field, value in merged.model_dump().items():
        setattr(flow, field, value)
    db.commit()
    db.refresh(flow)
    return flow


@private.delete("/flows", response_model=schemas.DeleteFlowsResult, tags=["flujos"])
def delete_flows(
    db: DbSession,
    flow_type: Annotated[
        list[models.FlowType],
        Query(min_length=1, description="Tipos a borrar (obligatorio: nunca se borra todo sin indicarlo)"),
    ],
) -> schemas.DeleteFlowsResult:
    """Borra de golpe todos los flujos de los tipos indicados (Ajustes → Restablecer datos)."""
    result = db.execute(delete(models.Flow).where(models.Flow.flow_type.in_(flow_type)))
    db.commit()
    return schemas.DeleteFlowsResult(deleted=result.rowcount)


@private.delete("/flows/{flow_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["flujos"])
def delete_flow(flow_id: int, db: DbSession) -> Response:
    db.delete(get_flow_or_404(db, flow_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Ajustes (patrimonio inicial) --------------------------------------------

SETTINGS_ID = 1


def load_settings(db: Session) -> models.Settings:
    """Ajustes guardados o, si aún no existen, los valores por defecto (sin persistir)."""
    return db.get(models.Settings, SETTINGS_ID) or models.Settings(
        id=SETTINGS_ID,
        initial_balance=Decimal(0),
        balance_date=None,
        goal_name=None,
        goal_amount=None,
        review_skipped=None,
    )


@private.get("/settings", response_model=schemas.SettingsRead, tags=["ajustes"])
def read_settings(db: DbSession) -> models.Settings:
    return load_settings(db)


@private.put("/settings", response_model=schemas.SettingsRead, tags=["ajustes"])
def update_settings(payload: schemas.SettingsUpdate, db: DbSession) -> models.Settings:
    """Patrimonio inicial y su fecha (el resto de ajustes se conserva).

    Las inversiones con capital (lo invertido, `amount` > 0) salen del patrimonio inicial, así que
    cambiarlo una vez fijado las elimina, en la misma transacción. Hay que confirmarlo con
    `remove_investments`; sin él, 409 y no cambia nada. Las que solo reciben aportaciones se quedan.
    """
    settings = db.merge(load_settings(db))
    changed = settings.balance_date is not None and (
        settings.initial_balance != payload.initial_balance or settings.balance_date != payload.balance_date
    )
    if changed:
        funded = db.scalars(select(models.Investment).where(models.Investment.amount > 0)).all()
        if funded and not payload.remove_investments:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Cambiar el patrimonio inicial elimina las inversiones que salen de él: confírmalo",
            )
        for investment in funded:
            db.delete(investment)
    settings.initial_balance = payload.initial_balance
    settings.balance_date = payload.balance_date
    db.commit()
    db.refresh(settings)
    return settings


@private.patch("/settings", response_model=schemas.SettingsRead, tags=["ajustes"])
def patch_settings(payload: schemas.SettingsPatch, db: DbSession) -> models.Settings:
    """Cambia solo los ajustes enviados (p. ej. el objetivo o la inversión)."""
    settings = db.merge(load_settings(db))
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(settings, field, value)
    db.commit()
    db.refresh(settings)
    return settings


# --- Inversiones ------------------------------------------------------------------


def get_investment_or_404(db: Session, investment_id: int) -> models.Investment:
    investment = db.get(models.Investment, investment_id)
    if investment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Inversión {investment_id} no encontrada")
    return investment


@private.get("/investments", response_model=list[schemas.InvestmentRead], tags=["inversiones"])
def list_investments(db: DbSession) -> list[models.Investment]:
    return list(db.scalars(select(models.Investment).order_by(models.Investment.id)))


@private.post(
    "/investments", response_model=schemas.InvestmentRead, status_code=status.HTTP_201_CREATED, tags=["inversiones"]
)
def create_investment(payload: schemas.InvestmentBase, db: DbSession) -> models.Investment:
    investment = models.Investment(**payload.model_dump())
    db.add(investment)
    db.commit()
    db.refresh(investment)
    return investment


@private.put("/investments/{investment_id}", response_model=schemas.InvestmentRead, tags=["inversiones"])
def update_investment(investment_id: int, payload: schemas.InvestmentBase, db: DbSession) -> models.Investment:
    """Sustituye la inversión (lo invertido pasa a contar desde `start_date`, normalmente hoy)."""
    investment = get_investment_or_404(db, investment_id)
    for field, value in payload.model_dump().items():
        setattr(investment, field, value)
    db.commit()
    db.refresh(investment)
    return investment


@private.delete("/investments/{investment_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["inversiones"])
def delete_investment(investment_id: int, db: DbSession) -> Response:
    db.delete(get_investment_or_404(db, investment_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Revisiones mensuales -------------------------------------------------------


@private.get("/reviews", response_model=list[schemas.ReviewRead], tags=["revisiones"])
def list_reviews(db: DbSession) -> list[models.Review]:
    """Historial de revisiones, de la más reciente a la más antigua."""
    return list(db.scalars(select(models.Review).order_by(models.Review.review_date.desc())))


@private.post("/reviews", response_model=schemas.ReviewRead, status_code=status.HTTP_201_CREATED, tags=["revisiones"])
def create_review(payload: schemas.ReviewCreate, db: DbSession) -> models.Review:
    """Guarda la revisión y ancla el patrimonio inicial ese día, de una vez.

    Si ya había una revisión ese día, se sustituye (conservando el ajuste anterior a ella).
    """
    settings = db.merge(load_settings(db))
    review = db.scalar(select(models.Review).where(models.Review.review_date == payload.review_date))
    if review is None:
        previous = settings.balance_date
        review = models.Review(
            review_date=payload.review_date,
            previous_date=previous if previous is not None and previous < payload.review_date else None,
        )
        db.add(review)
    review.forecast = payload.forecast
    review.actual = payload.actual
    settings.initial_balance = payload.anchor
    settings.balance_date = payload.review_date
    db.commit()
    db.refresh(review)
    return review


@private.delete("/reviews/{review_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["revisiones"])
def delete_review(review_id: int, db: DbSession) -> Response:
    """Borra una revisión del historial (el patrimonio inicial no cambia)."""
    review = db.get(models.Review, review_id)
    if review is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Revisión {review_id} no encontrada")
    db.delete(review)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Copia de seguridad --------------------------------------------------------


@private.get("/backup", response_model=schemas.Backup, tags=["copia de seguridad"])
def export_backup(db: DbSession) -> schemas.Backup:
    """Todos los datos (ajustes, flujos, inversiones y revisiones) para guardarlos en un archivo."""
    flows = db.scalars(select(models.Flow).order_by(models.Flow.id))
    investments = db.scalars(select(models.Investment).order_by(models.Investment.id))
    reviews = db.scalars(select(models.Review).order_by(models.Review.review_date))
    return schemas.Backup(
        exported_on=date.today(),
        settings=schemas.BackupSettings.model_validate(load_settings(db), from_attributes=True),
        flows=[schemas.FlowCreate.model_validate(flow, from_attributes=True) for flow in flows],
        investments=[schemas.InvestmentBase.model_validate(item, from_attributes=True) for item in investments],
        reviews=[schemas.ReviewBase.model_validate(review, from_attributes=True) for review in reviews],
    )


@private.put("/backup", response_model=schemas.BackupResult, tags=["copia de seguridad"])
def import_backup(payload: schemas.Backup, db: DbSession) -> schemas.BackupResult:
    """Sustituye todos los datos por los de la copia, de una vez: si algo falla, no cambia nada."""
    db.execute(delete(models.Flow))
    db.execute(delete(models.Investment))
    db.execute(delete(models.Review))
    db.add_all(models.Flow(**flow.model_dump()) for flow in payload.flows)
    db.add_all(models.Investment(**item.model_dump()) for item in payload.investments)
    db.add_all(models.Review(**review.model_dump()) for review in payload.reviews)
    settings = db.merge(load_settings(db))
    for field, value in payload.settings.model_dump().items():
        setattr(settings, field, value)
    db.commit()
    return schemas.BackupResult(
        flows=len(payload.flows), investments=len(payload.investments), reviews=len(payload.reviews)
    )


# --- Proyección de patrimonio ------------------------------------------------


def default_end(granularity: schemas.Granularity, start: date) -> date:
    if granularity == schemas.Granularity.D:
        return start + timedelta(days=30)
    if granularity == schemas.Granularity.M:
        return add_months(start, 11)
    return date(start.year + 9, 12, 31)


@private.get("/projection", response_model=schemas.ProjectionResponse, tags=["patrimonio"])
def get_projection(
    db: DbSession,
    granularity: schemas.Granularity = schemas.Granularity.M,
    start: Annotated[date | None, Query(description="Por defecto, hoy")] = None,
    end: Annotated[date | None, Query(description="Por defecto: +30 días (D), +12 meses (M), +10 años (A)")] = None,
    initial_balance: Annotated[
        Decimal | None,
        Query(max_digits=14, decimal_places=2, description="Sustituye al patrimonio inicial guardado en /settings"),
    ] = None,
    balance_date: Annotated[
        date | None,
        Query(description="Fecha de initial_balance (solo junto a él). Sin ella, es el saldo previo a todo flujo"),
    ] = None,
) -> schemas.ProjectionResponse:
    start = start or date.today()
    end = end or default_end(granularity, start)
    if end < start:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "end no puede ser anterior a start")

    periods = build_periods(granularity, start, end)
    if len(periods) > MAX_POINTS[granularity]:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            f"Rango demasiado amplio: máximo {MAX_POINTS[granularity]} puntos para la vista {granularity.value}",
        )

    if initial_balance is None:
        settings = load_settings(db)
        initial_balance, balance_date = settings.initial_balance, settings.balance_date

    flows = db.scalars(select(models.Flow)).all()
    return schemas.ProjectionResponse(
        granularity=granularity,
        start=periods[0][1],
        end=periods[-1][2],
        initial_balance=initial_balance,
        balance_date=balance_date,
        points=project(flows, periods, initial_balance, balance_date),
    )


app.include_router(public)
app.include_router(private)
