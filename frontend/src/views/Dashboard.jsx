import { useState } from 'react'

import { api } from '@/api/client'
import { ActionBar } from '@/components/ActionBar'
import { FlowButtons } from '@/components/FlowButtons'
import { FlowDialog } from '@/components/FlowDialog'
import { GranularitySelector } from '@/components/GranularitySelector'
import { HistoryTable } from '@/components/HistoryTable'
import { NetWorthChart } from '@/components/NetWorthChart'
import { useApiQuery, useFinanceData } from '@/hooks/useFinanceData'
import { formatEUR, toISODate } from '@/lib/format'
import { cn } from '@/lib/utils'

function CurrentNetWorth() {
  const { version } = useFinanceData()
  const { data } = useApiQuery(() => {
    const today = toISODate(new Date())
    return api.getProjection({ granularity: 'D', start: today, end: today })
  }, [version])
  const balance = data?.points[0]?.balance

  return (
    <div className="grid gap-1">
      <p className="text-muted-foreground text-sm">Patrimonio hoy</p>
      <p
        className={cn(
          'text-3xl font-semibold tracking-tight tabular-nums md:text-4xl',
          Number(balance) < 0 && 'text-expense',
        )}
      >
        {balance === undefined ? '—' : formatEUR(balance)}
      </p>
    </div>
  )
}

/**
 * Pantalla principal. En móvil: gráfica y debajo los 4 botones apilados.
 * En PC: botones arriba, gráfica y justo debajo el histórico (solo PC).
 */
export function Dashboard() {
  const [granularity, setGranularity] = useState('M')
  const [dialog, setDialog] = useState({ open: false, flow: null, type: 'GVM', key: 0 })

  const openDialog = (changes) => setDialog((current) => ({ ...current, ...changes, open: true, key: current.key + 1 }))
  const openCreate = (type = 'GVM') => openDialog({ flow: null, type })
  const openEdit = (flow) => openDialog({ flow, type: flow.flow_type })

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-4 pt-6 pb-28 md:px-6 md:pt-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-3">
          <h1 className="text-muted-foreground text-xs font-semibold tracking-[0.2em] uppercase">Finan</h1>
          <CurrentNetWorth />
        </div>
        <GranularitySelector value={granularity} onChange={setGranularity} />
      </header>

      <main className="flex flex-col gap-4 md:gap-6">
        <NetWorthChart granularity={granularity} />
        <FlowButtons onSelect={openCreate} className="md:order-first" />
        <HistoryTable onEdit={openEdit} className="hidden md:flex" />
      </main>

      <ActionBar onAdd={() => openCreate()} />

      <FlowDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
        flow={dialog.flow}
        defaultType={dialog.type}
        formKey={dialog.key}
      />
    </div>
  )
}
