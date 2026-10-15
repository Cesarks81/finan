import { api } from '@/api/client'
import { addDays, addMonths, toISODate } from '@/lib/format'

export const GRANULARITIES = ['D', 'M', 'A']

// Ventana que se pide a la API para cada vista. Las dos incluyen hoy en la de días, así que
// de ella sale también el patrimonio actual.
const RANGES = {
  // Por defecto, un poco de pasado y la proyección futura. En D y M «hoy» cae justo a 1/3 del
  // ancho (15 de 45 días, 6 de 18 meses), así que la línea de «Hoy» no se mueve al cambiar
  // entre ellas; en A queda más a la izquierda (2 de 10 años).
  centered: {
    D: { start: (t) => addDays(t, -15), end: (t) => addDays(t, 30) },
    M: { start: (t) => addMonths(t, -6), end: (t) => addMonths(t, 12) },
    A: { start: (t) => new Date(t.getFullYear() - 2, 0, 1), end: (t) => new Date(t.getFullYear() + 8, 11, 31) },
  },
  // Ajuste «Vista de calendario»: D, el mes en curso del día 1 al último; M, el año en curso de
  // enero a diciembre; A, 25 años desde el actual. «Hoy» queda donde cae en cada uno.
  calendar: {
    D: { start: (t) => new Date(t.getFullYear(), t.getMonth(), 1), end: (t) => new Date(t.getFullYear(), t.getMonth() + 1, 0) },
    M: { start: (t) => new Date(t.getFullYear(), 0, 1), end: (t) => new Date(t.getFullYear(), 11, 31) },
    A: { start: (t) => new Date(t.getFullYear(), 0, 1), end: (t) => new Date(t.getFullYear() + 24, 11, 31) },
  },
}

/**
 * Pide a la vez las tres vistas de la gráfica: `{ D, M, A, todayBalance }`. Con `calendar`,
 * las ventanas son el mes y el año en curso (ajuste «Vista de calendario»).
 */
export async function fetchAllProjections({ calendar = false } = {}) {
  const today = new Date()
  const ranges = RANGES[calendar ? 'calendar' : 'centered']
  const results = await Promise.all(
    GRANULARITIES.map((granularity) =>
      api.getProjection({
        granularity,
        start: toISODate(ranges[granularity].start(today)),
        end: toISODate(ranges[granularity].end(today)),
      }),
    ),
  )
  const byGranularity = Object.fromEntries(GRANULARITIES.map((granularity, i) => [granularity, results[i]]))
  const todayBalance = byGranularity.D.points.find((p) => p.period === toISODate(today))?.balance
  return { ...byGranularity, todayBalance }
}
