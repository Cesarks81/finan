"""Cambios de datos al arrancar (no de esquema: eso lo hace `database.ensure_schema`).

Se ejecutan en la primera petición de cada proceso, justo después de crear las tablas, así que
tienen que poder repetirse sin efecto: comprueban antes de cambiar nada.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models

LEGACY_FIELDS = ("invest_amount", "invest_monthly", "invest_return", "invest_date", "invest_until")


def move_legacy_investment(db: Session) -> None:
    """Pasa la inversión única de los ajustes (`settings.invest_*`) a la tabla `investments`.

    La fila de ajustes se bloquea mientras tanto (en Postgres) y se vacían sus campos `invest_*`,
    así que otra instancia que lo intente a la vez, o después, ya no encuentra nada que mover.
    """
    settings = db.scalar(select(models.Settings).where(models.Settings.id == 1).with_for_update())
    if settings is None or settings.invest_date is None:
        db.rollback()
        return
    if settings.invest_amount is not None and settings.invest_return is not None:
        db.add(
            models.Investment(
                name="Inversión",
                amount=settings.invest_amount,
                monthly=settings.invest_monthly or 0,
                annual_return=settings.invest_return,
                start_date=settings.invest_date,
                until=settings.invest_until,
            )
        )
    for field in LEGACY_FIELDS:
        setattr(settings, field, None)
    db.commit()


def run(db: Session) -> None:
    move_legacy_investment(db)
