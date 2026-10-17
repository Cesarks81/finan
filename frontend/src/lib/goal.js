import { flowDates, FLOW_TYPES } from '@/lib/flowTypes'
import { toISODate } from '@/lib/format'
import { investedShift, investmentImpact, surplusWith } from '@/lib/investment'

/**
 * Objetivo de patrimonio. Todo sale de la proyección mensual larga (`long` en
 * `lib/projections.js`: desde el mes en curso, 40 años), cuyo `balance` es el patrimonio al
 * final de cada mes.
 */

const cents = (value) => Math.round(Number(value) * 100)

/**
 * Lo que cuenta para el objetivo (`settings.goal_basis`): 'all', todo el patrimonio (por defecto),
 * o 'invested', solo lo que valen las inversiones (lo invertido, lo aportado y lo ganado).
 */
export const goalBasis = (settings) => (settings?.goal_basis === 'invested' ? 'invested' : 'all')

/**
 * Los puntos de una proyección con lo que cuenta para el objetivo en `balance`: tal cual, o con lo
 * que valen las inversiones (`invested`, que pone `withInvestments`; sin inversiones, 0).
 */
export function goalPoints(points, basis) {
  return basis === 'invested' ? points.map((p) => ({ ...p, balance: p.invested ?? '0' })) : points
}

/** Lo que cuenta hoy para el objetivo: el patrimonio de hoy o lo que valen hoy las inversiones. */
export function goalToday(projections, basis) {
  return basis === 'invested' ? (projections.todayInvested ?? '0') : projections.todayBalance
}

/** Primer mes ('YYYY-MM') en que el patrimonio llega a `goal`, o null si no llega en el horizonte. */
function firstMonthReaching(points, goal, adjust) {
  const target = cents(goal)
  for (let i = 0; i < points.length; i++) {
    // Con «Euros de hoy», los puntos traen su `deflator` y el ajuste (en euros de cada mes) se
    // convierte igual que el patrimonio.
    const extra = adjust ? adjust[i] * (points[i].deflator ?? 1) : 0
    if (cents(points[i].balance) + extra >= target) return points[i].period
  }
  return null
}

/** Meses entre dos 'YYYY-MM' (b − a). */
export function monthsBetween(a, b) {
  const [ya, ma] = a.split('-').map(Number)
  const [yb, mb] = b.split('-').map(Number)
  return (yb - ya) * 12 + (mb - ma)
}

/**
 * Lo que un flujo cambia el patrimonio al final de cada mes de la proyección, en céntimos (+
 * ingreso, − gasto), con las mismas reglas que el backend: día ajustado a fin de mes y el
 * patrimonio inicial anclado al empezar `anchor` (`balance_date`). Los movimientos anteriores a
 * esa fecha ya están dentro del patrimonio inicial, así que solo cuentan los de esa fecha en
 * adelante (y, para un mes anterior a ella, se descuentan los que van entre ese mes y la fecha).
 */
function flowContribution(flow, points, anchor) {
  const sign = FLOW_TYPES[flow.flow_type].income ? 1 : -1
  const amount = cents(flow.amount) * sign
  const dates = flowDates(flow, points.at(-1).period_end)
  return points.map((p) => {
    if (anchor && p.period_end < anchor) {
      return -amount * dates.filter((d) => d > p.period_end && d < anchor).length
    }
    return amount * dates.filter((d) => d <= p.period_end && (!anchor || d >= anchor)).length
  })
}

/**
 * Previsión del objetivo:
 * - `reached`: ya se tiene (patrimonio de hoy ≥ objetivo).
 * - `month`: primer mes en que se llega (null si no se llega en 40 años).
 * - `monthWithExtra`: el mismo, ahorrando `extra` € más al mes desde el mes que viene. Con
 *   inversión, `extraShift` (`extraSavingShift`) añade lo que rendiría esa parte que se invierte.
 * - `progress`: patrimonio de hoy / objetivo (0–1).
 */
export function goalForecast(longPoints, goalAmount, todayBalance, extra = 100, extraShift = null) {
  const goal = Number(goalAmount)
  const progress = Math.max(0, Math.min(1, Number(todayBalance) / goal))
  const reached = Number(todayBalance) >= goal
  const month = firstMonthReaching(longPoints, goal)
  const monthWithExtra = firstMonthReaching(
    longPoints,
    goal,
    longPoints.map((p, i) => cents(extra) * i + (extraShift ? cents(extraShift(p.period_end)) : 0)),
  )
  return { reached, month, monthWithExtra, progress }
}

/**
 * Con inversiones, lo que cambia su rentabilidad (función fecha → €) si se ahorran `extra` € más
 * al mes desde el mes que viene: en los meses en que sobra menos que las aportaciones, esos euros
 * las completan y también rinden. Se calcula como un ingreso fijo de `extra` € desde el día 1 del
 * mes que viene. `lastMonth`, el último mes de la proyección larga.
 */
export function extraSavingShift(investments, balanceDate, surplus, lastMonth, extra = 100, today = new Date()) {
  const after = surplusWith(surplus, extraSaving(extra, today), null, today)
  return investmentImpact(investments, balanceDate, surplus, after, lastMonth).shift
}

/** Ahorrar `extra` € más al mes desde el mes que viene, como un ingreso fijo desde el día 1. */
function extraSaving(extra, today) {
  return {
    flow_type: 'IFM',
    amount: String(extra),
    start_date: toISODate(new Date(today.getFullYear(), today.getMonth() + 1, 1)),
    end_date: null,
    duration_months: null,
  }
}

/**
 * Lo mismo para un objetivo de solo lo invertido: lo que cambia el valor de las inversiones si se
 * ahorran `extra` € más al mes desde el mes que viene (solo cuenta lo que llega a aportarse, si
 * completa aportaciones, y lo que rinde). Se usa con `extra` 0 en `goalForecast`.
 */
export function extraInvestedShift(investments, surplus, extra = 100, today = new Date()) {
  return investedShift(investments, surplus, surplusWith(surplus, extraSaving(extra, today), null, today))
}

/**
 * Cómo cambia la fecha del objetivo si se añade `candidate` (y, al editar, se quita `previous`;
 * sin `candidate`, solo se quita: un flujo editado a 0 €).
 * `anchor` es la fecha del patrimonio inicial (`balance_date`, o null). `investmentShift` (fecha →
 * €), si hay inversiones, es lo que cambia su rentabilidad porque el flujo cambia lo que se aporta
 * (`investmentImpact` en `lib/investment.js`). Devuelve `{ before, after, delta }` (meses; null si
 * alguna fecha no se alcanza).
 */
export function goalImpact(longPoints, goalAmount, candidate, previous = null, anchor = null, investmentShift = null) {
  const add = candidate ? flowContribution(candidate, longPoints, anchor) : longPoints.map(() => 0)
  const remove = previous ? flowContribution(previous, longPoints, anchor) : null
  const adjust = add.map(
    (value, i) =>
      value - (remove ? remove[i] : 0) + (investmentShift ? cents(investmentShift(longPoints[i].period_end)) : 0),
  )
  const before = firstMonthReaching(longPoints, goalAmount)
  const after = firstMonthReaching(longPoints, goalAmount, adjust)
  return { before, after, delta: before && after ? monthsBetween(before, after) : null }
}
