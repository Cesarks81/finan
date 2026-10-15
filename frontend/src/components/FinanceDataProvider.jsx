import { useCallback, useMemo, useState } from 'react'

import { api } from '@/api/client'
import { FinanceDataContext, useApiQuery } from '@/hooks/useFinanceData'
import { fetchAllProjections } from '@/lib/projections'

/**
 * Datos compartidos del dashboard. Las tres vistas de la gráfica (D, M, A) se cargan juntas
 * al entrar y quedan en memoria, así que cambiar de vista es instantáneo. Solo se vuelven a
 * pedir cuando cambian los datos (`refresh`), y mientras llegan se siguen mostrando las anteriores.
 * La lista de flujos se carga igual y la comparten el Historial y los botones de flujo, y
 * también el patrimonio inicial, para que Ajustes se abra sin esperas.
 */
export function FinanceDataProvider({ children }) {
  const [version, setVersion] = useState(0)
  const refresh = useCallback(() => setVersion((v) => v + 1), [])
  const projections = useApiQuery(fetchAllProjections, [version])
  const flows = useApiQuery(api.listFlows, [version])
  const settings = useApiQuery(api.getSettings, [version])

  const value = useMemo(
    () => ({ version, refresh, projections, flows, settings }),
    [version, refresh, projections, flows, settings],
  )
  return <FinanceDataContext.Provider value={value}>{children}</FinanceDataContext.Provider>
}
