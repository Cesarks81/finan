import { GripVertical } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { FLOW_ORDER, FLOW_TYPES } from '@/lib/flowTypes'
import { cn } from '@/lib/utils'

/** Pila vertical de los 4 botones grandes de flujo (GFM, GVM, IFM, IVM), en ese orden. */
export function FlowButtons({ onSelect, className }) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {FLOW_ORDER.map((code) => (
        <Button
          key={code}
          variant="outline"
          onClick={() => onSelect(code)}
          className="relative h-auto min-h-14 flex-1 flex-col gap-0.5 rounded-xl px-10 py-3 whitespace-normal md:min-h-20"
        >
          <GripVertical aria-hidden className="text-muted-foreground absolute top-1/2 left-3 size-5 -translate-y-1/2" />
          <span className="text-lg font-bold tracking-wide">{code}</span>
          <span className="text-muted-foreground text-xs font-normal">({FLOW_TYPES[code].name})</span>
        </Button>
      ))}
    </div>
  )
}
