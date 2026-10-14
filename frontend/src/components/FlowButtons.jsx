import { Button } from '@/components/ui/button'
import { FLOW_ORDER, FLOW_TYPES } from '@/lib/flowTypes'
import { cn } from '@/lib/utils'

export function FlowButtons({ onSelect, className }) {
  return (
    <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4', className)}>
      {FLOW_ORDER.map((code) => {
        const type = FLOW_TYPES[code]
        const Icon = type.icon
        return (
          <Button
            key={code}
            variant="outline"
            onClick={() => onSelect(code)}
            className="h-auto justify-start gap-3 rounded-xl px-4 py-3 text-left whitespace-normal"
          >
            <span
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-full',
                type.income ? 'bg-income/15 text-income' : 'bg-expense/15 text-expense',
              )}
            >
              <Icon className="size-5" />
            </span>
            <span className="grid gap-0.5">
              <span className="font-semibold">{code}</span>
              <span className="text-muted-foreground text-xs font-normal">{type.label}</span>
            </span>
          </Button>
        )
      })}
    </div>
  )
}
