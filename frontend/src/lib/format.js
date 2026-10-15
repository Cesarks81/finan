const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })
const compactNumber = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 })
const dayMonth = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' })
const fullDate = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
const monthShort = new Intl.DateTimeFormat('es-ES', { month: 'short', year: '2-digit' })
const monthLong = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' })

const percentSigned = new Intl.NumberFormat('es-ES', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
})

export const formatEUR = (value) => eur.format(Number(value))
const eurWhole = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
/** Importe redondeado al euro, para cifras de un vistazo: «140 €». */
export const formatEURWhole = (value) => eurWhole.format(Number(value))
const pointsSigned = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
})

/** Diferencia entre dos proporciones (0,278) en puntos porcentuales: «+27,8 p.p.». */
export const formatPointsSigned = (ratio) => `${pointsSigned.format(ratio * 100)} p.p.`
/** Proporción (0,132) como porcentaje con signo: «+13,2 %». */
export const formatPercentSigned = (ratio) => percentSigned.format(ratio)
/** Importe abreviado para los ejes, con K y M en vez de «mil» y «M»: «500 €», «12,5K €», «1,2M €». */
export function formatEURCompact(value) {
  const amount = Number(value)
  const size = Math.abs(amount)
  if (size >= 1e6) return `${compactNumber.format(amount / 1e6)}M €`
  if (size >= 1e3) return `${compactNumber.format(amount / 1e3)}K €`
  return `${compactNumber.format(amount)} €`
}

/** 'YYYY', 'YYYY-MM' o 'YYYY-MM-DD' → Date local (sin desfase de zona horaria). */
export function parseISODate(value) {
  const [year, month = 1, day = 1] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** Date → 'YYYY-MM-DD' en hora local. */
export function toISODate(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export const formatDate = (value) => fullDate.format(parseISODate(value))

/** «octubre de 2026» (por defecto, el mes en curso). */
export const formatMonth = (date = new Date()) => monthLong.format(date)

export function addDays(date, days) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1)
}

/** Etiqueta legible de un periodo de /projection según la granularidad D, M o A. */
export function formatPeriod(period, granularity, { long = false } = {}) {
  if (granularity === 'A') return period
  const date = parseISODate(period)
  if (granularity === 'M') return (long ? monthLong : monthShort).format(date)
  return (long ? fullDate : dayMonth).format(date)
}

/** Etiqueta del periodo que contiene hoy, en el mismo formato que devuelve la API. */
export function currentPeriod(granularity, today = new Date()) {
  const iso = toISODate(today)
  return { D: iso, M: iso.slice(0, 7), A: iso.slice(0, 4) }[granularity]
}
