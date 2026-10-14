import { useState } from 'react'
import { Settings } from 'lucide-react'

import { api } from '@/api/client'
import { FlowButtons } from '@/components/FlowButtons'
import { FlowDialog } from '@/components/FlowDialog'
import { HistoryTable } from '@/components/HistoryTable'
import { NetWorthChart } from '@/components/NetWorthChart'
import { SettingsDialog } from '@/components/SettingsDialog'
import { Button } from '@/components/ui/button'
import { useApiQuery, useFinanceData } from '@/hooks/useFinanceData'
import { formatEUR, toISODate } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Patrimonio total a día de hoy. En PC lleva la etiqueta visible; en móvil, solo la cifra. */
function PortfolioValue() {
  const { version } = useFinanceData()
  const { data } = useApiQuery(() => {
    const today = toISODate(new Date())
    return api.getProjection({ granularity: 'D', start: today, end: today })
  }, [version])
  const balance = data?.points[0]?.balance

  return (
    <p className="flex items-baseline gap-3">
      <span className="text-muted-foreground sr-only text-xs font-semibold tracking-[0.15em] uppercase md:not-sr-only">
        Portfolio view
      </span>
      <span
        className={cn(
          'text-3xl font-semibold tracking-tight tabular-nums md:text-2xl',
          Number(balance) < 0 && 'text-expense',
        )}
      >
        {balance === undefined ? '—' : formatEUR(balance)}
      </span>
    </p>
  )
}

/**
 * Pantalla principal.
 * - PC: encabezado con `finan` a la izquierda y el patrimonio + ajustes a la derecha; debajo,
 *   dos columnas: gráfica e History a la izquierda, los 4 botones de flujo a la derecha.
 * - Móvil: encabezado solo con el patrimonio (y ajustes), gráfica a todo el ancho y los
 *   4 botones apilados debajo. History no se muestra.
 */
export function Dashboard() {
  const [dialog, setDialog] = useState({ open: false, flow: null, type: 'GVM', key: 0 })
  const [settingsOpen, setSettingsOpen] = useState(false)

  const openDialog = (changes) => setDialog((current) => ({ ...current, ...changes, open: true, key: current.key + 1 }))
  const openCreate = (type) => openDialog({ flow: null, type })
  const openEdit = (flow) => openDialog({ flow, type: flow.flow_type })

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-6 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] md:gap-8 md:px-6 md:pt-8">
      <header className="relative flex min-h-10 items-center justify-center px-12 md:justify-between md:px-0">
        <h1 className="sr-only text-2xl font-bold tracking-tight md:not-sr-only">finan</h1>
        <div className="flex items-center gap-4">
          <PortfolioValue />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSettingsOpen(true)}
            aria-label="Ajustes"
            title="Ajustes"
            className="absolute top-1/2 right-0 -translate-y-1/2 md:static md:translate-y-0"
          >
            <Settings className="size-5" />
          </Button>
        </div>
      </header>

      <main className="grid gap-6 md:grid-cols-[minmax(0,1fr)_15rem] md:grid-rows-[auto_auto] lg:grid-cols-[minmax(0,1fr)_18rem]">
        <NetWorthChart className="md:col-start-1 md:row-start-1" />
        <FlowButtons onSelect={openCreate} className="md:col-start-2 md:row-start-1" />
        <HistoryTable onEdit={openEdit} className="hidden md:col-start-1 md:row-start-2 md:flex" />
      </main>

      <FlowDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
        flow={dialog.flow}
        defaultType={dialog.type}
        formKey={dialog.key}
      />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}
