import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

const OPTIONS = [
  { value: 'D', label: 'Días' },
  { value: 'M', label: 'Meses' },
  { value: 'A', label: 'Años' },
]

/** Selector compacto D/M/A que se superpone en la esquina inferior derecha de la gráfica. */
export function GranularitySelector({ value, onChange, className }) {
  return (
    <ToggleGroup
      type="single"
      size="sm"
      value={value}
      // Radix permite deseleccionar el botón activo; se ignora para que siempre haya uno.
      onValueChange={(next) => next && onChange(next)}
      aria-label="Resolución de la gráfica"
      className={cn('bg-background/80 gap-0.5 rounded-full border p-0.5 shadow-xs backdrop-blur', className)}
    >
      {OPTIONS.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          aria-label={option.label}
          title={option.label}
          className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-7 w-8 min-w-8 rounded-full text-xs font-semibold first:rounded-full last:rounded-full"
        >
          {option.value}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
