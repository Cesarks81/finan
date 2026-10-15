import { parseISODate, toISODate } from '@/lib/format'

/**
 * Revisión mensual: se da por hecha si el patrimonio inicial está fechado en el mes en curso
 * (o después), porque «Ajustar al saldo real» lo ancla hoy. Así cuenta también fijarlo a mano
 * en Ajustes.
 */
export function reviewDone(settings, today = new Date()) {
  if (!settings?.balance_date) return false
  return settings.balance_date >= toISODate(new Date(today.getFullYear(), today.getMonth(), 1))
}

/** 'YYYY-MM' del mes en curso, para recordar en el dispositivo que se pospuso este mes. */
export const monthKey = (today = new Date()) => toISODate(today).slice(0, 7)

/**
 * Compara el saldo real con el previsto. `previous` es la fecha del último ancla (si la hay):
 * si falta dinero y han pasado días desde entonces, `perDay` reparte la diferencia entre ellos.
 */
export function reviewDiff(real, forecast, previous = null, today = new Date()) {
  const diff = Math.round((real - forecast) * 100) / 100
  let days = null
  if (previous) {
    const from = parseISODate(previous)
    const now = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    days = Math.round((now - from) / 86_400_000) + 1
  }
  const perDay = diff < 0 && days && days >= 2 ? -diff / days : null
  return { diff, days, perDay }
}

/**
 * Patrimonio inicial que hay que guardar (anclado hoy, «al empezar el día») para que hoy, con los
 * flujos de hoy ya hechos, el patrimonio sea `real`: se le quitan los movimientos del día.
 */
export function anchorForToday(real, todayPoint) {
  const net = todayPoint ? Number(todayPoint.income) - Number(todayPoint.expense) : 0
  return Math.round((real - net) * 100) / 100
}
