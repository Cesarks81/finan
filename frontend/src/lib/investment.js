import { flowDates, FLOW_TYPES } from '@/lib/flowTypes'
import { parseISODate, toISODate } from '@/lib/format'

const DAY = 86_400_000
const years = (from, to) => (parseISODate(to) - parseISODate(from)) / DAY / 365.25

/** Inversión de los ajustes (`invest_*`), o null si no hay ninguna. */
export function investmentOf(settings) {
  if (!settings?.invest_date || settings.invest_amount === null || settings.invest_return === null) return null
  return {
    amount: Number(settings.invest_amount),
    monthly: Number(settings.invest_monthly ?? 0),
    rate: Number(settings.invest_return) / 100,
    date: settings.invest_date,
    until: settings.invest_until ?? null,
  }
}

// Aportaciones hasta `iso`: una el día 1 de cada mes desde el siguiente a `date`.
function contributionsUntil(date, iso) {
  const [y0, m0] = date.split('-').map(Number)
  const [y, m] = iso.split('-').map(Number)
  return Math.max(0, (y - y0) * 12 + (m - m0))
}

// Meses de flujos que se tienen en cuenta desde hoy: más que cualquier vista (la larga, 40 años).
const HORIZON_MONTHS = 600

// Suma (o, con `sign` −1, resta) a `cents` lo que mueve el flujo cada mes, en céntimos (+ ingreso).
function addFlow(cents, flow, until, sign = 1) {
  const amount = Math.round(Number(flow.amount) * 100) * (FLOW_TYPES[flow.flow_type].income ? 1 : -1) * sign
  for (const when of flowDates(flow, until)) {
    const month = when.slice(0, 7)
    cents.set(month, (cents.get(month) ?? 0) + amount)
  }
}

const horizonOf = (today) => toISODate(new Date(today.getFullYear(), today.getMonth() + HORIZON_MONTHS, 0))

/**
 * Lo que sobra cada mes ('YYYY-MM' → ingresos − gastos, en €), sacado de los flujos, así que se
 * sabe para cualquier mes, pasado o futuro, aunque no salga en la gráfica. Un mes que no está en
 * el mapa no tiene flujos: no sobra nada.
 */
export function monthlySurplus(flows, today = new Date()) {
  const until = horizonOf(today)
  const cents = new Map()
  for (const flow of flows) addFlow(cents, flow, until)
  return new Map([...cents].map(([month, value]) => [month, value / 100]))
}

/** Lo que sobraría cada mes con el flujo `add` (y, al editar, sin el original, `remove`). */
export function surplusWith(surplus, add, remove = null, today = new Date()) {
  const until = horizonOf(today)
  const cents = new Map([...surplus].map(([month, value]) => [month, Math.round(value * 100)]))
  addFlow(cents, add, until)
  if (remove) addFlow(cents, remove, until, -1)
  return new Map([...cents].map(([month, value]) => [month, value / 100]))
}

// Día 1 del mes `k` después del de `date` ('YYYY-MM-DD').
function monthStart(start, k) {
  return toISODate(new Date(start.getFullYear(), start.getMonth() + k, 1))
}

/**
 * Aportación del mes que empieza en `when`: la mensual, o lo que sobre ese mes si es menos (0 si
 * no sobra nada); nada después de `until`.
 */
function contributionFor({ monthly, until }, surplus, when) {
  if (until && when > until) return 0
  return Math.min(monthly, Math.max(0, surplus.get(when.slice(0, 7)) ?? 0))
}

/**
 * Plan de aportaciones desde el mes siguiente a `date` hasta `until` (sin fecha final, los
 * próximos `months` meses): cada mes, lo que sobra y lo que se aportaría. `max` es lo máximo que
 * se puede aportar todos los meses del plan sin que ninguno se quede corto (lo que sobra el mes
 * más justo); `total`, lo que se aportaría en total.
 */
export function contributionPlan(investment, surplus, { months = 12 } = {}) {
  const start = parseISODate(investment.date)
  const rows = []
  for (let k = 1; k <= HORIZON_MONTHS; k++) {
    const when = monthStart(start, k)
    if (investment.until ? when > investment.until : k > months) break
    rows.push({
      month: when.slice(0, 7),
      available: Math.max(0, surplus.get(when.slice(0, 7)) ?? 0),
      contribution: contributionFor(investment, surplus, when),
    })
  }
  return {
    rows,
    max: rows.length ? Math.min(...rows.map((row) => row.available)) : null,
    total: rows.reduce((sum, row) => sum + row.contribution, 0),
  }
}

/**
 * Calculadora de la inversión: lo invertido en `date` y una aportación el día 1 de cada mes
 * (`contributionFor`: nunca más de lo que sobra ese mes y ninguna después de `until`), cada una
 * con interés compuesto desde que entra. Llevadas todas a la fecha `date`, el valor en `iso` es
 * (1 + r)^años · (invertido + Σ aportación · descuento), así que basta con acumular cada
 * aportación una sola vez (miles de puntos en milisegundos). Devuelve `{ value, contributed }`.
 */
