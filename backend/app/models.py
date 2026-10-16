"""Modelos SQLAlchemy de los flujos financieros.

Los cuatro tipos de flujo (GFM, GVM, IFM, IVM) comparten una única tabla `flows`
y se distinguen por la columna `flow_type`. El importe se guarda siempre en
positivo: el signo (ingreso o gasto) se deduce del tipo.

Recurrencia según el tipo:
* GFM / IFM: mensual desde `start_date`, indefinida o hasta `end_date`.
* GVM / IVM: puntual en `start_date`, o temporal (mensual) si se indica
  `duration_months` o `end_date` (p. ej. una compra a plazos o el cobro de una deuda).
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

    @property
    def is_fixed(self) -> bool:
        return self in (FlowType.GFM, FlowType.IFM)


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
        if self.flow_type.is_fixed:
            return True
        return self.duration_months is not None or self.end_date is not None

    @property
    def signed_amount(self) -> Decimal:
        return self.amount if self.flow_type.is_income else -self.amount


class Settings(Base):
    """Configuración del usuario. La app es mono-usuario, así que hay una sola fila (id=1).

    `initial_balance` es el patrimonio neto al empezar `balance_date`, antes de los
    movimientos de ese día. Sin fecha, es el patrimonio previo a cualquier flujo.
    `goal_name` y `goal_amount` son el objetivo de patrimonio (p. ej. «Entrada piso», 20.000 €).
    `invest_*` describen la parte invertida del patrimonio: lo invertido en `invest_date`, lo que
    se aporta cada mes (hasta `invest_until`, si lo hay) y la rentabilidad anual esperada (en %). Solo esa parte genera rentabilidad.
    `review_skipped` es el mes ('YYYY-MM') en que se pospuso la revisión mensual («Este mes no»).
    """

    __tablename__ = "settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    initial_balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal(0))
    balance_date: Mapped[date | None] = mapped_column(Date, default=None)
    goal_name: Mapped[str | None] = mapped_column(String(60), default=None)
    goal_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), default=None)
    invest_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), default=None)
    invest_monthly: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), default=None)
    invest_return: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), default=None)
    invest_date: Mapped[date | None] = mapped_column(Date, default=None)
    invest_until: Mapped[date | None] = mapped_column(Date, default=None)
    review_skipped: Mapped[str | None] = mapped_column(String(7), default=None)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class LoginAttempt(Base):
    """Intentos fallidos de acceso por IP, para bloquear temporalmente tras varios fallos.

    Se guarda en la base de datos (y no en memoria) porque en Vercel cada petición puede
    llegar a una instancia distinta de la función.
    """

    __tablename__ = "login_attempts"

    ip: Mapped[str] = mapped_column(String(64), primary_key=True)
    failures: Mapped[int] = mapped_column(Integer, default=0)  # fallos desde el último bloqueo
    lockouts: Mapped[int] = mapped_column(Integer, default=0)  # bloqueos ya aplicados (duplican la espera)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime, default=None)  # UTC
    last_failure: Mapped[datetime | None] = mapped_column(DateTime, default=None)  # UTC
