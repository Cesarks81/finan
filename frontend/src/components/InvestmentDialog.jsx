import { useState } from 'react'
import { LoaderCircle, Trash2 } from 'lucide-react'

import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useFinanceData } from '@/hooks/useFinanceData'
import { formatEURWhole, formatMonthYear, toISODate } from '@/lib/format'
import { contributionPlan, freeFor, wanted } from '@/lib/investment'
import { cn } from '@/lib/utils'

/**
 * Plan de aportaciones según lo escrito en el formulario: cuánto se puede aportar como mucho
 * todos los meses (lo libre el mes más justo) y, mes a mes, lo libre y lo que se aporta.
 * `shared`: hay otras inversiones, así que lo libre es lo que sobra menos lo que aportan ellas.
 */
function ContributionPlan({ plan, monthly, until, shared, onUseMax }) {
  if (!plan.rows.length) return null
  const period = until ? `hasta ${formatMonthYear(plan.rows.at(-1).month)}` : 'los próximos 12 meses'
  const short = plan.max !== null && monthly > plan.max
  return (
    <div className="bg-muted/60 grid gap-2 rounded-lg px-3.5 py-3 text-xs">
      <p className="m-0 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-muted-foreground">
          Como mucho, {period}:{' '}
          <span className="text-foreground font-semibold tabular-nums">
            {plan.max === null ? '—' : `${formatEURWhole(plan.max)}/mes`}
          </span>
        </span>
        {plan.max !== null && plan.max > 0 && monthly !== plan.max && (
          <button type="button" onClick={onUseMax} className="text-chart-1 font-medium hover:underline">
            Usar el máximo
          </button>
        )}
      </p>
      {short && (
        <p className="text-expense m-0 leading-relaxed">
          Algunos meses no te sobra tanto: esos meses se aporta solo lo que sobre
          {shared ? ', repartido entre tus inversiones' : ''}.
        </p>
      )}
      <details className="group">
        <summary className="text-muted-foreground hover:text-foreground cursor-pointer select-none">
          Mes a mes · {formatEURWhole(plan.total)} en total
        </summary>
        <table className="mt-2 w-full tabular-nums">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 text-left font-normal">Mes</th>
              <th className="py-1 text-right font-normal">{shared ? 'Libre' : 'Te sobra'}</th>
              <th className="py-1 text-right font-normal">Aportas</th>
            </tr>
          </thead>
          <tbody>
            {plan.rows.map((row) => (
              <tr key={row.month} className="border-t">
                <td className="py-1">{formatMonthYear(row.month)}</td>
                <td className="text-muted-foreground py-1 text-right">{formatEURWhole(row.available)}</td>
                <td className={cn('py-1 text-right', row.contribution < monthly && 'text-expense')}>
                  {formatEURWhole(row.contribution)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}

/** Línea bajo una fila del formulario: tenue, o en rojo si el valor se pasa del tope. */
function LimitHint({ id, over, children }) {
  return (
    <p id={id} className={cn('-mt-2 text-xs', over ? 'text-expense' : 'text-muted-foreground')}>
      {children}
    </p>
  )
}

// Día 1 del mes siguiente a una fecha 'YYYY-MM-DD' (el de la primera aportación).
function nextMonthOf(iso) {
  const [year, month] = iso.split('-').map(Number)
  return toISODate(new Date(year, month, 1))
}

const clean = (value) => String(value).trim().replace(',', '.')

/**
 * Formulario de una inversión (`row`, de la API; null para una nueva): nombre, lo invertido hoy,
 * la rentabilidad anual esperada, la aportación mensual y, si se quiere, hasta cuándo se aporta.
 * Al editar, «Invertido hoy» ya trae lo que vale hoy (con lo que ha rendido y aportado), y al
 * guardar se toma esa cifra como punto de partida con fecha de hoy.
 *
 * Lo invertido sale de lo que tienes y lo que aportas, de lo que sobra, así que cada fila dice
 * debajo cuánto queda libre (descontando las demás inversiones) y no deja pasarse. Debajo de la
 * aportación, el plan: lo máximo que se puede aportar y el mes a mes.
 */
function InvestmentForm({ row, onDone }) {
  const { refresh, investments, wallet, surplus, projections } = useFinanceData()
  const [today] = useState(() => toISODate(new Date()))
  const list = investments.list ?? []
  const current = row ? list.find((investment) => investment.id === row.id) : null
  const others = list.filter((investment) => investment !== current)
  const [form, setForm] = useState(() => ({
    name: row?.name ?? '',
    amount: current ? (wallet?.value(current, today) ?? current.amount).toFixed(2) : '',
    rate: row ? String(Number(row.annual_return)) : '',
    monthly: current?.monthly ? String(current.monthly) : '',
    until: row?.until ?? '',
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const edit = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.value }))

  const amount = Number(clean(form.amount)) || 0
  const monthly = Number(clean(form.monthly)) || 0
  // Topes: lo invertido, lo que tienes hoy menos lo que ya está en las demás; lo que aportas, lo
  // que sobra el mes que viene (el de la primera aportación) menos lo que aportan las demás.
  const todayBalance = projections.data?.todayBalance
  const netWorth = todayBalance === undefined ? null : Math.max(0, Number(todayBalance))
  const othersValue = wallet ? others.reduce((sum, investment) => sum + wallet.value(investment, today), 0) : 0
  const freeToday = netWorth === null ? null : Math.max(0, netWorth - othersValue)
  const nextMonth = nextMonthOf(today)
  const surplusNext = surplus ? Math.max(0, surplus.get(nextMonth.slice(0, 7)) ?? 0) : null
  const othersNext = Math.min(surplusNext ?? 0, wanted(others, nextMonth))
  const freeNext = surplus ? freeFor(others, surplus, nextMonth) : null
  const amountOver = freeToday !== null && amount > freeToday
  const monthlyOver = freeNext !== null && monthly > freeNext
  const plan = surplus
    ? contributionPlan({ amount, monthly, rate: 0, date: today, until: form.until || null }, others, surplus)
    : { rows: [], max: null, total: 0 }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    const payload = {
      name: form.name.trim() || 'Inversión',
      amount: clean(form.amount),
      monthly: clean(form.monthly) || '0',
      annual_return: clean(form.rate),
      start_date: today,
      until: form.until || null,
    }
    try {
      if (row) await api.updateInvestment(row.id, payload)
      else await api.createInvestment(payload)
      refresh()
      onDone()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  async function handleDelete() {
    setSaving(true)
    setError(null)
    try {
      await api.deleteInvestment(row.id)
      refresh()
      onDone()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{row ? 'Editar inversión' : 'Nueva inversión'}</DialogTitle>
        <DialogDescription>
          Dinero en fondos, acciones o similares (ya cuenta dentro de tu patrimonio). Solo esa parte crece con la
          rentabilidad.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="invest-name">Nombre</Label>
          <Input id="invest-name" value={form.name} onChange={edit('name')} maxLength={60} autoFocus={!row} />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-end gap-4">
          <div className="grid gap-2">
            <Label htmlFor="invest-amount">Invertido hoy (€)</Label>
            <Input
              id="invest-amount"
              type="number"
              inputMode="decimal"
              min="0"
              max={freeToday?.toFixed(2)}
              step="0.01"
              value={form.amount}
              onChange={edit('amount')}
              aria-invalid={amountOver}
              aria-describedby="invest-amount-limit"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invest-return">Rentabilidad (%/año)</Label>
            <Input
              id="invest-return"
              type="number"
              inputMode="decimal"
              min="-50"
              max="50"
              step="0.1"
              value={form.rate}
              onChange={edit('rate')}
              required
            />
          </div>
        </div>
        {freeToday !== null && (
          <LimitHint id="invest-amount-limit" over={amountOver}>
            {amountOver
              ? `No puedes invertir más de lo que ${othersValue > 0 ? 'te queda libre' : 'tienes'} hoy: ${formatEURWhole(freeToday)}.`
              : `Hoy tienes ${formatEURWhole(netWorth)}${othersValue > 0 ? `, ${formatEURWhole(othersValue)} ya en otras inversiones` : ''}${
                  amount > 0 ? ` · te quedan ${formatEURWhole(freeToday - amount)} sin invertir` : ''
                }.`}
          </LimitHint>
        )}

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-end gap-4">
          <div className="grid gap-2">
            <Label htmlFor="invest-monthly">Aportas al mes (€)</Label>
            <Input
              id="invest-monthly"
              type="number"
              inputMode="decimal"
              min="0"
              max={freeNext?.toFixed(2)}
              step="0.01"
              value={form.monthly}
              onChange={edit('monthly')}
              aria-invalid={monthlyOver}
              aria-describedby="invest-monthly-limit"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invest-until">Hasta (opcional)</Label>
            <Input id="invest-until" type="date" min={today} value={form.until} onChange={edit('until')} />
          </div>
        </div>
        {freeNext !== null && (
          <LimitHint id="invest-monthly-limit" over={monthlyOver}>
            {monthlyOver
              ? `No puedes aportar más de lo que ${othersNext > 0 ? 'te queda libre' : 'te sobra'} el mes que viene: ${formatEURWhole(freeNext)}.`
              : surplusNext === 0
                ? 'El mes que viene no te sobra nada para aportar.'
                : `El mes que viene te sobran ${formatEURWhole(surplusNext)}${
                    othersNext > 0 ? `, ${formatEURWhole(othersNext)} ya van a otras inversiones` : ''
                  }${monthly > 0 ? ` · te quedan ${formatEURWhole(freeNext - monthly)} libres` : ''}.`}
          </LimitHint>
        )}

        <ContributionPlan
          plan={plan}
          monthly={monthly}
          until={form.until}
          shared={others.some((investment) => investment.monthly > 0)}
          onUseMax={() => setForm((f) => ({ ...f, monthly: String(Math.floor(plan.max)) }))}
        />
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {confirmingDelete ? (
        <div className="border-destructive/40 grid gap-3 rounded-lg border p-3">
          <p className="text-sm">
            ¿Eliminar «{row.name}»? Lo invertido sigue en tu patrimonio, pero deja de crecer con la rentabilidad. No se
            puede deshacer.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setConfirmingDelete(false)} disabled={saving}>
              No, mantener
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving && <LoaderCircle className="animate-spin" />}
              Sí, eliminar
            </Button>
          </div>
        </div>
      ) : (
        <DialogFooter>
          {row && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmingDelete(true)}
              className="text-destructive hover:text-destructive sm:mr-auto"
            >
              <Trash2 />
              Eliminar
            </Button>
          )}
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancelar
            </Button>
          </DialogClose>
          <Button type="submit" disabled={saving}>
            {saving && <LoaderCircle className="animate-spin" />}
            {row ? 'Guardar cambios' : 'Añadir'}
          </Button>
        </DialogFooter>
      )}
    </form>
  )
}

/**
 * Modal para crear (sin `investment`) o editar (con `investment`, la fila de la API) una
 * inversión. Cambiar `formKey` en cada apertura reinicia el formulario.
 */
export function InvestmentDialog({ open, onOpenChange, investment = null, formKey }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <InvestmentForm key={formKey} row={investment} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}
