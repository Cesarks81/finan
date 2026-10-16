import { flowDates, FLOW_TYPES } from '@/lib/flowTypes'

/**
 * Objetivo de patrimonio. Todo sale de la proyección mensual larga (`long` en
 * `lib/projections.js`: desde el mes en curso, 40 años), cuyo `balance` es el patrimonio al
 * final de cada mes.
 */

const cents = (value) => Math.round(Number(value) * 100)

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
 * - `monthWithExtra`: el mismo, ahorrando `extra` € más al mes desde el mes que viene.
 * - `progress`: patrimonio de hoy / objetivo (0–1).
 */
export function goalForecast(longPoints, goalAmount, todayBalance, extra = 100) {
  const goal = Number(goalAmount)
  const progress = Math.max(0, Math.min(1, Number(todayBalance) / goal))
  const reached = Number(todayBalance) >= goal
  const month = firstMonthReaching(longPoints, goal)
  const monthWithExtra = firstMonthReaching(
    longPoints,
    goal,
    longPoints.map((_, i) => cents(extra) * i),
  )
  return { reached, month, monthWithExtra, progress }
}

/**
 * Cómo cambia la fecha del objetivo si se añade `candidate` (y, al editar, se quita `previous`).
 * `anchor` es la fecha del patrimonio inicial (`balance_date`, o null). `investmentShift` (fecha →
 * €), si hay inversión, es lo que cambia su rentabilidad porque el flujo cambia lo que se aporta
 * (`investmentImpact` en `lib/investment.js`). Devuelve `{ before, after, delta }` (meses; null si
 * alguna fecha no se alcanza).
 */
export function goalImpact(longPoints, goalAmount, candidate, previous = null, anchor = null, investmentShift = null) {
  const add = flowContribution(candidate, longPoints, anchor)
  const remove = previous ? flowContribution(previous, longPoints, anchor) : null
  const adjust = add.map(
    (value, i) =>
      value - (remove ? remove[i] : 0) + (investmentShift ? cents(investmentShift(longPoints[i].period_end)) : 0),
  )
  const before = firstMonthReaching(longPoints, goalAmount)
  const after = firstMonthReaching(longPoints, goalAmount, adjust)
  return { before, after, delta: before && after ? monthsBetween(before, after) : null }
}
