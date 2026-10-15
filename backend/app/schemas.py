"""Esquemas Pydantic de entrada y salida de la API."""

import enum
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .models import FlowType

Amount = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2)]
Balance = Annotated[Decimal, Field(max_digits=14, decimal_places=2)]


class FlowBase(BaseModel):
    flow_type: FlowType
    concept: str = Field(min_length=1, max_length=120)
    amount: Amount = Field(description="Importe en euros, siempre positivo")
    start_date: date = Field(description="Fecha del movimiento o de su primera ocurrencia")
    end_date: date | None = Field(default=None, description="Última fecha (inclusive) de un flujo mensual")
    duration_months: int | None = Field(default=None, ge=1, le=600, description="Solo GVM / IVM temporal")

    @model_validator(mode="after")
    def check_type_rules(self) -> "FlowBase":
        if self.end_date is not None and self.end_date < self.start_date:
            raise ValueError("end_date no puede ser anterior a start_date")
        if self.flow_type.is_fixed and self.duration_months:
            raise ValueError("Los flujos fijos usan end_date (opcional), no duration_months")
        if self.end_date and self.duration_months:
            raise ValueError("Un flujo variable temporal admite end_date o duration_months, no ambos")
        return self


class FlowCreate(FlowBase):
    pass


class FlowUpdate(BaseModel):
    """Actualización parcial: solo se modifican los campos enviados."""

    flow_type: FlowType | None = None
    concept: str | None = Field(default=None, min_length=1, max_length=120)
    amount: Amount | None = None
    start_date: date | None = None
    end_date: date | None = None
    duration_months: int | None = Field(default=None, ge=1, le=600)


class FlowRead(FlowBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    is_recurring: bool
    created_at: datetime


class SettingsUpdate(BaseModel):
    initial_balance: Balance = Field(description="Patrimonio neto al empezar balance_date; puede ser negativo")
    balance_date: date = Field(default_factory=date.today, description="Fecha de ese patrimonio. Por defecto, hoy")


class SettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    initial_balance: Decimal
    balance_date: date | None


class Granularity(str, enum.Enum):
    D = "D"  # Días
    M = "M"  # Meses
    A = "A"  # Años


class ProjectionPoint(BaseModel):
    period: str = Field(description="Etiqueta del periodo: YYYY-MM-DD, YYYY-MM o YYYY")
    period_start: date
    period_end: date
    income: Decimal
    expense: Decimal
    balance: Decimal = Field(description="Patrimonio al cierre del periodo")


class ProjectionResponse(BaseModel):
    granularity: Granularity
    start: date
    end: date
    initial_balance: Decimal
    balance_date: date | None
    points: list[ProjectionPoint]


class LoginRequest(BaseModel):
    password: str = Field(min_length=1, max_length=200)


class DeleteFlowsResult(BaseModel):
    deleted: int = Field(description="Número de flujos eliminados")


class LoginResponse(BaseModel):
    token: str


class AuthStatus(BaseModel):
    required: bool = Field(description="Si la app pide contraseña")
    authenticated: bool = Field(description="Si la petición lleva una sesión válida (o no hace falta)")
