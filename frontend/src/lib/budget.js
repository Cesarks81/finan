import { monthTotals } from '@/lib/flowTypes'

/**
 * «Disponible este mes» para gastos variables, apartando primero el ahorro («págate primero»):
 * - `budget`: ingresos del mes (IFM + IVM) − gastos fijos (GFM) − ahorro mensual deseado.
 * - `spent`: gastos variables del mes (GVM, también la cuota del mes de los que van a plazos).
 * - `available`: lo que queda, `budget − spent` (negativo si se ha pasado).
 * Sin ahorro mensual definido devuelve `null`: no hay con qué calcularlo.
 */
export function monthlyBudget(flows, savingsTarget, today) {
  if (savingsTarget === null || savingsTarget === undefined) return null
  const totals = monthTotals(flows, today)
  const cents = (value) => Math.round(Number(value) * 100)
  const budget = cents(totals.IFM) + cents(totals.IVM) - cents(totals.GFM) - cents(savingsTarget)
  const spent = cents(totals.GVM)
  return { budget: budget / 100, spent: spent / 100, available: (budget - spent) / 100 }
}
