import { useCallback, useMemo, useState } from 'react'

import { FinanceDataContext, useApiQuery } from '@/hooks/useFinanceData'
import { fetchAllProjections } from '@/lib/projections'

/**
 * Datos compartidos del dashboard. Las tres vistas de la gráfica (D, M, A) se cargan juntas
 * al entrar y quedan en memoria, así que cambiar de vista es instantáneo. Solo se vuelven a
 * pedir cuando cambian los datos (`refresh`), y mientras llegan se siguen mostrando las anteriores.
 */
export function FinanceDataProvider({ children }) {
  const [version, setVersion] = useState(0)
  const refresh = useCallback(() => setVersion((v) => v + 1), [])
  const projections = useApiQuery(fetchAllProjections, [version])

  const value = useMemo(() => ({ version, refresh, projections }), [version, refresh, projections])
  return <FinanceDataContext.Provider value={value}>{children}</FinanceDataContext.Provider>
}
