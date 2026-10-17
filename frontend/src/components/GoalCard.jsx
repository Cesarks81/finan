import { Target } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { useFinanceData } from '@/hooks/useFinanceData'
import { formatEURWhole, formatMonthYear } from '@/lib/format'
import { extraInvestedShift, extraSavingShift, goalBasis, goalForecast, goalPoints, goalToday } from '@/lib/goal'
import { cn } from '@/lib/utils'

/** Fecha prevista del objetivo en texto: «abril de 2029», o lo que corresponda si no hay fecha. */
function goalWhen(forecast, { long = true } = {}) {
  if (forecast.reached) return null
  return forecast.month ? formatMonthYear(forecast.month, { long }) : null
}

/**
 * Tarjeta del objetivo (PC): progreso, cuándo se llega y cuándo se llegaría ahorrando 100 €/mes
 * más, con todo el patrimonio o solo con lo invertido (`goalBasis`). Sin objetivo, invita a
 * definirlo (`onEdit` abre Ajustes).
 */
export function GoalCard({ onEdit, className }) {
  const { settings, projections, surplus, investments } = useFinanceData()
  const goal = settings.data?.goal_amount
  const basis = goalBasis(settings.data)
  const long = projections.data?.long
  const today = projections.data ? goalToday(projections.data, basis) : undefined

  if (!settings.data || !long || today === undefined) return null

  if (!goal) {
    return (
      <Card className={cn('gap-2 px-5 py-4', className)}>
        <p className="m-0 flex items-center gap-2 text-sm font-semibold">
          <Target className="text-chart-1 size-4" aria-hidden="true" /> Objetivo
        </p>
        <p className="text-muted-foreground m-0 text-xs leading-relaxed">
          Ahorrar para algo concreto (un colchón, la entrada de un piso…) te dice cuándo llegas y cuánto te
          retrasa cada capricho.
        </p>
        <button type="button" onClick={onEdit} className="text-chart-1 self-start text-xs font-medium hover:underline">
          Definir objetivo
        </button>
      </Card>
    )
  }

  // «Con 100 €/mes más»: con inversiones, esos euros también pueden completar aportaciones y rendir.
  // Si solo cuenta lo invertido, solo suma la parte que llega a invertirse (y lo que rinde).
  const invested = surplus && investments.list?.length ? investments.list : null
  const extraShift = !invested
    ? null
    : basis === 'invested'
      ? extraInvestedShift(invested, surplus)
      : extraSavingShift(invested, settings.data.balance_date, surplus, long.at(-1).period)
  const forecast = goalForecast(goalPoints(long, basis), goal, today, basis === 'invested' ? 0 : 100, extraShift)
  const when = goalWhen(forecast)
  const withExtra = forecast.monthWithExtra && forecast.monthWithExtra !== forecast.month

  return (
    <Card className={cn('gap-2.5 px-5 py-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="m-0 flex min-w-0 items-center gap-2 text-sm font-semibold">
          <Target className="text-chart-1 size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{settings.data.goal_name || 'Objetivo'}</span>
        </p>
        <button type="button" onClick={onEdit} className="text-chart-1 text-xs hover:underline">
          Editar
        </button>
      </div>
      <p className="text-muted-foreground m-0 text-[13px] tabular-nums">
        <span className="text-foreground font-semibold">{formatEURWhole(Math.max(0, today))}</span>
        {basis === 'invested' && ' invertidos'} de {formatEURWhole(goal)} · {Math.round(forecast.progress * 100)} %
      </p>
      <div aria-hidden="true" className="bg-border h-1.5 overflow-hidden rounded-full">
        <div className="bg-chart-1 h-1.5 rounded-full" style={{ width: `${forecast.progress * 100}%` }} />
      </div>
      {forecast.reached ? (
        <p className="text-income m-0 text-sm font-medium">¡Objetivo conseguido!</p>
      ) : when ? (
        <>
          <p className="m-0 text-sm">
            Llegas en <span className="font-semibold">{when}</span>
          </p>
          {withExtra && (
            <p className="text-muted-foreground m-0 text-xs">
              Con 100 €/mes más, en {formatMonthYear(forecast.monthWithExtra, { long: true })}.
            </p>
          )}
        </>
      ) : (
        <p className="text-expense m-0 text-sm">A este ritmo no llegas en 40 años.</p>
      )}
    </Card>
  )
}
