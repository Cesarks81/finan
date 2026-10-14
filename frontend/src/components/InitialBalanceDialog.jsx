import { useState } from 'react'
import { LoaderCircle } from 'lucide-react'

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
import { useApiQuery, useFinanceData } from '@/hooks/useFinanceData'
import { toISODate } from '@/lib/format'

function InitialBalanceForm({ settings, onDone }) {
  const { refresh } = useFinanceData()
  const [amount, setAmount] = useState(settings.balance_date ? settings.initial_balance : '')
  const [balanceDate, setBalanceDate] = useState(() => settings.balance_date ?? toISODate(new Date()))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await api.updateSettings({
        initial_balance: String(amount).replace(',', '.'),
        balance_date: balanceDate,
      })
      refresh()
      onDone()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="initial-amount">Patrimonio (€)</Label>
          <Input
            id="initial-amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
            required
            autoFocus
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="initial-date">A fecha de</Label>
          <Input
            id="initial-date"
            type="date"
            value={balanceDate}
            onChange={(e) => setBalanceDate(e.target.value)}
            required
          />
        </div>
      </div>
      <p className="text-muted-foreground -mt-2 text-xs">Puede ser negativo si tienes más deudas que ahorros.</p>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancelar
          </Button>
        </DialogClose>
        <Button type="submit" disabled={saving}>
          {saving && <LoaderCircle className="animate-spin" />}
          Guardar
        </Button>
      </DialogFooter>
    </form>
  )
}

function LoadSettings({ onDone }) {
  const { data, error } = useApiQuery(() => api.getSettings(), [])
  if (error) return <p className="text-destructive text-sm">{error.message}</p>
  if (!data) return <LoaderCircle className="text-muted-foreground mx-auto size-5 animate-spin" />
  return <InitialBalanceForm settings={data} onDone={onDone} />
}

/** Modal para definir el patrimonio inicial guardado en /settings. */
export function InitialBalanceDialog({ open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Patrimonio inicial</DialogTitle>
          <DialogDescription>
            Indica tu patrimonio neto (ahorros menos deudas) en una fecha, normalmente hoy. La gráfica parte
            de ese valor: suma o resta los flujos desde esa fecha y reconstruye hacia atrás los anteriores.
          </DialogDescription>
        </DialogHeader>
        <LoadSettings onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}
