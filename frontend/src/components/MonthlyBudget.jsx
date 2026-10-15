import { useFinanceData } from '@/hooks/useFinanceData'
import { monthlyBudget } from '@/lib/budget'
import { formatEURWhole } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * «Disponible este mes» para gastos variables (`lib/budget.js`). En móvil, una línea centrada
 * bajo el patrimonio; en PC (`pill`), una pastilla en el encabezado. Si no hay ahorro mensual
 * definido, invita a definirlo (`onSetup` abre Ajustes).
 */
export function MonthlyBudget({ pill = false, onSetup, className }) {
  const { flows, settings } = useFinanceData()
  if (!flows.data || !settings.data) return null
  const budget = monthlyBudget(flows.data, settings.data.savings_target)

  const box = cn(
    'flex items-center gap-2.5 text-[13px]',
    pill ? 'rounded-full border bg-card px-3.5 py-1.5' : 'flex-col gap-1.5',
    className,
  )

  if (!budget) {
    return (
      <button type="button" onClick={onSetup} className={cn(box, 'text-muted-foreground hover:text-foreground underline-offset-4 hover:underline')}>
        ¿Cuánto quieres ahorrar al mes?
      </button>
    )
  }

  const { budget: total, available } = budget
  const over = available < 0
  const noRoom = total <= 0
  // La barra muestra lo que queda del presupuesto: llena al empezar el mes, vacía al gastarlo.
  const left = noRoom || over ? 1 : Math.min(1, available / total)

  return (
    <div className={box} title="Ingresos del mes − gastos fijos − ahorro mensual − gastos variables ya hechos">
      <p className="text-muted-foreground m-0">
        {noRoom ? (
          <span className="text-expense">Sin margen para gastos variables este mes</span>
        ) : over ? (
          <>
            Este mes te has pasado{' '}
            <span className="text-expense font-semibold tabular-nums">{formatEURWhole(-available)}</span>
          </>
        ) : (
          <>
            Disponible este mes{' '}
            <span className="text-foreground font-semibold tabular-nums">{formatEURWhole(available)}</span>{' '}
            <span className="tabular-nums">{pill ? '/' : 'de'} {formatEURWhole(total)}</span>
          </>
        )}
      </p>
      <div aria-hidden="true" className={cn('bg-border h-1 overflow-hidden rounded-full', pill ? 'w-16' : 'w-44')}>
        <div
          className={cn('h-1 rounded-full', noRoom || over ? 'bg-expense' : 'bg-income')}
          style={{ width: `${left * 100}%` }}
        />
      </div>
    </div>
  )
}
