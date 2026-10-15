import { useState } from 'react'
import { Check, LoaderCircle, LogOut } from 'lucide-react'

import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/hooks/useAuth'
import { useFinanceData } from '@/hooks/useFinanceData'
import { useTheme } from '@/hooks/useTheme'
import { toISODate } from '@/lib/format'

function Section({ title, description, children }) {
  return (
    <section className="grid gap-3">
      <div className="grid gap-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="text-muted-foreground text-xs">{description}</p>}
      </div>
      {children}
    </section>
  )
}

function ThemeSetting() {
  const { theme, setTheme } = useTheme()
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
      <Label htmlFor="settings-dark-mode" className="grid gap-1">
        Modo oscuro
        <span className="text-muted-foreground text-xs font-normal">Desactívalo para usar el modo claro.</span>
      </Label>
      <Switch
        id="settings-dark-mode"
        checked={theme === 'dark'}
        onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
      />
    </div>
  )
}

function SplitLinesSetting({ checked, onCheckedChange }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
      <Label htmlFor="settings-split-lines" className="grid gap-1">
        Ingresos y gastos por separado
        <span className="text-muted-foreground text-xs font-normal">
          En vez del patrimonio, dos líneas acumuladas: ingresos en azul y gastos en rojo. La distancia entre ellas
          es lo que ahorras.
        </span>
      </Label>
      <Switch id="settings-split-lines" checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

function InitialBalanceForm({ settings }) {
  const { refresh } = useFinanceData()
  const [amount, setAmount] = useState(settings.balance_date ? settings.initial_balance : '')
  const [balanceDate, setBalanceDate] = useState(() => settings.balance_date ?? toISODate(new Date()))
  const [status, setStatus] = useState('idle') // idle | saving | saved
  const [error, setError] = useState(null)

  const edit = (setter) => (event) => {
    setter(event.target.value)
    setStatus('idle')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setStatus('saving')
    setError(null)
    try {
      await api.updateSettings({
        initial_balance: String(amount).replace(',', '.'),
        balance_date: balanceDate,
      })
      refresh()
      setStatus('saved')
    } catch (err) {
      setError(err.message)
      setStatus('idle')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="initial-amount">Patrimonio (€)</Label>
          <Input
            id="initial-amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            value={amount}
            onChange={edit(setAmount)}
            placeholder="0,00"
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="initial-date">A fecha de</Label>
          <Input id="initial-date" type="date" value={balanceDate} onChange={edit(setBalanceDate)} required />
        </div>
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-3">
        {status === 'saved' && (
          <p role="status" className="text-income flex items-center gap-1 text-sm">
            <Check className="size-4" /> Guardado
          </p>
        )}
        <Button type="submit" disabled={status === 'saving'}>
          {status === 'saving' && <LoaderCircle className="animate-spin" />}
          Guardar
        </Button>
      </div>
    </form>
  )
}

function InitialBalanceSetting() {
  // Ya está en la caché desde que se abrió la app: el formulario sale al instante.
  const { data, error } = useFinanceData().settings
  if (error) return <p className="text-destructive text-sm">{error.message}</p>
  if (!data) return <LoaderCircle className="text-muted-foreground mx-auto size-5 animate-spin" />
  return <InitialBalanceForm settings={data} />
}

function SessionSetting() {
  const { logout } = useAuth()
  return (
    <Button variant="outline" onClick={logout} className="justify-self-start">
      <LogOut />
      Cerrar sesión en este dispositivo
    </Button>
  )
}

/** Modal de ajustes (engranaje del encabezado): tema, tipo de gráfica, patrimonio inicial y sesión. */
export function SettingsDialog({ open, onOpenChange, splitLines, onSplitLinesChange }) {
  const { required: hasSession } = useAuth()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-6">
        <DialogHeader>
          <DialogTitle>Ajustes</DialogTitle>
          <DialogDescription className="sr-only">Apariencia, gráfica, patrimonio inicial y sesión</DialogDescription>
        </DialogHeader>

        <Section title="Apariencia">
          <ThemeSetting />
          <SplitLinesSetting checked={splitLines} onCheckedChange={onSplitLinesChange} />
        </Section>

        <Section
          title="Patrimonio inicial"
          description="Tu patrimonio neto (ahorros menos deudas) en una fecha, normalmente hoy. La gráfica parte de ese valor: suma o resta los flujos desde esa fecha y reconstruye hacia atrás los anteriores. Puede ser negativo."
        >
          <InitialBalanceSetting />
        </Section>

        {hasSession && (
          <Section title="Sesión">
            <SessionSetting />
          </Section>
        )}
      </DialogContent>
    </Dialog>
  )
}
