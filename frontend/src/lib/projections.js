import { api } from '@/api/client'
import { addDays, addMonths, toISODate } from '@/lib/format'

export const GRANULARITIES = ['D', 'M', 'A']

// Ventana que se pide a la API para cada vista: un poco de pasado y la proyección futura.
// En D y M «hoy» cae justo a 1/3 del ancho (15 de 45 días, 6 de 18 meses), así que la línea
// de «Hoy» no se mueve al cambiar entre ellas; en A queda más a la izquierda (2 de 10 años).
// La de días incluye hoy, así que de ella sale también el patrimonio actual.
const RANGES = {
  D: { start: (t) => addDays(t, -15), end: (t) => addDays(t, 30) },
  M: { start: (t) => addMonths(t, -6), end: (t) => addMonths(t, 12) },
  A: { start: (t) => new Date(t.getFullYear() - 2, 0, 1), end: (t) => new Date(t.getFullYear() + 8, 11, 31) },
}

/** Pide a la vez las tres vistas de la gráfica: `{ D, M, A, todayBalance }`. */
export async function fetchAllProjections() {
  const today = new Date()
  const results = await Promise.all(
    GRANULARITIES.map((granularity) =>
      api.getProjection({
        granularity,
        start: toISODate(RANGES[granularity].start(today)),
        end: toISODate(RANGES[granularity].end(today)),
      }),
    ),
  )
  const byGranularity = Object.fromEntries(GRANULARITIES.map((granularity, i) => [granularity, results[i]]))
  const todayBalance = byGranularity.D.points.find((p) => p.period === toISODate(today))?.balance
  return { ...byGranularity, todayBalance }
}
