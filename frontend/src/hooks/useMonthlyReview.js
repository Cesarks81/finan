import { useFinanceData } from '@/hooks/useFinanceData'
import { usePersistentState } from '@/hooks/usePersistentState'
import { monthKey, reviewDone } from '@/lib/review'

/**
 * Si toca la revisión de este mes: hay flujos, aún no se ha anclado el patrimonio este mes y no
 * se ha pospuesto en este dispositivo («Este mes no», que dura hasta el mes siguiente).
 */
export function useMonthlyReview() {
  const { flows, settings, projections } = useFinanceData()
  const [skipped, setSkipped] = usePersistentState('finan-review-skipped', null)
  const ready = Boolean(flows.data && settings.data) && projections.data?.todayBalance !== undefined
  const pending = ready && flows.data.length > 0 && !reviewDone(settings.data) && skipped !== monthKey()
  return { pending, skip: () => setSkipped(monthKey()) }
}
