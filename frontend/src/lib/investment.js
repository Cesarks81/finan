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

// Aportaciones hechas hasta `iso`: una el día 1 de cada mes desde el siguiente a `date`.
function contributionsUntil(date, iso) {
  const [y0, m0] = date.split('-').map(Number)
  const [y, m] = iso.split('-').map(Number)
  return Math.max(0, (y - y0) * 12 + (m - m0))
}

/**
 * Calculadora del valor de la inversión: lo invertido en `date` y las aportaciones de cada mes
 * (el día 1), cada una con interés compuesto desde que entra. Llevadas todas a la fecha `date`, el
 * valor en `iso` es (1 + r)^años · (invertido + aportación · Σ descuentos), así que basta con ir
 * acumulando los descuentos de cada aportación una sola vez (miles de puntos en milisegundos).
 */
function valueCalculator({ amount, monthly, rate, date }) {
  const start = parseISODate(date)
  const discounts = [0] // discounts[n]: suma de (1 + r)^−años(date, aportación k) para k ≤ n
  return (iso) => {
    if (iso <= date) return amount
    const n = contributionsUntil(date, iso)
    for (let k = discounts.length; k <= n; k++) {
      const when = toISODate(new Date(start.getFullYear(), start.getMonth() + k, 1))
      discounts.push(discounts[k - 1] + (1 + rate) ** -years(date, when))
    }
    return (1 + rate) ** years(date, iso) * (amount + monthly * discounts[n])
  }
}

/** Valor de la inversión en `iso` (antes de `date`, lo invertido entonces). */
export function investmentValue(investment, iso) {
  return valueCalculator(investment)(iso)
}

/** Rentabilidad acumulada desde `date` hasta `iso`: el valor menos lo que se ha puesto. */
function gainsCalculator(investment) {
  const value = valueCalculator(investment)
  return (iso) =>
    iso <= investment.date
      ? 0
      : value(iso) - investment.amount - investment.monthly * contributionsUntil(investment.date, iso)
}

/**
 * Proyecciones con la rentabilidad de la inversión. Lo invertido y las aportaciones ya forman
 * parte del patrimonio (aportar es mover dinero ahorrado, no gastarlo), así que solo se suma lo
 * que rinden. El patrimonio inicial ya incluye lo ganado hasta su fecha (`balance_date`): como con
 * los flujos, se suma lo que rinde desde entonces y, antes de esa fecha, se resta lo que faltaba
 * por rendir. Las líneas de ingresos y gastos no cambian.
 */
export function withInvestment(projections, investment, balanceDate, today = new Date()) {
  if (!investment) return projections
  const gains = gainsCalculator(investment)
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