function calculator(investment, surplus) {
  const { amount, rate, date } = investment
  const start = parseISODate(date)
  const discounted = [0] // discounted[n]: Σ aportación k · (1 + r)^−años(date, k), k ≤ n
  const contributed = [0] // contributed[n]: Σ aportación k, k ≤ n
  return (iso) => {
    if (iso <= date) return { value: amount, contributed: 0 }
    const n = contributionsUntil(date, iso)
    for (let k = discounted.length; k <= n; k++) {
      const when = monthStart(start, k)
      const contribution = contributionFor(investment, surplus, when)
      discounted.push(discounted[k - 1] + contribution * (1 + rate) ** -years(date, when))
      contributed.push(contributed[k - 1] + contribution)
    }
    return { value: (1 + rate) ** years(date, iso) * (amount + discounted[n]), contributed: contributed[n] }
  }
}

/** Valor de la inversión en `iso` (antes de `date`, lo invertido entonces). */
export function investmentValue(investment, iso, surplus) {
  return calculator(investment, surplus)(iso).value
}

/** Rentabilidad acumulada desde `date` hasta `iso`: el valor menos lo que se ha puesto. */
function gainsCalculator(investment, surplus) {
  const at = calculator(investment, surplus)
  return (iso) => {
    if (iso <= investment.date) return 0
    const { value, contributed } = at(iso)
    return value - investment.amount - contributed
  }
}

/**
 * Lo que la rentabilidad suma al patrimonio en cada fecha (función fecha → €). El patrimonio
 * inicial ya incluye lo ganado hasta su fecha (`balance_date`): como con los flujos, se suma lo
 * que rinde desde entonces y, antes de esa fecha, se resta lo que faltaba por rendir.
 */
function gainsAdjust(investment, balanceDate, surplus) {
  const gains = gainsCalculator(investment, surplus)
  const anchor = balanceDate && balanceDate > investment.date ? balanceDate : investment.date
  const base = gains(anchor)
  return (iso) => gains(iso) - base
}

/**
 * Proyecciones con la rentabilidad de la inversión. Lo invertido y las aportaciones ya forman
 * parte del patrimonio (aportar es mover dinero ahorrado, no gastarlo), así que solo se suma lo
 * que rinden (`gainsAdjust`). Las líneas de ingresos y gastos no cambian. `surplus` es lo que
 * sobra cada mes (`monthlySurplus`), el tope de cada aportación.
 */
export function withInvestment(projections, investment, balanceDate, surplus, today = new Date()) {
  if (!investment) return projections
  const adjust = gainsAdjust(investment, balanceDate, surplus)
  const points = (list) =>
    list.map((p) => ({ ...p, balance: (Number(p.balance) + adjust(p.period_end)).toFixed(2) }))
  const view = (data) => ({ ...data, points: points(data.points) })
  return {
    ...projections,
    D: view(projections.D),
    M: view(projections.M),
    A: view(projections.A),
    long: points(projections.long),
    todayBalance:
      projections.todayBalance === undefined
        ? undefined
        : (Number(projections.todayBalance) + adjust(toISODate(today))).toFixed(2),
  }
}

/**
 * Cómo cambia la inversión si lo que sobra cada mes pasa de `before` a `after` (al añadir o editar
 * un flujo), hasta el mes `lastMonth` ('YYYY-MM', el final de la proyección larga):
 * - `shift`: lo que cambia el patrimonio en cada fecha (función fecha → €) porque se aporta
 *   distinto y rinde distinto. Lo aportado no cuenta: ya era parte del patrimonio.
 * - `change`: lo que cambian las aportaciones, o null si no cambian. `first` y `last`, primer y
 *   último mes que cambian; `count`, cuántos; `total`, la suma (€, negativa si se aporta menos);
 *   `min` y `max`, el cambio más pequeño y más grande de un mes (en positivo); `mixed`, si unos
 *   meses suben y otros bajan; `open`, si sigue hasta el final (sin fecha final de aportaciones).
 */
export function investmentImpact(investment, balanceDate, before, after, lastMonth) {
  const from = gainsAdjust(investment, balanceDate, before)
  const to = gainsAdjust(investment, balanceDate, after)
  const shift = (iso) => to(iso) - from(iso)

  const start = parseISODate(investment.date)
  const diffs = []
  for (let k = 1; k <= HORIZON_MONTHS; k++) {
    const when = monthStart(start, k)
    if (when.slice(0, 7) > lastMonth || (investment.until && when > investment.until)) break
    const cents = Math.round((contributionFor(investment, after, when) - contributionFor(investment, before, when)) * 100)
    if (cents !== 0) diffs.push({ month: when.slice(0, 7), cents })
  }
  if (!diffs.length) return { shift, change: null }
  const sizes = diffs.map((d) => Math.abs(d.cents) / 100)
  return {
    shift,
    change: {
      first: diffs[0].month,
      last: diffs.at(-1).month,
      count: diffs.length,
      total: diffs.reduce((sum, d) => sum + d.cents, 0) / 100,
      min: Math.min(...sizes),
      max: Math.max(...sizes),
      mixed: diffs.some((d) => d.cents > 0) && diffs.some((d) => d.cents < 0),
      open: !investment.until && diffs.at(-1).month === lastMonth,
    },
  }
}
