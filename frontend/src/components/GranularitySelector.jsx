import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const OPTIONS = [
  { value: 'D', label: 'Días' },
  { value: 'M', label: 'Meses' },
  { value: 'A', label: 'Años' },
]

export function GranularitySelector({ value, onChange }) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      value={value}
      // Radix permite deseleccionar el botón activo; se ignora para que siempre haya uno.
      onValueChange={(next) => next && onChange(next)}
      aria-label="Resolución de la gráfica"
      className="bg-background"
    >
      {OPTIONS.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          aria-label={option.label}
          title={option.label}
          className="w-11 font-semibold"
        >
          {option.value}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
