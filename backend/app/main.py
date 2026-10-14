"""API REST de finanzas personales: flujos (GFM, GVM, IFM, IVM) y proyección de patrimonio."""

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import date, timedelta
from decimal import Decimal
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from . import models, schemas
from .database import Base, engine, get_db
from .projection import add_months, build_periods, project

MAX_POINTS = {schemas.Granularity.D: 1100, schemas.Granularity.M: 600, schemas.Granularity.A: 100}

DbSession = Annotated[Session, Depends(get_db)]


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Finan API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["sistema"])
def health(db: DbSession) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "ok"}


# --- Flujos ----------------------------------------------------------------


def get_flow_or_404(db: Session, flow_id: int) -> models.Flow:
    flow = db.get(models.Flow, flow_id)
    if flow is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Flujo {flow_id} no encontrado")
    return flow


@app.post("/flows", response_model=schemas.FlowRead, status_code=status.HTTP_201_CREATED, tags=["flujos"])
def create_flow(payload: schemas.FlowCreate, db: DbSession) -> models.Flow:
    flow = models.Flow(**payload.model_dump())
    db.add(flow)
    db.commit()
    db.refresh(flow)
    return flow


@app.get("/flows", response_model=list[schemas.FlowRead], tags=["flujos"])
def list_flows(
    db: DbSession,
    flow_type: Annotated[list[models.FlowType] | None, Query(description="Filtra por uno o varios tipos")] = None,
) -> list[models.Flow]:
    query = select(models.Flow).order_by(models.Flow.start_date.desc(), models.Flow.id.desc())
    if flow_type:
        query = query.where(models.Flow.flow_type.in_(flow_type))
    return list(db.scalars(query))


@app.get("/flows/{flow_id}", response_model=schemas.FlowRead, tags=["flujos"])
def read_flow(flow_id: int, db: DbSession) -> models.Flow:
    return get_flow_or_404(db, flow_id)


@app.patch("/flows/{flow_id}", response_model=schemas.FlowRead, tags=["flujos"])
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


@app.delete("/flows/{flow_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["flujos"])
def delete_flow(flow_id: int, db: DbSession) -> Response:
    db.delete(get_flow_or_404(db, flow_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Proyección de patrimonio ------------------------------------------------


def default_end(granularity: schemas.Granularity, start: date) -> date:
    if granularity == schemas.Granularity.D:
        return start + timedelta(days=30)
    if granularity == schemas.Granularity.M:
        return add_months(start, 11)
    return date(start.year + 9, 12, 31)


@app.get("/projection", response_model=schemas.ProjectionResponse, tags=["patrimonio"])
def get_projection(
    db: DbSession,
    granularity: schemas.Granularity = schemas.Granularity.M,
    start: Annotated[date | None, Query(description="Por defecto, hoy")] = None,
    end: Annotated[date | None, Query(description="Por defecto: +30 días (D), +12 meses (M), +10 años (A)")] = None,
    initial_balance: Annotated[
        Decimal, Query(max_digits=14, decimal_places=2, description="Patrimonio antes de cualquier flujo registrado")
    ] = Decimal(0),
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

    flows = db.scalars(select(models.Flow)).all()
    return schemas.ProjectionResponse(
        granularity=granularity,
        start=periods[0][1],
        end=periods[-1][2],
        initial_balance=initial_balance,
        points=project(flows, periods, initial_balance),
    )
