import { useState } from 'react'
import { ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'

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
import { Button, buttonVariants } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useFinanceData } from '@/hooks/useFinanceData'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { formatEURWhole, toISODate } from '@/lib/format'
import { contributionText, percent } from '@/lib/investment'

/**
 * Inversiones (pestaña junto al Historial): cada una con lo que vale hoy, lo que aporta al mes y su
 * rentabilidad. Tocar una abre su detalle mes a mes (`onOpen`). En PC, tabla con editar y eliminar
 * en cada fila (y el total si hay varias); en móvil, lista (editar y eliminar están en el detalle).
 * Sin inversiones, invita a añadir una (`onEdit(null)`).
 */
export function InvestmentList({ onOpen, onEdit }) {
  const isDesktop = useIsDesktop()
  const { investments, wallet, refresh } = useFinanceData()
  const [today] = useState(() => toISODate(new Date()))
  const [toDelete, setToDelete] = useState(null)
  const [deleteError, setDeleteError] = useState(null)
  const list = investments.list
  const rowOf = (investment) => investments.data.find((row) => row.id === investment.id)
  const valueOf = (investment) => (wallet ? wallet.value(investment, today) : investment.amount)

  async function confirmDelete() {
    try {
      await api.deleteInvestment(toDelete.id)
      setDeleteError(null)
      refresh()
    } catch (err) {
      setDeleteError(err.message)
    }
  }

  if (investments.error) return <p className="text-destructive text-sm">{investments.error.message}</p>
  if (!list) return null
  if (!list.length) {
    return (
      <div className="grid justify-items-center gap-3 py-8 text-center">
        <p className="text-muted-foreground max-w-sm text-sm">
          Aún no tienes inversiones. Si tienes dinero en fondos, acciones o similares, añádelo: finan sumará lo que
          rinde y lo que aportes cada mes.
        </p>
        <Button variant="outline" size="sm" onClick={() => onEdit(null)}>
          <Plus />
          Añadir inversión
        </Button>
      </div>
    )
  }

  const total = list.reduce((sum, investment) => sum + valueOf(investment), 0)
  const monthly = list.reduce((sum, investment) => sum + investment.monthly, 0)

  return (
    <>
      {deleteError && (
        <p role="alert" className="text-destructive mb-3 text-sm">
          {deleteError}
        </p>
      )}
      {!isDesktop ? (
        <ul className="divide-y">
          {list.map((investment) => (
            <li key={investment.id}>
              <button
                type="button"
                onClick={() => onOpen(rowOf(investment))}
                className="flex w-full items-center gap-3 py-3 text-left"
              >
                <span className="grid min-w-0 flex-1 gap-1">
                  <span className="truncate text-sm font-medium">{investment.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {contributionText(investment)} · {percent(investment.rate)}/año
                  </span>
                </span>
                <span className="shrink-0 text-sm font-medium tabular-nums">{formatEURWhole(valueOf(investment))}</span>
                <ChevronRight aria-hidden className="text-muted-foreground size-4 shrink-0" />
              </button>
            </li>
          ))}
          {list.length > 1 && (
            <li className="text-muted-foreground flex justify-between gap-3 py-3 pr-7 text-xs">
              <span>Total · {formatEURWhole(monthly)}/mes</span>
              <span className="text-foreground text-sm font-medium tabular-nums">{formatEURWhole(total)}</span>
            </li>
          )}
        </ul>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-full">Nombre</TableHead>
              <TableHead>Aportas</TableHead>
              <TableHead className="text-right">Rentabilidad</TableHead>
              <TableHead className="text-right">Vale hoy</TableHead>
              <TableHead>
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((investment) => (
              <TableRow key={investment.id} onClick={() => onOpen(rowOf(investment))} className="cursor-pointer">
                <TableCell className="max-w-0 truncate font-medium" title={investment.name}>
                  {/* Botón para abrirla con el teclado; el clic sube a la fila. */}
                  <button type="button" className="max-w-full truncate text-left">
                    {investment.name}
                  </button>
                </TableCell>
                <TableCell className="text-muted-foreground">{contributionText(investment)}</TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums">
                  {percent(investment.rate)}/año
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">{formatEURWhole(valueOf(investment))}</TableCell>
                <TableCell>
                  {/* Los botones no abren el detalle: tienen su propia acción. */}
                  <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onEdit(rowOf(investment))}
                      aria-label={`Editar ${investment.name}`}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setToDelete(investment)}
                      aria-label={`Eliminar ${investment.name}`}
                      className="hover:text-destructive"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          {list.length > 1 && (
            <TableFooter className="bg-transparent">
              <TableRow>
                <TableCell className="text-muted-foreground">Total</TableCell>
                <TableCell className="text-muted-foreground">{formatEURWhole(monthly)}/mes</TableCell>
                <TableCell />
                <TableCell className="text-right font-medium tabular-nums">{formatEURWhole(total)}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      )}

      <AlertDialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta inversión?</AlertDialogTitle>
            <AlertDialogDescription>
              «{toDelete?.name}» dejará de crecer con la rentabilidad (lo invertido sigue en tu patrimonio). Esta acción
              no se puede deshacer.
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
    </>
  )
}
