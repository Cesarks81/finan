import { monthTotals } from '@/lib/flowTypes'

/**
 * «Colchón» del resumen de la gráfica: cuántos meses de gastos fijos del mes en curso (GFM,
 * `monthTotals`) cubre el patrimonio de hoy. Sin gastos fijos, `null`; con patrimonio negativo, 0.
 */
export function cushionMonths(flows, todayBalance, today) {
  const fixed = monthTotals(flows, today).GFM
  return fixed > 0 ? Math.max(0, Number(todayBalance)) / fixed : null
}
