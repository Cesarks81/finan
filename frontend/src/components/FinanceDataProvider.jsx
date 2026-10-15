import { useCallback, useMemo, useState } from 'react'

import { api } from '@/api/client'
import { FinanceDataContext, useApiQuery } from '@/hooks/useFinanceData'
import { usePersistentState } from '@/hooks/usePersistentState'
import { fetchAllProjections } from '@/lib/projections'

/**
 * Datos compartidos del dashboard. Las tres vistas de la gráfica (D, M, A) se cargan juntas
 * al entrar y quedan en memoria, así que cambiar de vista es instantáneo. Solo se vuelven a
 * pedir cuando cambian los datos (`refresh`), y mientras llegan se siguen mostrando las anteriores.
 * La lista de flujos se carga igual y la comparten el Historial y los botones de flujo, y
 * también el patrimonio inicial, para que Ajustes se abra sin esperas.
 *
 * También guarda las preferencias de la gráfica (por dispositivo): `splitLines` (ingresos y
 * gastos por separado) y `forward` (vista hacia delante, que cambia las ventanas pedidas).
 */
export function FinanceDataProvider({ children }) {
  const [version, setVersion] = useState(0)
  const refresh = useCallback(() => setVersion((v) => v + 1), [])
  const [splitLines, setSplitLines] = usePersistentState('finan-chart-split', false)
  const [forward, setForward] = usePersistentState('finan-chart-forward', false)
  const projections = useApiQuery(() => fetchAllProjections({ forward }), [version, forward])
  const flows = useApiQuery(api.listFlows, [version])
  const settings = useApiQuery(api.getSettings, [version])

  const value = useMemo(
    () => ({
      version,
      refresh,
      projections,
      flows,
      settings,
      chart: { splitLines, setSplitLines, forward, setForward },
    }),
    [version, refresh, projections, flows, settings, splitLines, setSplitLines, forward, setForward],
  )
  return <FinanceDataContext.Provider value={value}>{children}</FinanceDataContext.Provider>
}
