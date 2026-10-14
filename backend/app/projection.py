"""Motor de cálculo del patrimonio proyectado.

El patrimonio inicial es el que había al empezar `balance_date`, antes de los movimientos
de ese día. Los movimientos de esa fecha en adelante se suman o restan a partir de él y
los anteriores reconstruyen la curva hacia atrás. Sin `balance_date`, el patrimonio
inicial es el previo a cualquier flujo. Los ingresos suman y los gastos restan.
"""

import calendar
from collections.abc import Iterable, Iterator
from datetime import date, timedelta
from decimal import Decimal

from .models import Flow
from .schemas import Granularity, ProjectionPoint

CENT = Decimal("0.01")


def add_months(d: date, months: int) -> date:
    """Suma meses ajustando el día al último del mes si no existe (31-ene + 1 = 28/29-feb)."""
    year, month0 = divmod(d.month - 1 + months, 12)
    year += d.year
    day = min(d.day, calendar.monthrange(year, month0 + 1)[1])
    return date(year, month0 + 1, day)


def occurrences(flow: Flow, until: date) -> Iterator[date]:
    """Fechas en las que el flujo produce un movimiento, hasta `until` inclusive."""
    if not flow.is_recurring:
        if flow.start_date <= until:
            yield flow.start_date
        return

    last = until
    if flow.end_date is not None:
        last = min(last, flow.end_date)
    if flow.duration_months is not None:
        last = min(last, add_months(flow.start_date, flow.duration_months - 1))

    # Se calcula siempre desde start_date para no arrastrar el ajuste de fin de mes.
    i = 0
    while (when := add_months(flow.start_date, i)) <= last:
        yield when
        i += 1


def build_periods(granularity: Granularity, start: date, end: date) -> list[tuple[str, date, date]]:
    """Divide [start, end] en periodos completos (día, mes o año natural)."""
    periods: list[tuple[str, date, date]] = []
    if granularity == Granularity.D:
        current = start
        while current <= end:
            periods.append((current.isoformat(), current, current))
            current += timedelta(days=1)
    elif granularity == Granularity.M:
        current = start.replace(day=1)
        while current <= end:
            following = add_months(current, 1)
            periods.append((current.strftime("%Y-%m"), current, following - timedelta(days=1)))
            current = following
    else:
        for year in range(start.year, end.year + 1):
            periods.append((str(year), date(year, 1, 1), date(year, 12, 31)))
    return periods


def project(
    flows: Iterable[Flow],
    periods: list[tuple[str, date, date]],
    initial_balance: Decimal,
    balance_date: date | None = None,
) -> list[ProjectionPoint]:
    """Calcula ingresos, gastos y patrimonio al cierre de cada periodo de `build_periods`."""
    window_start, window_end = periods[0][1], periods[-1][2]
    horizon = max(window_end, balance_date) if balance_date else window_end

    movements = sorted(
        (when, flow.signed_amount) for flow in flows for when in occurrences(flow, horizon)
    )

    # Los movimientos anteriores a `balance_date` ya están incluidos en el patrimonio
    # inicial: se descuentan para obtener el saldo previo a cualquier flujo.
    balance = initial_balance
    if balance_date is not None:
        balance -= sum((amount for when, amount in movements if when < balance_date), Decimal(0))
    points: list[ProjectionPoint] = []
    idx = 0
    # Los movimientos anteriores a la ventana solo afectan al saldo de partida.
    while idx < len(movements) and movements[idx][0] < window_start:
        balance += movements[idx][1]
        idx += 1

    for label, p_start, p_end in periods:
        income = expense = Decimal(0)
        while idx < len(movements) and movements[idx][0] <= p_end:
            amount = movements[idx][1]
            if amount >= 0:
                income += amount
            else:
                expense -= amount
            idx += 1
        balance += income - expense
        points.append(
            ProjectionPoint(
                period=label,
                period_start=p_start,
                period_end=p_end,
                income=income.quantize(CENT),
                expense=expense.quantize(CENT),
                balance=balance.quantize(CENT),
            )
        )
    return points
