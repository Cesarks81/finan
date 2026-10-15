import { useState } from 'react'
import { LoaderCircle, Pencil, Trash2 } from 'lucide-react'

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
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useApiQuery, useFinanceData } from '@/hooks/useFinanceData'
import { describeSchedule, FIXED_TYPES, FLOW_TYPES, VARIABLE_TYPES } from '@/lib/flowTypes'
import { formatDate, formatEUR } from '@/lib/format'
import { cn } from '@/lib/utils'

const FILTERS = [
  { value: 'all', label: 'Todos', types: null, empty: 'Aún no hay flujos. Añade uno con los botones de flujo.' },
  { value: 'variable', label: 'Variables', types: VARIABLE_TYPES, empty: 'No hay movimientos variables (GVM / IVM).' },
  { value: 'fixed', label: 'Fijos', types: FIXED_TYPES, empty: 'No hay flujos fijos (GFM / IFM).' },
]

/** Historial de todos los flujos, con filtro por variables o fijos. Solo se muestra en PC. */
export function HistoryTable({ onEdit, className }) {
  const { version, refresh } = useFinanceData()
  const { data: allFlows, error, loading } = useApiQuery(() => api.listFlows(), [version])
  const [filterValue, setFilterValue] = useState('all')
  const filter = FILTERS.find((f) => f.value === filterValue)
  const flows = allFlows && (filter.types ? allFlows.filter((f) => filter.types.includes(f.flow_type)) : allFlows)
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

  return (
    <Card className={cn('gap-4', className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm tracking-wide uppercase">
          Historial
          {loading && <LoaderCircle className="text-muted-foreground size-3.5 animate-spin opacity-60" aria-label="Cargando" />}
        </CardTitle>
        <CardAction>
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={filterValue}
            onValueChange={(next) => next && setFilterValue(next)}
            aria-label="Filtrar el historial"
          >
            {FILTERS.map((f) => (
              <ToggleGroupItem key={f.value} value={f.value} className="px-3 text-xs">
                {f.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </CardAction>
      </CardHeader>
      <CardContent>
        {(error || deleteError) && (
          <p role="alert" className="text-destructive mb-3 text-sm">
            {deleteError ?? error.message}
          </p>
        )}
        {flows && flows.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            {filter.empty}
          </p>
        ) : (
          flows && (
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
                {flows.map((flow) => {
                  const income = FLOW_TYPES[flow.flow_type].income
                  return (
                    <TableRow key={flow.id}>
                      <TableCell className="text-muted-foreground">{formatDate(flow.start_date)}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={income ? 'border-income/40 text-income' : 'border-expense/40 text-expense'}
                        >
                          {flow.flow_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-0 truncate font-medium" title={flow.concept}>
                        {flow.concept}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{describeSchedule(flow)}</TableCell>
                      <TableCell
                        className={cn('text-right tabular-nums', income ? 'text-income' : 'text-expense')}
                      >
                        {income ? '+' : '−'}
                        {formatEUR(flow.amount)}
                        {flow.is_recurring && <span className="text-muted-foreground text-xs">/mes</span>}
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
          )
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
