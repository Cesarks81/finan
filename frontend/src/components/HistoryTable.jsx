import { useState } from 'react'
import { ChevronRight, LoaderCircle, Pencil, Plus, Trash2 } from 'lucide-react'

import { api } from '@/api/client'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { InvestmentList } from '@/components/InvestmentList'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useFinanceData } from '@/hooks/useFinanceData'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { describeSchedule, FIXED_TYPES, FLOW_TYPES, VARIABLE_TYPES } from '@/lib/flowTypes'
import { formatDate, formatEUR } from '@/lib/format'
import { cn } from '@/lib/utils'

// Los flujos que ya hicieron su último pago o cobro solo aparecen en «Terminados».
const FILTERS = [
  {
    value: 'variable',
    label: 'Variables',
    matches: ({ flow, schedule }) => VARIABLE_TYPES.includes(flow.flow_type) && !schedule.ended,
    empty: 'No hay movimientos variables (GVM / IVM).',
  },
  {
    value: 'fixed',
    label: 'Fijos',
    matches: ({ flow, schedule }) => FIXED_TYPES.includes(flow.flow_type) && !schedule.ended,
    empty: 'No hay flujos fijos (GFM / IFM) en curso.',
  },
  {
    value: 'ended',
    label: 'Terminados',
    matches: ({ schedule }) => schedule.ended,
    empty: 'Ningún flujo ha terminado todavía. Aquí irán los que ya hayan hecho su último pago o cobro.',
  },
]

function TypeBadge({ flow }) {
  const { income } = FLOW_TYPES[flow.flow_type]
  return (
    <Badge variant="outline" className={income ? 'border-income/40 text-income' : 'border-expense/40 text-expense'}>
      {flow.flow_type}
    </Badge>
  )
}

function ScheduleBadge({ schedule }) {
  return (
    <Badge variant="outline" className="text-muted-foreground font-normal" title={schedule.hint}>
      {schedule.label}
    </Badge>
  )
}

function Amount({ flow, className }) {
  const { income } = FLOW_TYPES[flow.flow_type]
  return (
    <span className={cn('tabular-nums', income ? 'text-income' : 'text-expense', className)}>
      {income ? '+' : '−'}
      {formatEUR(flow.amount)}
    </span>
  )
}

/**
 * Historial en móvil: una lista en vez de la tabla. Cada fila abre el flujo para editarlo
 * (el modal de edición también permite eliminarlo).
 */
function MobileHistoryList({ rows, onEdit }) {
  return (
    <ul className="divide-y">
      {rows.map(({ flow, schedule }) => (
        <li key={flow.id}>
          <button type="button" onClick={() => onEdit(flow)} className="flex w-full items-center gap-3 py-3 text-left">
            <span className="grid min-w-0 flex-1 gap-1.5">
              <span className="flex min-w-0 items-center gap-2">
                <TypeBadge flow={flow} />
                <span className="truncate text-sm font-medium">{flow.concept}</span>
              </span>
              <span className="text-muted-foreground flex items-center gap-2 text-xs">
                {formatDate(flow.start_date)}
                <ScheduleBadge schedule={schedule} />
              </span>
            </span>
            <Amount flow={flow} className="shrink-0 text-sm font-medium" />
            <ChevronRight aria-hidden className="text-muted-foreground size-4 shrink-0" />
          </button>
        </li>
      ))}
    </ul>
  )
}

const SECTIONS = [
  { value: 'history', label: 'Historial' },
  { value: 'investments', label: 'Inversiones' },
]

