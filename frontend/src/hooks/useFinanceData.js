import { createContext, useContext, useEffect, useState } from 'react'

export const FinanceDataContext = createContext(null)

/**
 * `version` cambia cada vez que se crea, edita o elimina un flujo; los componentes
 * que leen de la API la incluyen en sus dependencias para recargarse.
 */
export function useFinanceData() {
  const context = useContext(FinanceDataContext)
  if (!context) throw new Error('useFinanceData debe usarse dentro de <FinanceDataProvider>')
  return context
}

/** Ejecuta `fetcher` cuando cambian `deps`; conserva los datos previos mientras recarga. */
export function useApiQuery(fetcher, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true })

  // Las dependencias las decide quien llama, igual que en un useEffect normal.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let active = true
    setState((current) => ({ ...current, loading: true }))
    fetcher().then(
      (data) => active && setState({ data, error: null, loading: false }),
      (error) => active && setState((current) => ({ ...current, error, loading: false })),
    )
    return () => {
      active = false
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return state
}
