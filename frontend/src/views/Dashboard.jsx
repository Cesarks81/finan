import { useState } from 'react'
import { History, Settings, TrendingUp } from 'lucide-react'

import { FlowButtons } from '@/components/FlowButtons'
import { FlowDialog } from '@/components/FlowDialog'
import { GoalCard } from '@/components/GoalCard'
import { HistoryTable } from '@/components/HistoryTable'
import { InvestmentDetail } from '@/components/InvestmentDetail'
import { InvestmentDialog } from '@/components/InvestmentDialog'
import { ReviewDialog, ReviewReminder } from '@/components/MonthlyReview'
import { NetWorthChart } from '@/components/NetWorthChart'
import { SettingsDialog } from '@/components/SettingsDialog'
import { Button } from '@/components/ui/button'
import { useFinanceData } from '@/hooks/useFinanceData'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { useMonthlyReview } from '@/hooks/useMonthlyReview'
import { formatEUR } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Patrimonio total a día de hoy. En PC lleva la etiqueta visible; en móvil, solo la cifra. */
function PortfolioValue() {
  // Sale de la vista de días ya cargada para la gráfica, que incluye hoy.
  const balance = useFinanceData().projections.data?.todayBalance

  return (
    <p className="flex items-baseline gap-3">
      <span className="text-muted-foreground sr-only text-xs font-semibold tracking-[0.15em] uppercase md:not-sr-only">
        Portfolio view
      </span>
      <span
        className={cn(
          // En móvil, algo más pequeña en pantallas estrechas para no chocar con los botones.
          'text-[clamp(1.5rem,7.5vw,1.875rem)] font-semibold tracking-tight tabular-nums md:text-2xl',
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
 *   4 botones apilados debajo. Los dos botones de la izquierda del encabezado cambian los 4
 *   botones por el Historial o por las Inversiones (en el mismo hueco, sin mover la gráfica);
 *   tocar otra vez el activo vuelve a los botones.
 */
export function Dashboard() {
  const [dialog, setDialog] = useState({ open: false, flow: null, type: 'GVM', key: 0 })
  // Ajustes: `page` abre directamente una de sus pantallas (p. ej. el objetivo).
  const [settings, setSettings] = useState({ open: false, page: null, key: 0 })
  const openSettings = (page = null) => setSettings((current) => ({ open: true, page, key: current.key + 1 }))
  const [investment, setInvestment] = useState({ open: false, row: null, key: 0 })
  const openInvestment = (row) => setInvestment((current) => ({ open: true, row, key: current.key + 1 }))
  // Detalle de una inversión (mes a mes); en móvil, desde él se edita o se elimina.
  const [detail, setDetail] = useState({ open: false, row: null, key: 0 })
  const openDetail = (row) => setDetail((current) => ({ open: true, row, key: current.key + 1 }))
  const [review, setReview] = useState({ open: false, key: 0 })
  const monthlyReview = useMonthlyReview()
  const openReview = () => setReview((current) => ({ open: true, key: current.key + 1 }))
  // Solo en móvil: bajo la gráfica, los 4 botones (null), el Historial ('history') o las
  // Inversiones ('investments'). En PC se ven siempre los botones y el Historial, con pestañas.
  const [panel, setPanel] = useState(null)
  const togglePanel = (next) => setPanel((current) => (current === next ? null : next))
  const isDesktop = useIsDesktop()
  const hiddenButtons = panel !== null && !isDesktop

  const openDialog = (changes) => setDialog((current) => ({ ...current, ...changes, open: true, key: current.key + 1 }))
  const openCreate = (type) => openDialog({ flow: null, type })
  const openEdit = (flow) => openDialog({ flow, type: flow.flow_type })

  return (
    // Móvil: pantalla fija del alto de la ventana, sin scroll; la gráfica ocupa el espacio libre.
    <div className="mx-auto flex h-dvh w-full max-w-6xl flex-col gap-4 overflow-hidden px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] md:h-auto md:min-h-dvh md:gap-8 md:overflow-visible md:px-6 md:pt-8 md:pb-8">
      {/* Móvil: tres columnas (botones, patrimonio, ajustes) con las de los lados iguales, así que
          la cifra queda centrada y, si no cabe, se aparta antes que tapar los botones. */}
      <header className="relative grid min-h-10 grid-cols-[1fr_auto_1fr] items-center gap-2 md:flex md:justify-between">
        <div className="flex gap-1 justify-self-start md:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => togglePanel('history')}
            aria-pressed={panel === 'history'}
            aria-label="Historial"
            title={panel === 'history' ? 'Volver a los botones' : 'Ver historial'}
            className={cn(panel === 'history' && 'bg-accent')}
          >
            <History className="size-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => togglePanel('investments')}
            aria-pressed={panel === 'investments'}
            aria-label="Inversiones"
            title={panel === 'investments' ? 'Volver a los botones' : 'Ver inversiones'}
            className={cn(panel === 'investments' && 'bg-accent')}
          >
            <TrendingUp className="size-5" />
          </Button>
        </div>
        <h1 className="sr-only text-2xl font-bold tracking-tight md:not-sr-only">finan</h1>
        <div className="contents md:flex md:items-center md:gap-4">
          <PortfolioValue />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => openSettings()}
            aria-label="Ajustes"
            title="Ajustes"
            className="justify-self-end"
          >
            <Settings className="size-5" />
          </Button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-4 md:grid md:flex-none md:grid-cols-[minmax(0,1fr)_15rem] md:grid-rows-[auto_auto] md:gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <NetWorthChart className="min-h-0 flex-1 md:col-start-1 md:row-start-1 md:flex-none" />
        {/* Móvil: el aviso de la revisión del mes, sobre los botones (o el Historial). */}
        {!isDesktop && monthlyReview.pending && <ReviewReminder onOpen={openReview} />}
        {/* Móvil: el Historial ocupa exactamente el hueco de los botones (que siguen marcando el
            alto, invisibles) y se desplaza por dentro. En PC el envoltorio no existe (`contents`)
            y cada uno va a su celda de la rejilla. */}
        <div className="relative md:contents">
          <FlowButtons
            onSelect={openCreate}
            // Se ocultan con la opacidad del contenedor, que cambia al instante en los dos sentidos
            // (con `invisible`, la transición de los botones retrasaba el cambio), e `inert` para
            // que no se puedan tocar ni enfocar mientras tanto.
            inert={hiddenButtons}
            className={cn('md:col-start-2 md:row-start-1 md:opacity-100', hiddenButtons && 'opacity-0')}
          />
          <HistoryTable
            // En móvil, la sección la elige el botón del encabezado (sin pestañas).
            section={isDesktop ? undefined : (panel ?? 'history')}
            onEdit={openEdit}
            onOpenInvestment={openDetail}
            onEditInvestment={openInvestment}
            className={cn(
              'bg-background absolute inset-0 md:static md:col-start-1 md:row-start-2 md:flex',
              !panel && 'hidden',
            )}
          />
        </div>
        {/* PC: el aviso de la revisión del mes y la tarjeta del objetivo, en la columna de los
            botones, a la altura del Historial. */}
        {isDesktop && (
          <div className="flex flex-col gap-3 md:col-start-2 md:row-start-2 md:self-start">
            {monthlyReview.pending && <ReviewReminder card onOpen={openReview} />}
            <GoalCard onEdit={() => openSettings('goal')} />
          </div>
        )}
      </main>

      <FlowDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
        flow={dialog.flow}
        defaultType={dialog.type}
        formKey={dialog.key}
      />
      <InvestmentDetail
        open={detail.open}
        onOpenChange={(open) => setDetail((current) => ({ ...current, open }))}
        investment={detail.row}
        onEdit={(row) => {
          setDetail((current) => ({ ...current, open: false }))
          openInvestment(row)
        }}
        formKey={detail.key}
      />
      <InvestmentDialog
        open={investment.open}
        onOpenChange={(open) => setInvestment((current) => ({ ...current, open }))}
        investment={investment.row}
        formKey={investment.key}
      />
      <SettingsDialog
        open={settings.open}
        onOpenChange={(open) => setSettings((current) => ({ ...current, open }))}
        page={settings.page}
        formKey={settings.key}
      />
      <ReviewDialog
        open={review.open}
        onOpenChange={(open) => setReview((current) => ({ ...current, open }))}
        onSkip={monthlyReview.skip}
        formKey={review.key}
      />
    </div>
  )
}