/** Pestañas del título: «HISTORIAL · INVERSIONES»; la activa resalta y la otra queda tenue. */
function SectionTabs({ value, onChange }) {
  return (
    <div role="tablist" aria-label="Sección" className="flex items-center gap-4">
      {SECTIONS.map((section) => (
        <button
          key={section.value}
          type="button"
          role="tab"
          aria-selected={value === section.value}
          onClick={() => onChange(section.value)}
          className={cn(
            'text-sm font-semibold tracking-wide uppercase transition-colors',
            value === section.value ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {section.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Historial de los flujos (variables, fijos y los ya terminados) y, en la otra pestaña, las
 * inversiones (`InvestmentList`). En PC va debajo de la gráfica, como tabla, con las dos pestañas;
 * en móvil ocupa su propia pantalla, como lista, y la sección la fija `section` (cada una tiene su
 * botón en el encabezado), así que en vez de pestañas el título solo dice cuál es.
 */
export function HistoryTable({ section: fixedSection, onEdit, onOpenInvestment, onEditInvestment, className }) {
  const isDesktop = useIsDesktop()
  const { refresh, flows, investments } = useFinanceData()
  const [tab, setTab] = useState('history')
  const section = fixedSection ?? tab
  const showInvestments = section === 'investments'
  const { data: allFlows, error, loading } = flows
  const [filterValue, setFilterValue] = useState('variable')
  const filter = FILTERS.find((f) => f.value === filterValue)
  const rows = allFlows?.map((flow) => ({ flow, schedule: describeSchedule(flow) })).filter(filter.matches)
  const [toDelete, setToDelete] = useState(null)
  const [deleteError, setDeleteError] = useState(null)

  async function confirmDelete() {
    try {
      await api.deleteFlow(toDelete.id)
      setDeleteError(null)
      refresh()
    } catch (err) {
      setDeleteError(err.message)
    }
  }

  const filterControl = (
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      value={filterValue}
      onValueChange={(next) => next && setFilterValue(next)}
      aria-label="Filtrar el historial"
      className={cn(!isDesktop && 'w-full')}
    >
      {FILTERS.map((f) => (
        <ToggleGroupItem key={f.value} value={f.value} className="px-3 text-xs">
          {f.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )

  return (
    <Card
      className={cn(
        // Móvil: sin tarjeta, como la gráfica, y con la lista desplazable en el alto disponible.
        '-mx-4 gap-3 rounded-none border-0 bg-transparent py-0 shadow-none',
        'md:mx-0 md:gap-4 md:rounded-xl md:border md:bg-card md:py-6 md:shadow-sm',
        className,
      )}
    >
      <CardHeader className="px-4 md:px-6">
        <CardTitle className="flex min-h-8 items-center gap-2">
          {fixedSection ? (
            <h2 className="text-sm font-semibold tracking-wide uppercase">
              {SECTIONS.find((item) => item.value === section).label}
            </h2>
          ) : (
            <SectionTabs value={section} onChange={setTab} />
          )}
          {(showInvestments ? investments.loading : loading) && (
            <LoaderCircle className="text-muted-foreground size-3.5 animate-spin opacity-60" aria-label="Cargando" />
          )}
        </CardTitle>
        {showInvestments ? (
          investments.list?.length > 0 && (
            <CardAction>
              <Button variant="outline" size="sm" onClick={() => onEditInvestment(null)}>
                <Plus />
                Añadir
              </Button>
            </CardAction>
          )
        ) : isDesktop ? (
          <CardAction>{filterControl}</CardAction>
        ) : (
          // En móvil no cabe junto a las pestañas: va debajo, a todo el ancho.
          <div className="mt-1.5">{filterControl}</div>
        )}
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 md:overflow-visible md:px-6">
        {showInvestments ? (
          <InvestmentList onOpen={onOpenInvestment} onEdit={onEditInvestment} />
        ) : (
          <>
            {(error || deleteError) && (
              <p role="alert" className="text-destructive mb-3 text-sm">
                {deleteError ?? error.message}
              </p>
            )}
            {rows && rows.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                {filter.empty}
              </p>
            ) : (
              rows &&
              (!isDesktop ? (
                <MobileHistoryList rows={rows} onEdit={onEdit} />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="w-full">Concepto</TableHead>
                      <TableHead>Periodicidad</TableHead>
                      <TableHead className="text-right">Importe</TableHead>
                      <TableHead>
                        <span className="sr-only">Acciones</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map(({ flow, schedule }) => {
                      return (
                        <TableRow key={flow.id}>
                          <TableCell className="text-muted-foreground">{formatDate(flow.start_date)}</TableCell>
                          <TableCell>
                            <TypeBadge flow={flow} />
                          </TableCell>
                          <TableCell className="max-w-0 truncate font-medium" title={flow.concept}>
                            {flow.concept}
                          </TableCell>
                          <TableCell>
                            <ScheduleBadge schedule={schedule} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Amount flow={flow} />
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon-sm" onClick={() => onEdit(flow)} aria-label={`Editar ${flow.concept}`}>
                                <Pencil />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => setToDelete(flow)}
                                aria-label={`Eliminar ${flow.concept}`}
                                className="hover:text-destructive"
                              >
                                <Trash2 />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              ))
            )}
          </>
        )}
      </CardContent>

      <AlertDialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este flujo?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará «{toDelete?.concept}» y la gráfica se recalculará. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className={buttonVariants({ variant: 'destructive' })} onClick={confirmDelete}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
