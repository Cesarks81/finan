import { flowDates, FLOW_TYPES } from '@/lib/flowTypes'
import { parseISODate, toISODate } from '@/lib/format'

const DAY = 86_400_000
const years = (from, to) => (parseISODate(to) - parseISODate(from)) / DAY / 365.25

/** Inversión de la API (`/investments`) en números: `{ id, name, amount, monthly, rate, date, until }`. */
export function investmentOf(row) {
  return {
    id: row.id,
    name: row.name,
    amount: Number(row.amount),
    monthly: Number(row.monthly ?? 0),
    rate: Number(row.annual_return) / 100,
    date: row.start_date,
    until: row.until ?? null,
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

/** Lo que sobraría cada mes con el flujo `add` (y, al editar, sin el original, `remove`; sin `add`, solo sin él). */
export function surplusWith(surplus, add, remove = null, today = new Date()) {
  const until = horizonOf(today)
  const cents = new Map([...surplus].map(([month, value]) => [month, Math.round(value * 100)]))
  if (add) addFlow(cents, add, until)
  if (remove) addFlow(cents, remove, until, -1)
  return new Map([...cents].map(([month, value]) => [month, value / 100]))
}

// Día 1 del mes `k` después del de `date` ('YYYY-MM-DD').
function monthStart(start, k) {
  return toISODate(new Date(start.getFullYear(), start.getMonth() + k, 1))
}

/** Si la inversión aporta el mes que empieza en `when` (día 1): desde el mes siguiente al de su fecha y hasta `until`. */
function contributes(investment, when) {
  return investment.monthly > 0 && when.slice(0, 7) > investment.date.slice(0, 7) && (!investment.until || when <= investment.until)
}

/** Lo que quieren aportar en total, el mes que empieza en `when`, las inversiones de la lista. */
export function wanted(investments, when) {
  return investments.reduce((sum, investment) => sum + (contributes(investment, when) ? investment.monthly : 0), 0)
}

/**
 * Reparto de lo que sobra cada mes entre las inversiones: si sobra para todas, cada una aporta su
 * mensual; si no, lo que sobra se reparte en proporción a lo que aporta cada una (y nada si no
 * sobra). Devuelve (inversión, día 1 del mes) → aportación.
 */
function allocator(investments, surplus) {
  const shares = new Map() // 'YYYY-MM' → parte de la mensual que se aporta ese mes (0–1)
  return (investment, when) => {
    if (!contributes(investment, when)) return 0
    const month = when.slice(0, 7)
    if (!shares.has(month)) {
      const total = wanted(investments, when)
      const free = Math.max(0, surplus.get(month) ?? 0)
      shares.set(month, total > free ? free / total : 1)
    }
    return investment.monthly * shares.get(month)
  }
}

/**
 * Lo que queda libre para una inversión el mes que empieza en `when`: lo que sobra menos lo que
 * quieren aportar las demás (`others`). Es lo que puede aportar sin que se recorte ninguna.
 */
export function freeFor(others, surplus, when) {
  return Math.max(0, (surplus.get(when.slice(0, 7)) ?? 0) - wanted(others, when))
}

/**
 * Plan de aportaciones de `investment` (la del formulario; las demás, en `others`) desde el mes
 * siguiente a su fecha hasta `until` (sin fecha final, los próximos `months` meses): cada mes, lo
 * que le queda libre (`freeFor`) y lo que aportaría. `max` es lo máximo que puede aportar todos
 * los meses del plan sin que ninguno se quede corto (lo libre el mes más justo); `total`, lo que
 * aportaría en total.
 */
export function contributionPlan(investment, others, surplus, { months = 12 } = {}) {
  const allocate = allocator([...others, investment], surplus)
  const start = parseISODate(investment.date)
  const rows = []
  for (let k = 1; k <= HORIZON_MONTHS; k++) {
    const when = monthStart(start, k)
    if (investment.until ? when > investment.until : k > months) break
    rows.push({
      month: when.slice(0, 7),
      available: freeFor(others, surplus, when),
      contribution: allocate(investment, when),
    })
  }
  return {
    rows,
    max: rows.length ? Math.min(...rows.map((row) => row.available)) : null,
    total: rows.reduce((sum, row) => sum + row.contribution, 0),
  }
}

/**
 * Calculadora de una inversión: lo invertido en `date` y una aportación el día 1 de cada mes
 * (`contributionOf`, el reparto de lo que sobra), cada una con interés compuesto desde que entra. Llevadas todas a la fecha `date`, el valor en `iso` es
 * (1 + r)^años · (invertido + Σ aportación · descuento), así que basta con acumular cada
 * aportación una sola vez (miles de puntos en milisegundos). Devuelve `{ value, contributed }`.
 */
function calculator(investment, contributionOf) {
  const { amount, rate, date } = investment
  const start = parseISODate(date)
  const discounted = [0] // discounted[n]: Σ aportación k · (1 + r)^−años(date, k), k ≤ n
  const contributed = [0] // contributed[n]: Σ aportación k, k ≤ n
  return (iso) => {
    if (iso <= date) return { value: amount, contributed: 0 }
    const n = contributionsUntil(date, iso)
    for (let k = discounted.length; k <= n; k++) {
      const when = monthStart(start, k)
      const contribution = contributionOf(when)
      discounted.push(discounted[k - 1] + contribution * (1 + rate) ** -years(date, when))
      contributed.push(contributed[k - 1] + contribution)
    }
    return { value: (1 + rate) ** years(date, iso) * (amount + discounted[n]), contributed: contributed[n] }
  }
}

/** Rentabilidad acumulada desde `date` hasta `iso`: el valor menos lo que se ha puesto. */
function gainsOf(investment, at, iso) {
  if (iso <= investment.date) return 0
  const { value, contributed } = at(iso)
  return value - investment.amount - contributed
}

/**
 * Cartera: las inversiones (`investmentOf`) con lo que sobra cada mes (`monthlySurplus`), que se
 * reparte entre sus aportaciones (`allocator`).
 * - `value(investment, iso)`: lo que vale una en esa fecha (antes de su fecha, lo invertido).
 * - `adjust(balanceDate)`: lo que la rentabilidad de todas suma al patrimonio en cada fecha
 *   (función fecha → €). El patrimonio inicial ya incluye lo ganado hasta su fecha
 *   (`balance_date`): como con los flujos, se suma lo que rinde desde entonces y, antes de esa
 *   fecha, se resta lo que faltaba por rendir.
 */
export function portfolio(investments, surplus) {
  const allocate = allocator(investments, surplus)
  const calculators = new Map(
    investments.map((investment) => [investment, calculator(investment, (when) => allocate(investment, when))]),
  )
  return {
    value: (investment, iso) => calculators.get(investment)(iso).value,
    adjust(balanceDate) {
      const parts = investments.map((investment) => {
        const at = calculators.get(investment)
        const anchor = balanceDate && balanceDate > investment.date ? balanceDate : investment.date
        return { investment, at, base: gainsOf(investment, at, anchor) }
      })
      return (iso) => parts.reduce((sum, { investment, at, base }) => sum + gainsOf(investment, at, iso) - base, 0)
    },
  }
}

/**
 * Proyecciones con la rentabilidad de las inversiones. Lo invertido y las aportaciones ya forman
 * parte del patrimonio (aportar es mover dinero ahorrado, no gastarlo), así que solo se suma lo
 * que rinden (`portfolio(…).adjust`). Las líneas de ingresos y gastos no cambian. `surplus` es lo
 * que sobra cada mes (`monthlySurplus`), el tope de las aportaciones.
 */
export function withInvestments(projections, investments, balanceDate, surplus, today = new Date()) {
  if (!investments.length) return projections
  const adjust = portfolio(investments, surplus).adjust(balanceDate)
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
 * Cómo cambian las inversiones si lo que sobra cada mes pasa de `before` a `after` (al añadir o
 * editar un flujo), hasta el mes `lastMonth` ('YYYY-MM', el final de la proyección larga):
 * - `shift`: lo que cambia el patrimonio en cada fecha (función fecha → €) porque se aporta
 *   distinto y rinde distinto. Lo aportado no cuenta: ya era parte del patrimonio.
 * - `change`: lo que cambian las aportaciones (de todas juntas), o null si no cambian. `first` y
 *   `last`, primer y último mes que cambian; `count`, cuántos; `total`, la suma (€, negativa si se
 *   aporta menos); `min` y `max`, el cambio más pequeño y más grande de un mes (en positivo);
 *   `mixed`, si unos meses suben y otros bajan; `open`, si sigue hasta el final; `monthly`, lo que
 *   quieren aportar el primer mes que cambia.
 */
export function investmentImpact(investments, balanceDate, before, after, lastMonth) {
  const from = portfolio(investments, before).adjust(balanceDate)
  const to = portfolio(investments, after).adjust(balanceDate)
  const shift = (iso) => to(iso) - from(iso)
  if (!investments.length) return { shift, change: null }

  const allocateBefore = allocator(investments, before)
  const allocateAfter = allocator(investments, after)
  const start = parseISODate(investments.map((investment) => investment.date).sort()[0])
  const diffs = []
  for (let k = 1; k <= HORIZON_MONTHS; k++) {
    const when = monthStart(start, k)
    if (when.slice(0, 7) > lastMonth) break
    const cents = Math.round(
      investments.reduce((sum, i) => sum + allocateAfter(i, when) - allocateBefore(i, when), 0) * 100,
    )
    if (cents !== 0) diffs.push({ when, cents })
  }
  if (!diffs.length) return { shift, change: null }
  const sizes = diffs.map((d) => Math.abs(d.cents) / 100)
  return {
    shift,
    change: {
      first: diffs[0].when.slice(0, 7),
      last: diffs.at(-1).when.slice(0, 7),
      count: diffs.length,
      total: diffs.reduce((sum, d) => sum + d.cents, 0) / 100,
      min: Math.min(...sizes),
      max: Math.max(...sizes),
      mixed: diffs.some((d) => d.cents > 0) && diffs.some((d) => d.cents < 0),
      open: diffs.at(-1).when.slice(0, 7) === lastMonth,
      monthly: wanted(investments, diffs[0].when),
    },
  }
}
