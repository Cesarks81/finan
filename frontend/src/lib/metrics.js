import { monthTotals } from '@/lib/flowTypes'

/**
 * Métricas del resumen de la gráfica, con los flujos del mes en curso (`monthTotals`):
 * - `cushion` («Colchón»): cuántos meses de gastos fijos (GFM) cubre el patrimonio de hoy. Sin
 *   gastos fijos, `null`; con patrimonio negativo, 0.
 * - `savingsRate` («Tasa de ahorro»): parte de los ingresos del mes (IFM + IVM) que queda tras
 *   todos los gastos (GFM + GVM). Sin ingresos, `null`.
 */
export function wealthMetrics(flows, todayBalance, today) {
  const totals = monthTotals(flows, today)
  const income = totals.IFM + totals.IVM
  const expense = totals.GFM + totals.GVM
  return {
    cushion: totals.GFM > 0 ? Math.max(0, Number(todayBalance)) / totals.GFM : null,
    savingsRate: income > 0 ? (income - expense) / income : null,
  }
}
