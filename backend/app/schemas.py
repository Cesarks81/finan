"""Esquemas Pydantic de entrada y salida de la API."""

import enum
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

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


class SettingsPatch(BaseModel):
    """Cambio parcial de los ajustes: solo se modifican los campos enviados (null borra)."""

    goal_name: Annotated[str, Field(min_length=1, max_length=60)] | None = Field(
        default=None, description="Nombre del objetivo de patrimonio"
    )
    goal_amount: Annotated[Decimal, Field(gt=0, max_digits=14, decimal_places=2)] | None = Field(
        default=None, description="Patrimonio que se quiere alcanzar"
    )
    invest_amount: Annotated[Decimal, Field(ge=0, max_digits=14, decimal_places=2)] | None = Field(
        default=None, description="Lo que hay invertido en invest_date"
    )
    invest_monthly: Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)] | None = Field(
        default=None, description="Lo que se aporta a la inversión cada mes (sale de lo ahorrado)"
    )
    invest_return: Annotated[Decimal, Field(ge=-50, le=50, max_digits=5, decimal_places=2)] | None = Field(
        default=None, description="Rentabilidad anual esperada, en %"
    )
    invest_date: date | None = Field(default=None, description="Fecha de invest_amount")
    invest_until: date | None = Field(default=None, description="Último mes con aportación (sin ella, sin fin)")
    review_skipped: Annotated[str, Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")] | None = Field(
        default=None, description="Mes (YYYY-MM) en que se pospuso la revisión mensual"
    )


class SettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    initial_balance: Decimal
    balance_date: date | None
    goal_name: str | None = None
    goal_amount: Decimal | None = None
    invest_amount: Decimal | None = None
    invest_monthly: Decimal | None = None
    invest_return: Decimal | None = None
    invest_date: date | None = None
    invest_until: date | None = None
    review_skipped: str | None = None


class ReviewBase(BaseModel):
    review_date: date = Field(description="Día de la revisión")
    forecast: Balance = Field(description="Patrimonio que preveía finan ese día")
    actual: Balance = Field(description="Saldo real de las cuentas ese día")
    previous_date: date | None = Field(default=None, description="Fecha del ajuste anterior (para la fuga por día)")

    @model_validator(mode="after")
    def check_previous(self) -> "ReviewBase":
        if self.previous_date is not None and self.previous_date >= self.review_date:
            raise ValueError("previous_date debe ser anterior a review_date")
        return self


class ReviewCreate(BaseModel):
    """«Ajustar al saldo real»: guarda la revisión y ancla el patrimonio inicial ese día."""

    review_date: date = Field(default_factory=date.today, description="Día de la revisión. Por defecto, hoy")
    forecast: Balance = Field(description="Patrimonio que preveía finan")
    actual: Balance = Field(description="Saldo real de las cuentas")
    anchor: Balance = Field(description="Patrimonio inicial que se guarda: el real sin los flujos de ese día")


class ReviewRead(ReviewBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class BackupSettings(SettingsPatch):
    """Ajustes guardados en una copia de seguridad: todos, con las mismas reglas que al editarlos."""

    initial_balance: Balance = Decimal(0)
    balance_date: date | None = None


class Backup(BaseModel):
    """Copia de seguridad completa: los ajustes guardados, todos los flujos y las revisiones.

    Las preferencias de cada dispositivo (modo oscuro, opciones de la gráfica) no van en ella.
    """

    app: Literal["finan"] = "finan"
    version: Literal[1] = 1
    exported_on: date | None = Field(default=None, description="Día en que se hizo la copia")
    settings: BackupSettings
    flows: list[FlowCreate] = Field(max_length=10_000)
    reviews: list[ReviewBase] = Field(default=[], max_length=10_000)

    @model_validator(mode="after")
    def check_reviews(self) -> "Backup":
        if len({review.review_date for review in self.reviews}) != len(self.reviews):
            raise ValueError("Hay dos revisiones del mismo día")
        return self


class BackupResult(BaseModel):
    flows: int = Field(description="Número de flujos importados")
    reviews: int = Field(description="Número de revisiones importadas")


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
