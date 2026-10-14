import { Moon, Plus, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useTheme } from '@/hooks/useTheme'

/** Barra flotante inferior: cambio de tema y alta rápida de un flujo. */
export function ActionBar({ onAdd }) {
  const { theme, toggleTheme } = useTheme()
  const dark = theme === 'dark'

  return (
    <nav
      aria-label="Acciones"
      className="bg-background/80 fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border p-1.5 shadow-lg backdrop-blur"
    >
      <Button
        variant="ghost"
        size="icon-lg"
        className="rounded-full"
        onClick={toggleTheme}
        aria-label={dark ? 'Activar modo luz' : 'Activar modo noche'}
        title={dark ? 'Modo luz' : 'Modo noche'}
      >
        {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
      </Button>
      <Button size="icon-lg" className="rounded-full" onClick={onAdd} aria-label="Añadir flujo" title="Añadir flujo">
        <Plus className="size-5" />
      </Button>
    </nav>
  )
}
