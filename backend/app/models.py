"""Modelos SQLAlchemy de los flujos financieros.

Los cuatro tipos de flujo (GFM, GVM, IFM, IVM) comparten una única tabla `flows`
y se distinguen por la columna `flow_type`. El importe se guarda siempre en
positivo: el signo (ingreso o gasto) se deduce del tipo.

Recurrencia según el tipo:
* GFM / IFM: mensual desde `start_date`, indefinida o hasta `end_date`.
* GVM: puntual, ocurre una sola vez en `start_date`.
* IVM: puntual en `start_date`, o temporal (mensual) si se indica
  `duration_months` o `end_date`.
"""

import enum
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, Enum, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class FlowType(str, enum.Enum):
    GFM = "GFM"  # Gasto Fijo Mensual
    GVM = "GVM"  # Gasto Variable Mensual
    IFM = "IFM"  # Ingreso Fijo Mensual
    IVM = "IVM"  # Ingreso Variable Mensual / Temporal

    @property
    def is_income(self) -> bool:
        return self in (FlowType.IFM, FlowType.IVM)


class Flow(Base):
    __tablename__ = "flows"

    id: Mapped[int] = mapped_column(primary_key=True)
    flow_type: Mapped[FlowType] = mapped_column(Enum(FlowType, native_enum=False), index=True)
    concept: Mapped[str] = mapped_column(String(120))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date, default=None)
    duration_months: Mapped[int | None] = mapped_column(Integer, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    @property
    def is_recurring(self) -> bool:
        if self.flow_type in (FlowType.GFM, FlowType.IFM):
            return True
        if self.flow_type == FlowType.IVM:
            return self.duration_months is not None or self.end_date is not None
        return False

    @property
    def signed_amount(self) -> Decimal:
        return self.amount if self.flow_type.is_income else -self.amount
