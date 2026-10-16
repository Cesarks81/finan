import { useState } from 'react'
import { LoaderCircle, Pencil, Trash2 } from 'lucide-react'

import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useFinanceData } from '@/hooks/useFinanceData'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { formatEURWhole, formatMonthYear, toISODate } from '@/lib/format'
import { contributionText, percent } from '@/lib/investment'
import { cn } from '@/lib/utils'

// Meses que se ven al abrir y que añade cada «Ver más».
const PAGE = 12

/** Ganancia con signo: «+12 €» en verde, «−5 €» en rojo. */
function Gain({ value, className }) {
  const cents = Math.round(value * 100)
  return (
    <span className={cn(cents > 0 ? 'text-income' : cents < 0 ? 'text-expense' : 'text-muted-foreground', className)}>
      {cents > 0 ? '+' : cents < 0 ? '−' : ''}
      {formatEURWhole(Math.abs(value))}
    </span>
  )
}

/**
 * Detalle de una inversión: lo que vale hoy y, mes a mes, lo que aportas, lo que gana (la ganancia
 * de cada mes también rinde los siguientes) y lo que habrá al acabar el mes. En móvil, debajo, los
 * botones para editarla o eliminarla (en PC están en la fila de la tabla).
 */
function InvestmentDetailBody({ row, onEdit, onDone }) {
  const isDesktop = useIsDesktop()
  const { investments, wallet, refresh } = useFinanceData()
  const [today] = useState(() => toISODate(new Date()))
  const [count, setCount] = useState(PAGE)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)
  const investment = investments.list?.find((item) => item.id === row.id)

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      await api.deleteInvestment(row.id)
      refresh()
      onDone()
    } catch (err) {
      setError(err.message)
      setDeleting(false)
    }
  }

  if (!investment || !wallet) return <LoaderCircle className="text-muted-foreground mx-auto size-5 animate-spin" />
  const months = wallet.months(investment, today, count)
  const gained = months.reduce((sum, month) => sum + month.gain, 0)
  const contributed = months.reduce((sum, month) => sum + month.contribution, 0)

  return (
    <div className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{investment.name}</DialogTitle>
        <DialogDescription>
          {contributionText(investment)} · {percent(investment.rate)}/año
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-muted/60 grid gap-0.5 rounded-lg px-3.5 py-3">
          <span className="text-muted-foreground text-xs">Vale hoy</span>
          <span className="text-lg font-semibold tabular-nums">{formatEURWhole(wallet.value(investment, today))}</span>
        </div>
        <div className="bg-muted/60 grid gap-0.5 rounded-lg px-3.5 py-3">
          <span className="text-muted-foreground text-xs">En {formatMonthYear(months.at(-1).month)}</span>
          <span className="text-lg font-semibold tabular-nums">{formatEURWhole(months.at(-1).value)}</span>
        </div>
      </div>

      <section aria-label="Mes a mes" className="grid gap-2">
        <table className="w-full text-xs tabular-nums">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 text-left font-normal">Mes</th>
              <th className="py-1 text-right font-normal">Aportas</th>
              <th className="py-1 text-right font-normal">Ganancia</th>
              <th className="py-1 text-right font-normal">Total</th>
            </tr>
          </thead>
          <tbody>
            {months.map((month, i) => (
              <tr key={month.month} className="border-t">
                <td className="py-1.5">
                  {formatMonthYear(month.month)}
                  {i === 0 && <span className="text-muted-foreground"> · desde hoy</span>}
                </td>
                <td className="text-muted-foreground py-1.5 text-right">
                  {month.contribution ? formatEURWhole(month.contribution) : '—'}
                </td>
                <td className="py-1.5 text-right">
                  <Gain value={month.gain} />
                </td>
                <td className="py-1.5 text-right font-medium">{formatEURWhole(month.value)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t font-medium">
              <td className="py-1.5">En {count} meses</td>
              <td className="text-muted-foreground py-1.5 text-right">{formatEURWhole(contributed)}</td>
              <td className="py-1.5 text-right">
                <Gain value={gained} />
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
        <button
          type="button"
          onClick={() => setCount((current) => current + PAGE)}
          className="text-chart-1 justify-self-start text-xs font-medium hover:underline"
        >
          Ver {PAGE} meses más
        </button>
      </section>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {!isDesktop &&
        (confirmingDelete ? (
          <div className="border-destructive/40 grid gap-3 rounded-lg border p-3">
            <p className="text-sm">
              ¿Eliminar «{investment.name}»? Lo invertido sigue en tu patrimonio, pero deja de crecer con la
              rentabilidad. No se puede deshacer.
            </p>
            <div className="flex flex-col-reverse gap-2">
              <Button variant="outline" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                No, mantener
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting && <LoaderCircle className="animate-spin" />}
                Sí, eliminar
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-2">
            <Button onClick={() => onEdit(row)}>
              <Pencil />
              Editar
            </Button>
            <Button variant="outline" onClick={() => setConfirmingDelete(true)} className="text-destructive hover:text-destructive">
              <Trash2 />
              Eliminar inversión
            </Button>
          </div>
        ))}
    </div>
  )
}

/** Modal del detalle de una inversión (`investment`, la fila de la API). `onEdit` abre su formulario. */
export function InvestmentDetail({ open, onOpenChange, investment, onEdit, formKey }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {investment && (
          <InvestmentDetailBody key={formKey} row={investment} onEdit={onEdit} onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  )
}
