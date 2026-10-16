import { isRecurringFlow, monthTotals } from '@/lib/flowTypes'
import { parseISODate, toISODate } from '@/lib/format'
import { savedReviewDiff } from '@/lib/review'

/**
 * «Colchón» del resumen de la gráfica: cuántos meses de gastos fijos del mes en curso (GFM,
 * `monthTotals`) cubre el patrimonio de hoy. Sin gastos fijos, `null`; con patrimonio negativo, 0.
 */
export function cushionMonths(flows, todayBalance, today) {
  const fixed = monthTotals(flows, today).GFM
  return fixed > 0 ? Math.max(0, Number(todayBalance)) / fixed : null
}

// Días que se miran hacia atrás para los gastos medios, y lo mínimo con que se reparten (para que
// un solo gasto, si se empezó a apuntar hace poco, no cuente como lo de un mes en unos días).
const WINDOW_DAYS = 90
const MIN_DAYS = 30
const RECENT_DAYS = 60
const DAYS_PER_MONTH = 365.25 / 12
const DAY_MS = 86_400_000

/**
 * Lo que sueles gastar al mes sin planificar, en €/mes, para dejarlo libre al recomendar cuánto
 * aportar a una inversión (lo que sobra según los flujos no lo tiene en cuenta):
 * - `variable`: los gastos variables de un solo pago (GVM puntuales; los de varios pagos ya están
 *   en los flujos de los meses que vienen) de los últimos 90 días, o desde el primero si se
 *   empezaron a apuntar hace menos, repartidos por día y pasados a un mes. `since` es ese primero
 *   si hace menos de 2 meses (si no, se habla de la media de los últimos 3 meses).
 * - `leak`: la fuga de las revisiones de esos 90 días, lo que faltaba frente a lo previsto por día
 *   desde la revisión anterior (si en conjunto sobró, 0).
 * `null` si no hay nada con que calcularlo (ni GVM puntuales ni revisiones con una anterior).
 */
export function usualSpending(flows, reviews, today = new Date()) {
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const todayISO = toISODate(day)
  const windowStart = toISODate(new Date(day.getFullYear(), day.getMonth(), day.getDate() - (WINDOW_DAYS - 1)))
  const spontaneous = flows.filter(
    (flow) => flow.flow_type === 'GVM' && !isRecurringFlow(flow) && flow.start_date <= todayISO,
  )
  const reviewed = (reviews ?? [])
    .filter((review) => review.previous_date && review.review_date >= windowStart)
    .map(savedReviewDiff)
  if (!spontaneous.length && !reviewed.length) return null

  const first = spontaneous.reduce((min, flow) => (flow.start_date < min ? flow.start_date : min), todayISO)
  const from = spontaneous.length && first > windowStart ? first : windowStart
  const elapsed = Math.round((day - parseISODate(from)) / DAY_MS) + 1
  const days = Math.max(MIN_DAYS, elapsed)
  const spent = spontaneous.filter((flow) => flow.start_date >= from).reduce((sum, flow) => sum + Number(flow.amount), 0)
  const variable = (spent / days) * DAYS_PER_MONTH

  const leakDays = reviewed.reduce((sum, review) => sum + review.days, 0)
  const missing = reviewed.reduce((sum, review) => sum - review.diff, 0)
  const leak = leakDays > 0 ? (Math.max(0, missing) / leakDays) * DAYS_PER_MONTH : 0

  return { variable, leak, total: variable + leak, since: elapsed < RECENT_DAYS ? from : null }
}
