import { Button } from '@/components/ui/button'
import { useFinanceData } from '@/hooks/useFinanceData'
import { FLOW_ORDER, FLOW_TYPES, monthTotals } from '@/lib/flowTypes'
import { formatEUR, formatMonth } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Pila vertical de los 4 botones grandes de flujo (GFM, GVM, IFM, IVM), en ese orden. Cada uno
 * muestra a la izquierda el tipo y a la derecha lo que suma ese tipo en el mes en curso.
 */
export function FlowButtons({ onSelect, className }) {
  const flows = useFinanceData().flows.data
  const totals = flows && monthTotals(flows)
  const month = formatMonth()

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {FLOW_ORDER.map((code) => {
        const { name, income } = FLOW_TYPES[code]
        const total = totals?.[code]
        return (
          <Button
            key={code}
            variant="outline"
            onClick={() => onSelect(code)}
            title={total === undefined ? undefined : `Total de ${month}`}
            className="h-auto min-h-14 flex-1 justify-between gap-3 rounded-xl px-4 py-3 text-left whitespace-normal md:min-h-20"
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-lg font-bold tracking-wide">{code}</span>
              <span className="text-muted-foreground text-xs font-normal">({name})</span>
            </span>
            <span
              className={cn(
                'shrink-0 text-base font-semibold tabular-nums',
                !total ? 'text-muted-foreground' : income ? 'text-income' : 'text-expense',
              )}
            >
              {total === undefined ? '—' : `${total ? (income ? '+' : '−') : ''}${formatEUR(total)}`}
            </span>
          </Button>
        )
      })}
    </div>
  )
}
