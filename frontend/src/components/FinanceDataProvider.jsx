import { useCallback, useMemo, useState } from 'react'

import { api } from '@/api/client'
import { FinanceDataContext, useApiQuery } from '@/hooks/useFinanceData'
import { usePersistentState } from '@/hooks/usePersistentState'
import { inRealTerms } from '@/lib/inflation'
import { fetchAllProjections } from '@/lib/projections'

/**
 * Datos compartidos del dashboard. Las tres vistas de la gráfica (D, M, A) se cargan juntas
 * al entrar y quedan en memoria, así que cambiar de vista es instantáneo. Solo se vuelven a
 * pedir cuando cambian los datos (`refresh`), y mientras llegan se siguen mostrando las anteriores.
 * La lista de flujos se carga igual y la comparten el Historial y los botones de flujo, y
 * también el patrimonio inicial, para que Ajustes se abra sin esperas.
 *
 * También guarda las preferencias de la gráfica (por dispositivo): `splitLines` (ingresos y
 * gastos por separado), `calendar` (vista de calendario, que cambia las ventanas pedidas) y
 * `realTerms` + `inflation` («Euros de hoy»: las proyecciones se dan descontando esa inflación
 * anual, en %, sin volver a pedirlas).
 */
export function FinanceDataProvider({ children }) {
  const [version, setVersion] = useState(0)
  const refresh = useCallback(() => setVersion((v) => v + 1), [])
  const [splitLines, setSplitLines] = usePersistentState('finan-chart-split', false)
  // La clave conserva el nombre de la primera versión del ajuste («Vista hacia delante»).
  const [calendar, setCalendar] = usePersistentState('finan-chart-forward', false)
  const [realTerms, setRealTerms] = usePersistentState('finan-chart-real', false)
  const [inflation, setInflation] = usePersistentState('finan-chart-inflation', 2)
  const nominal = useApiQuery(() => fetchAllProjections({ calendar }), [version, calendar])
  const projections = useMemo(
    () => (realTerms && nominal.data ? { ...nominal, data: inRealTerms(nominal.data, inflation / 100) } : nominal),
    [nominal, realTerms, inflation],
  )
  const flows = useApiQuery(api.listFlows, [version])
  const settings = useApiQuery(api.getSettings, [version])

  const value = useMemo(
    () => ({
      version,
      refresh,
      projections,
      flows,
      settings,
      chart: { splitLines, setSplitLines, calendar, setCalendar, realTerms, setRealTerms, inflation, setInflation },
    }),
    [
      version,
      refresh,
      projections,
      flows,
      settings,
      splitLines,
      setSplitLines,
      calendar,
      setCalendar,
      realTerms,
      setRealTerms,
      inflation,
      setInflation,
    ],
  )
  return <FinanceDataContext.Provider value={value}>{children}</FinanceDataContext.Provider>
}
