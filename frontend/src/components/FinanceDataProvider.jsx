import { useCallback, useMemo, useState } from 'react'

import { api } from '@/api/client'
import { FinanceDataContext, useApiQuery } from '@/hooks/useFinanceData'
import { usePersistentState } from '@/hooks/usePersistentState'
import { inRealTerms } from '@/lib/inflation'
import { investmentOf, monthlySurplus, portfolio, withInvestments } from '@/lib/investment'
import { fetchAllProjections } from '@/lib/projections'

/**
 * Datos compartidos del dashboard. Las tres vistas de la gráfica (D, M, A) se cargan juntas
 * al entrar y quedan en memoria, así que cambiar de vista es instantáneo. Solo se vuelven a
 * pedir cuando cambian los datos (`refresh`), y mientras llegan se siguen mostrando las anteriores.
 * La lista de flujos se carga igual y la comparten el Historial y los botones de flujo, y
 * también los ajustes y el historial de revisiones, para que Ajustes se abra sin esperas.
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
  const flows = useApiQuery(api.listFlows, [version])
  const settings = useApiQuery(api.getSettings, [version])
  const reviews = useApiQuery(api.listReviews, [version])
  const investmentRows = useApiQuery(api.listInvestments, [version])
  // Lo que sobra cada mes según los flujos (el tope de las aportaciones a las inversiones), para
  // cualquier mes desde que se guardó cada inversión.
  const surplus = useMemo(() => (flows.data ? monthlySurplus(flows.data) : null), [flows.data])
  // Inversiones en números (`investmentOf`) y la cartera (`portfolio`: lo que vale cada una y lo
  // que rinden), con lo que sobra cada mes repartido entre sus aportaciones.
  const investments = useMemo(
    () => ({ ...investmentRows, list: investmentRows.data?.map(investmentOf) ?? null }),
    [investmentRows],
  )
  const wallet = useMemo(
    () => (investments.list && surplus ? portfolio(investments.list, surplus) : null),
    [investments.list, surplus],
  )
  // Sobre lo que da la API: la rentabilidad de las inversiones y, con «Euros de hoy», la
  // inflación. Hasta tener los ajustes y las inversiones (y, si hay alguna, los flujos) no se da
  // ninguna proyección, para no dibujar primero la línea sin la rentabilidad.
  const projections = useMemo(() => {
    if (!nominal.data) return nominal
    const waiting = { ...nominal, data: null, loading: true }
    if (!settings.data) return settings.error ? nominal : waiting
    const list = investments.list ?? []
    if (!investments.list && !investments.error) return waiting
    if (list.length && !surplus && !flows.error) return waiting
    let data = nominal.data
    if (list.length && surplus) data = withInvestments(data, list, settings.data.balance_date, surplus)
    if (realTerms) data = inRealTerms(data, inflation / 100)
    return { ...nominal, data }
  }, [nominal, settings.data, settings.error, investments, surplus, flows.error, realTerms, inflation])

  const value = useMemo(
    () => ({
      version,
      refresh,
      projections,
      flows,
      settings,
      reviews,
      investments,
      wallet,
      surplus,
      chart: { splitLines, setSplitLines, calendar, setCalendar, realTerms, setRealTerms, inflation, setInflation },
    }),
    [
      version,
      refresh,
      projections,
      flows,
      settings,
      reviews,
      investments,
      wallet,
      surplus,
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
