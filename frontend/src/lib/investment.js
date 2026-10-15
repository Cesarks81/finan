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
  }
}

// Aportaciones hasta `iso`: una el día 1 de cada mes desde el siguiente a `date`.
function contributionsUntil(date, iso) {
  const [y0, m0] = date.split('-').map(Number)
  const [y, m] = iso.split('-').map(Number)
  return Math.max(0, (y - y0) * 12 + (m - m0))
}

/**
 * Lo que sobra cada mes ('YYYY-MM' → ingresos − gastos), sacado de las proyecciones mensuales
 * de la API (la vista M y la larga), antes de rentabilidad e inflación.
 */
export function monthlySurplus(projections) {
  const surplus = new Map()
  for (const p of [...(projections?.M?.points ?? []), ...(projections?.long ?? [])]) {
    surplus.set(p.period.slice(0, 7), Number(p.income) - Number(p.expense))
  }
  return surplus
}

/**
 * Calculadora de la inversión: lo invertido en `date` y una aportación el día 1 de cada mes,
 * cada una con interés compuesto desde que entra. Nunca se invierte más de lo que sobra ese mes
 * (`surplus`): la aportación es la mensual o, si sobra menos, lo que sobre (0 si no sobra nada);
 * un mes sin datos lleva la mensual. Llevadas todas a la fecha `date`, el valor en `iso` es
 * (1 + r)^años · (invertido + Σ aportación · descuento), así que basta con acumular cada
 * aportación una sola vez (miles de puntos en milisegundos). Devuelve `{ value, contributed }`.
 */
function calculator({ amount, monthly, rate, date }, surplus = new Map()) {
  const start = parseISODate(date)
  const discounted = [0] // discounted[n]: Σ aportación k · (1 + r)^−años(date, k), k ≤ n
  const contributed = [0] // contributed[n]: Σ aportación k, k ≤ n
  return (iso) => {
    if (iso <= date) return { value: amount, contributed: 0 }
    const n = contributionsUntil(date, iso)
    for (let k = discounted.length; k <= n; k++) {
      const when = toISODate(new Date(start.getFullYear(), start.getMonth() + k, 1))
      const free = surplus.get(when.slice(0, 7))
      const contribution = free === undefined ? monthly : Math.min(monthly, Math.max(0, free))
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
 * Proyecciones con la rentabilidad de la inversión. Lo invertido y las aportaciones ya forman
 * parte del patrimonio (aportar es mover dinero ahorrado, no gastarlo), así que solo se suma lo
 * que rinden. El patrimonio inicial ya incluye lo ganado hasta su fecha (`balance_date`): como con
 * los flujos, se suma lo que rinde desde entonces y, antes de esa fecha, se resta lo que faltaba
 * por rendir. Las líneas de ingresos y gastos no cambian. `projections` son las de la API (de
 * ellas sale lo que sobra cada mes, el tope de cada aportación).
 */
export function withInvestment(projections, investment, balanceDate, today = new Date()) {
  if (!investment) return projections
  const gains = gainsCalculator(investment, monthlySurplus(projections))
  const anchor = balanceDate && balanceDate > investment.date ? balanceDate : investment.date
  const base = gains(anchor)
  const adjust = (iso) => gains(iso) - base
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
