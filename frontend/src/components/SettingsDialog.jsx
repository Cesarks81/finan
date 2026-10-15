import { useState } from 'react'
import { Check, LoaderCircle, LogOut, RotateCcw } from 'lucide-react'

import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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

function SwitchSetting({ id, label, description, checked, onCheckedChange }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
      <Label htmlFor={id} className="grid gap-1">
        {label}
        <span className="text-muted-foreground text-xs font-normal">{description}</span>
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

function ChartSettings() {
  const { splitLines, setSplitLines, calendar, setCalendar } = useFinanceData().chart
  return (
    <>
      <SwitchSetting
        id="settings-split-lines"
        label="Ingresos y gastos por separado"
        description="En vez del patrimonio, dos líneas acumuladas: ingresos en azul y gastos en rojo. La distancia entre ellas es lo que ahorras."
        checked={splitLines}
        onCheckedChange={setSplitLines}
      />
      <SwitchSetting
        id="settings-calendar"
        label="Vista de calendario"
        description="D muestra el mes en curso (del día 1 al último), M el año en curso (de enero a diciembre) y A los próximos 25 años. La línea «Hoy» marca dónde estás."
        checked={calendar}
        onCheckedChange={setCalendar}
      />
    </>
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

// Grupos que se pueden restablecer, cada uno con sus dos tipos de flujo.
const RESET_GROUPS = [
  { key: 'expenses', label: 'Gastos', detail: 'GFM y GVM', types: ['GFM', 'GVM'] },
  { key: 'incomes', label: 'Ingresos', detail: 'IFM e IVM', types: ['IFM', 'IVM'] },
]

const flowCount = (n) => `${n} ${n === 1 ? 'flujo' : 'flujos'}`

/** Borra de golpe todos los gastos, los ingresos o ambos, tras marcarlos y confirmar. */
function ResetSetting() {
  const { flows, refresh } = useFinanceData()
  const [selected, setSelected] = useState({ expenses: false, incomes: false })
  const [confirming, setConfirming] = useState(false)
  const [status, setStatus] = useState(null) // null | 'deleting' | { deleted }
  const [error, setError] = useState(null)

  const countOf = (group) => (flows.data ?? []).filter((f) => group.types.includes(f.flow_type)).length
  const chosen = RESET_GROUPS.filter((group) => selected[group.key])
  const total = chosen.reduce((sum, group) => sum + countOf(group), 0)
  const what = chosen.map((group) => group.label.toLowerCase()).join(' e ')

  function toggle(key, checked) {
    setSelected((current) => ({ ...current, [key]: checked === true }))
    setConfirming(false)
    setStatus(null)
  }

  async function handleReset() {
    setStatus('deleting')
    setError(null)
    try {
      const { deleted } = await api.deleteFlows(chosen.flatMap((group) => group.types))
      refresh()
      setSelected({ expenses: false, incomes: false })
      setConfirming(false)
      setStatus({ deleted })
    } catch (err) {
      setError(err.message)
      setStatus(null)
    }
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-2 rounded-lg border p-3">
        {RESET_GROUPS.map((group) => (
          <div key={group.key} className="flex items-center gap-3">
            <Checkbox
              id={`reset-${group.key}`}
              checked={selected[group.key]}
              onCheckedChange={(checked) => toggle(group.key, checked)}
              disabled={status === 'deleting'}
            />
            <Label htmlFor={`reset-${group.key}`} className="flex-1 justify-between gap-3">
              <span>
                {group.label} <span className="text-muted-foreground font-normal">({group.detail})</span>
              </span>
              <span className="text-muted-foreground text-xs font-normal">{flowCount(countOf(group))}</span>
            </Label>
          </div>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {confirming ? (
        <div className="border-destructive/40 grid gap-3 rounded-lg border p-3">
          <p className="text-sm">
            ¿Eliminar {total === 1 ? 'el único flujo' : `los ${total} flujos`} de {what}? La gráfica se recalculará sin{' '}
            {total === 1 ? 'él' : 'ellos'}. No se puede deshacer.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={status === 'deleting'}>
              No, cancelar
            </Button>
            <Button variant="destructive" onClick={handleReset} disabled={status === 'deleting'}>
              {status === 'deleting' && <LoaderCircle className="animate-spin" />}
              Sí, restablecer
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-end gap-3">
          {status?.deleted !== undefined && (
            <p role="status" className="text-income flex items-center gap-1 text-sm">
              <Check className="size-4" /> {flowCount(status.deleted)} {status.deleted === 1 ? 'eliminado' : 'eliminados'}
            </p>
          )}
          <Button
            variant="outline"
            onClick={() => setConfirming(true)}
            disabled={total === 0}
            className="text-destructive hover:text-destructive"
          >
            <RotateCcw />
            Restablecer…
          </Button>
        </div>
      )}
    </div>
  )
}

/** Ahorro mensual deseado: se aparta antes de calcular «Disponible este mes». */
function SavingsTargetForm({ settings }) {
  const { refresh } = useFinanceData()
  const [amount, setAmount] = useState(settings.savings_target ?? '')
  const [status, setStatus] = useState('idle') // idle | saving | saved
  const [error, setError] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    setStatus('saving')
    setError(null)
    try {
      const value = String(amount).trim().replace(',', '.')
      await api.patchSettings({ savings_target: value === '' ? null : value })
      refresh()
      setStatus('saved')
    } catch (err) {
      setError(err.message)
      setStatus('idle')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3">
      <div className="grid gap-2">
        <Label htmlFor="savings-target">Quiero ahorrar al mes (€)</Label>
        <Input
          id="savings-target"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value)
            setStatus('idle')
          }}
        />
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

function SavingsTargetSetting() {
  const { data, error } = useFinanceData().settings
  if (error) return <p className="text-destructive text-sm">{error.message}</p>
  if (!data) return <LoaderCircle className="text-muted-foreground mx-auto size-5 animate-spin" />
  return <SavingsTargetForm settings={data} />
}

/** Objetivo de patrimonio: nombre e importe. Vacío el importe, se quita. */
function GoalForm({ settings }) {
  const { refresh } = useFinanceData()
  const [name, setName] = useState(settings.goal_name ?? '')
  const [amount, setAmount] = useState(settings.goal_amount ?? '')
  const [status, setStatus] = useState('idle') // idle | saving | saved
  const [error, setError] = useState(null)
  const edit = (setter) => (event) => {
    setter(event.target.value)
    setStatus('idle')
  }

  async function save(changes) {
    setStatus('saving')
    setError(null)
    try {
      await api.patchSettings(changes)
      refresh()
      setStatus('saved')
    } catch (err) {
      setError(err.message)
      setStatus('idle')
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    const value = String(amount).trim().replace(',', '.')
    save({ goal_name: name.trim() || null, goal_amount: value === '' ? null : value })
  }

  function handleRemove() {
    setName('')
    setAmount('')
    save({ goal_name: null, goal_amount: null })
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
        <div className="grid gap-2">
          <Label htmlFor="goal-name">Para qué</Label>
          <Input id="goal-name" value={name} onChange={edit(setName)} maxLength={60} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="goal-amount">Importe (€)</Label>
          <Input
            id="goal-amount"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={edit(setAmount)}
          />
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
        {settings.goal_amount && (
          <Button type="button" variant="ghost" onClick={handleRemove} disabled={status === 'saving'}>
            Quitar
          </Button>
        )}
        <Button type="submit" disabled={status === 'saving'}>
          {status === 'saving' && <LoaderCircle className="animate-spin" />}
          Guardar
        </Button>
      </div>
    </form>
  )
}

function GoalSetting() {
  const { data, error } = useFinanceData().settings
  if (error) return <p className="text-destructive text-sm">{error.message}</p>
  if (!data) return <LoaderCircle className="text-muted-foreground mx-auto size-5 animate-spin" />
  return <GoalForm settings={data} />
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

/** Modal de ajustes (engranaje del encabezado): tema, gráfica, patrimonio inicial, restablecer datos y sesión. */
export function SettingsDialog({ open, onOpenChange }) {
  const { required: hasSession } = useAuth()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-6">
        <DialogHeader>
          <DialogTitle>Ajustes</DialogTitle>
          <DialogDescription className="sr-only">Apariencia, gráfica, patrimonio inicial, restablecer datos y sesión</DialogDescription>
        </DialogHeader>

        <Section title="Apariencia">
          <ThemeSetting />
        </Section>

        <Section title="Gráfica">
          <ChartSettings />
        </Section>

        <Section
          title="Objetivo"
          description="El patrimonio al que quieres llegar (un colchón, la entrada de un piso…). finan te dice cuándo llegas y, al añadir un gasto o un ingreso, cuánto lo adelanta o lo retrasa."
        >
          <GoalSetting />
        </Section>

        <Section
          title="Ahorro mensual"
          description="Lo que quieres apartar cada mes, antes de gastar. «Disponible este mes» es lo que te queda para gastos variables: ingresos del mes − gastos fijos − este ahorro − lo que ya has gastado. Déjalo vacío para no usarlo."
        >
          <SavingsTargetSetting />
        </Section>

        <Section
          title="Patrimonio inicial"
          description="Tu patrimonio neto (ahorros menos deudas) en una fecha, normalmente hoy. La gráfica parte de ese valor: suma o resta los flujos desde esa fecha y reconstruye hacia atrás los anteriores. Puede ser negativo."
        >
          <InitialBalanceSetting />
        </Section>

        <Section
          title="Restablecer datos"
          description="Elimina de golpe todos los gastos, todos los ingresos o ambos. El patrimonio inicial se mantiene."
        >
          <ResetSetting />
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
