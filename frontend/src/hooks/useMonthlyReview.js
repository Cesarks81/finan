import { api } from '@/api/client'
import { useFinanceData } from '@/hooks/useFinanceData'
import { usePersistentState } from '@/hooks/usePersistentState'
import { monthKey, reviewDone } from '@/lib/review'

/**
 * Si toca la revisión de este mes: hay flujos, aún no se ha anclado el patrimonio este mes y no
 * se ha pospuesto («Este mes no», que dura hasta el mes siguiente). Posponerla se guarda en los
 * ajustes (`review_skipped`), así que vale en todos los dispositivos; y también en este, para que
 * el aviso se vaya al momento sin volver a cargar los datos.
 */
export function useMonthlyReview() {
  const { flows, settings, projections } = useFinanceData()
  const [skippedHere, setSkippedHere] = usePersistentState('finan-review-skipped', null)
  const month = monthKey()
  const skipped = skippedHere === month || settings.data?.review_skipped === month
  const ready = Boolean(flows.data && settings.data) && projections.data?.todayBalance !== undefined
  const pending = ready && flows.data.length > 0 && !reviewDone(settings.data) && !skipped

  function skip() {
    setSkippedHere(month)
    // Sin conexión, al menos queda pospuesta en este dispositivo.
    api.patchSettings({ review_skipped: month }).catch(() => {})
  }

  return { pending, skip }
}
