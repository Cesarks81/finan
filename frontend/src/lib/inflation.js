import { parseISODate } from '@/lib/format'

const DAY = 86_400_000

/**
 * Factor para pasar euros de la fecha `iso` a euros de hoy con una inflación anual `rate`
 * (0,02 = 2 %): menor que 1 en el futuro (el dinero valdrá menos) y mayor en el pasado.
 */
export function deflator(iso, rate, today = new Date()) {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const years = (parseISODate(iso) - start) / DAY / 365.25
  return (1 + rate) ** -years
}

function realPoints(points, rate, today) {
  return points.map((p) => {
    const factor = deflator(p.period_end, rate, today)
    const real = (value) => (Number(value) * factor).toFixed(2)
    return { ...p, balance: real(p.balance), income: real(p.income), expense: real(p.expense), deflator: factor }
  })
}

/**
 * Ajuste «Euros de hoy»: las proyecciones en caché (`fetchAllProjections`) con cada importe
 * pasado a euros de hoy según la fecha en que acaba su periodo. Cada punto lleva su `deflator`
 * para convertir otros importes de ese periodo (el impacto de un flujo en el objetivo). El
 * patrimonio de hoy no cambia (su factor es 1).
 */
export function inRealTerms(projections, rate, today = new Date()) {
  const view = (data) => ({
    ...data,
    initial_balance:
      data.balance_date && data.initial_balance !== null
        ? (Number(data.initial_balance) * deflator(data.balance_date, rate, today)).toFixed(2)
        : data.initial_balance,
    points: realPoints(data.points, rate, today),
  })
  return {
    ...projections,
    D: view(projections.D),
    M: view(projections.M),
    A: view(projections.A),
    long: realPoints(projections.long, rate, today),
  }
}
