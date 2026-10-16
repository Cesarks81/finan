import { useCallback, useMemo, useState } from 'react'

import { api } from '@/api/client'
import { FinanceDataContext, useApiQuery } from '@/hooks/useFinanceData'
import { usePersistentState } from '@/hooks/usePersistentState'
import { inRealTerms } from '@/lib/inflation'
import { investmentOf, investmentValue, monthlySurplus, withInvestment } from '@/lib/investment'
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
  const flows = useApiQuery(api.listFlows, [version])
  const settings = useApiQuery(api.getSettings, [version])
  // Lo que sobra cada mes según los flujos (el tope de cada aportación a la inversión), para
  // cualquier mes desde que se guardó la inversión.
  const surplus = useMemo(() => (flows.data ? monthlySurplus(flows.data) : null), [flows.data])
  // Sobre lo que da la API: la rentabilidad de la inversión (de los ajustes) y, con «Euros de
  // hoy», la inflación. Hasta tener los ajustes (y, con inversión, los flujos) no se da ninguna
  // proyección, para no dibujar primero la línea sin la inversión.
  const projections = useMemo(() => {
    if (!nominal.data) return nominal
    if (!settings.data) return settings.error ? nominal : { ...nominal, data: null, loading: true }
    const investment = investmentOf(settings.data)
    if (investment && !surplus && !flows.error) return { ...nominal, data: null, loading: true }
    let data = nominal.data
    if (investment && surplus) data = withInvestment(data, investment, settings.data.balance_date, surplus)
    if (realTerms) data = inRealTerms(data, inflation / 100)
    return { ...nominal, data }
  }, [nominal, settings.data, settings.error, surplus, flows.error, realTerms, inflation])
  // Lo que vale la inversión en una fecha (con lo aportado y rendido desde que se guardó), para
  // que Ajustes muestre su valor de hoy. Null sin inversión o sin flujos.
  const investmentValueAt = useCallback(
    (iso) => {
      const investment = investmentOf(settings.data)
      if (!investment || !surplus) return null
      return investmentValue(investment, iso, surplus)
    },
    [settings.data, surplus],
  )

  const value = useMemo(
    () => ({
      version,
      refresh,
      projections,
      flows,
      settings,
      investmentValueAt,
      surplus,
      chart: { splitLines, setSplitLines, calendar, setCalendar, realTerms, setRealTerms, inflation, setInflation },
    }),
    [
      version,
      refresh,
      projections,
      flows,
      settings,
      investmentValueAt,
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
