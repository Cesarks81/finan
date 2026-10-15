import { Briefcase, HandCoins, House, ShoppingBag } from 'lucide-react'

import { formatDate, toISODate } from '@/lib/format'

export const FLOW_TYPES = {
  GFM: {
    code: 'GFM',
    name: 'Gasto Fijo Mensual',
    label: 'Gasto fijo',
    description: 'Gastos recurrentes cada mes: alquiler, luz, agua, comida, gasolina…',
    income: false,
    icon: House,
  },
  GVM: {
    code: 'GVM',
    name: 'Gasto Variable Mensual',
    label: 'Gasto variable',
    description: 'Compras puntuales o caprichos no planificados, también a plazos (financiar una consola…).',
    income: false,
    icon: ShoppingBag,
  },
  IFM: {
    code: 'IFM',
    name: 'Ingreso Fijo Mensual',
    label: 'Ingreso fijo',
    description: 'Ingresos estables cada mes, como la nómina.',
    income: true,
    icon: Briefcase,
  },
  IVM: {
    code: 'IVM',
    name: 'Ingreso Variable Temporal',
    label: 'Ingreso variable',
    description: 'Ingresos puntuales o temporales: trabajos extra, cobro de una deuda a plazos…',
    income: true,
    icon: HandCoins,
  },
}

export const FLOW_ORDER = ['GFM', 'GVM', 'IFM', 'IVM']
export const VARIABLE_TYPES = ['GVM', 'IVM']
export const FIXED_TYPES = ['GFM', 'IFM']

/** Fecha del pago número `index` (0 = el primero), con el día ajustado a fin de mes como en el backend. */
function monthlyPayment(startDate, index) {
  const [year, month, day] = startDate.split('-').map(Number)
  const daysInMonth = new Date(year, month + index, 0).getDate()
  return toISODate(new Date(year, month - 1 + index, Math.min(day, daysInMonth)))
}

/** Fecha del último pago de un flujo recurrente, o null si no tiene fin. */
function lastPayment(flow) {
  const ends = []
  if (flow.end_date) ends.push(flow.end_date)
  if (flow.duration_months) ends.push(monthlyPayment(flow.start_date, flow.duration_months - 1))
  return ends.sort()[0] ?? null
}

/** Pagos mensuales que quedan desde hoy (incluido) hasta el último. */
function remainingPayments(flow, last, today) {
  let count = 0
  for (let index = 0; ; index++) {
    const when = monthlyPayment(flow.start_date, index)
    if (when > last) return count
    if (when >= today) count++
  }
}

/**
 * Periodicidad de un flujo devuelto por la API para el Historial:
 * - `label`: «Puntual», «Mensual» (sin fin) o los meses que quedan («4 meses»), que van
 *   bajando con el tiempo; «Terminado» si ya no quedan pagos.
 * - `ended`: si ya hizo su último pago (el Historial lo lleva a «Terminados»).
 * - `hint`: fecha del último pago, si la tiene.
 */
export function describeSchedule(flow, today = toISODate(new Date())) {
  if (!flow.is_recurring) return { label: 'Puntual' }
  const last = lastPayment(flow)
  if (!last) return { label: 'Mensual' }
  const hint = `Último pago: ${formatDate(last)}`
  const remaining = remainingPayments(flow, last, today)
  if (remaining === 0) return { label: 'Terminado', ended: true, hint }
  return { label: `${remaining} ${remaining === 1 ? 'mes' : 'meses'}`, hint }
}

/**
 * Lo que suma cada tipo de flujo en el mes de `today` (positivo; el signo lo da el tipo):
 * los puntuales con fecha en ese mes y el pago de ese mes de los recurrentes que sigan activos.
 */
export function monthTotals(flows, today = toISODate(new Date())) {
  const [year, month] = today.split('-').map(Number)
  const totals = Object.fromEntries(FLOW_ORDER.map((code) => [code, 0]))
  for (const flow of flows) {
    let paysThisMonth
    if (flow.is_recurring) {
      const [startYear, startMonth] = flow.start_date.split('-').map(Number)
      const index = (year - startYear) * 12 + (month - startMonth)
      const last = lastPayment(flow)
      paysThisMonth = index >= 0 && (!last || monthlyPayment(flow.start_date, index) <= last)
    } else {
      paysThisMonth = flow.start_date.slice(0, 7) === today.slice(0, 7)
    }
    if (paysThisMonth) totals[flow.flow_type] += Math.round(Number(flow.amount) * 100)
  }
  return Object.fromEntries(Object.entries(totals).map(([code, cents]) => [code, cents / 100]))
}
