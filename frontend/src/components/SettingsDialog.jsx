import { useEffect, useRef, useState } from 'react'
import {
  ChartLine,
  Check,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  LogOut,
  Moon,
  RotateCcw,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react'

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
import { formatDate, formatEURWhole, toISODate } from '@/lib/format'
import { investmentOf, investmentValue } from '@/lib/investment'
import { cn } from '@/lib/utils'

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

/** «Euros de hoy»: interruptor y, activado, la inflación anual que se descuenta (en %). */
function InflationSetting() {
  const { realTerms, setRealTerms, inflation, setInflation } = useFinanceData().chart
  // El campo guarda lo que se escribe; la gráfica solo cambia con valores válidos (0–20 %).
  const [rate, setRate] = useState(String(inflation).replace('.', ','))

  function handleRate(event) {
    setRate(event.target.value)
    const value = Number(event.target.value.replace(',', '.'))
    if (event.target.value !== '' && Number.isFinite(value) && value >= 0 && value <= 20) setInflation(value)
  }

  return (
    <div className="grid gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="settings-real-terms" className="grid gap-1">
          Euros de hoy
          <span className="text-muted-foreground text-xs font-normal">
            Descuenta la inflación: cada importe de la gráfica y del objetivo se ve con lo que se podría comprar hoy
            con él. Lo de dentro de unos años vale menos; lo de hace años, más.
          </span>
        </Label>
        <Switch id="settings-real-terms" checked={realTerms} onCheckedChange={setRealTerms} />
      </div>
      {realTerms && (
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="settings-inflation" className="text-sm font-normal">
            Inflación anual (%)
          </Label>
          <Input
            id="settings-inflation"
            type="text"
            inputMode="decimal"
            value={rate}
            onChange={handleRate}
            aria-invalid={rate !== '' && Number(rate.replace(',', '.')) !== inflation}
            className="w-20 text-right tabular-nums"
          />
        </div>
      )}
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
      <InflationSetting />
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

/**
 * Inversión: lo invertido hoy, la aportación mensual y la rentabilidad anual esperada. Al abrir,
 * «Invertido hoy» ya trae lo que valdría hoy lo guardado (con lo que ha rendido y aportado), y al
 * guardar se toma esa cifra como punto de partida con fecha de hoy.
 */
function InvestmentForm({ settings }) {
  const { refresh } = useFinanceData()
  const [today] = useState(() => toISODate(new Date()))
  const current = investmentOf(settings)
  const [form, setForm] = useState(() => ({
    amount: current ? investmentValue(current, today).toFixed(2) : '',
    monthly: current?.monthly ? String(current.monthly) : '',
    rate: current ? String(Number(settings.invest_return)) : '',
  }))
  const [status, setStatus] = useState('idle') // idle | saving | saved
  const [error, setError] = useState(null)
  const edit = (field) => (event) => {
    setForm((f) => ({ ...f, [field]: event.target.value }))
    setStatus('idle')
  }
  const clean = (value) => String(value).trim().replace(',', '.')

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
    save({
      invest_amount: clean(form.amount),
      invest_monthly: clean(form.monthly) || '0',
      invest_return: clean(form.rate),
      invest_date: today,
    })
  }

  function handleRemove() {
    setForm({ amount: '', monthly: '', rate: '' })
    save({ invest_amount: null, invest_monthly: null, invest_return: null, invest_date: null })
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="invest-amount">Invertido hoy (€)</Label>
        <Input
          id="invest-amount"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={form.amount}
          onChange={edit('amount')}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="invest-monthly">Aportas al mes (€)</Label>
        <Input
          id="invest-monthly"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={form.monthly}
          onChange={edit('monthly')}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="invest-return">Rentabilidad anual esperada (%)</Label>
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
        {current && (
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

function InvestmentSetting() {
  const { data, error } = useFinanceData().settings
  if (error) return <p className="text-destructive text-sm">{error.message}</p>
  if (!data) return <LoaderCircle className="text-muted-foreground mx-auto size-5 animate-spin" />
  return <InvestmentForm settings={data} />
}

const PAGES = {
  chart: {
    title: 'Gráfica',
    description: 'Cómo se ve la gráfica en este dispositivo.',
    Content: ChartSettings,
  },
  balance: {
    title: 'Patrimonio inicial',
    description:
      'Tu patrimonio neto (ahorros menos deudas) en una fecha, normalmente hoy. La gráfica parte de ese valor: suma o resta los flujos desde esa fecha y reconstruye hacia atrás los anteriores. Puede ser negativo.',
    Content: InitialBalanceSetting,
  },
  goal: {
    title: 'Objetivo',
    description:
      'El patrimonio al que quieres llegar (un colchón, la entrada de un piso…). finan lo marca en la gráfica con una línea azul, te dice cuándo llegas y, al añadir un gasto o un ingreso, cuánto lo adelanta o lo retrasa.',
    Content: GoalSetting,
  },
  investment: {
    title: 'Inversión',
    description:
      'Qué parte de tu patrimonio está en fondos, acciones o similares (ya cuenta dentro de tu patrimonio: aquí solo dices cuánto está invertido). Solo esa parte crece con la rentabilidad; el resto, no. Lo que aportas cada mes sale de lo que ahorras (no es un gasto) y también rinde. La gráfica sigue mostrando el patrimonio total.',
    Content: InvestmentSetting,
  },
  reset: {
    title: 'Restablecer datos',
    description: 'Elimina de golpe todos los gastos, todos los ingresos o ambos. El patrimonio inicial se mantiene.',
    Content: ResetSetting,
  },
}

function Group({ title, children }) {
  return (
    <section className="grid gap-1.5">
      <h3 className="text-muted-foreground px-1 text-xs font-medium tracking-wide uppercase">{title}</h3>
      <div className="divide-y overflow-hidden rounded-lg border">{children}</div>
    </section>
  )
}

/** Fila del menú: icono, nombre y, debajo, el valor actual; abre su pantalla (o hace `onClick`). */
function Row({ icon: Icon, label, summary, onClick, tone }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:bg-accent flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors"
    >
      <Icon className={cn('text-muted-foreground size-4 shrink-0', tone)} aria-hidden="true" />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className={cn('text-sm font-medium', tone)}>{label}</span>
        {summary && <span className="text-muted-foreground truncate text-xs">{summary}</span>}
      </span>
      <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
    </button>
  )
}

function ThemeRow() {
  const { theme, setTheme } = useTheme()
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <Moon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
      <Label htmlFor="settings-dark-mode" className="flex-1 text-sm font-medium">
        Modo oscuro
      </Label>
      <Switch
        id="settings-dark-mode"
        checked={theme === 'dark'}
        onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
      />
    </div>
  )
}

/** Resúmenes de cada fila del menú, con lo que hay guardado. */
function summaries(settings, chart) {
  const options = [
    chart.splitLines && 'Ingresos y gastos',
    chart.calendar && 'Calendario',
    chart.realTerms && `€ de hoy (${String(chart.inflation).replace('.', ',')} %)`,
  ].filter(Boolean)
  const investment = settings && investmentOf(settings)
  return {
    chart: options.length ? options.join(' · ') : 'Patrimonio, vista centrada en hoy',
    balance: !settings
      ? null
      : settings.balance_date
        ? `${formatEURWhole(settings.initial_balance)} · ${formatDate(settings.balance_date)}`
        : 'Sin definir',
    goal: !settings
      ? null
      : settings.goal_amount
        ? `${settings.goal_name || 'Objetivo'} · ${formatEURWhole(settings.goal_amount)}`
        : 'Sin definir',
    investment: !settings
      ? null
      : investment
        ? [
            formatEURWhole(investment.amount),
            investment.monthly ? `${formatEURWhole(investment.monthly)}/mes` : null,
            `${String(Number(settings.invest_return)).replace('.', ',')} %`,
          ]
            .filter(Boolean)
            .join(' · ')
        : 'Sin inversión',
  }
}

function Menu({ onOpen }) {
  const { settings, chart } = useFinanceData()
  const { required: hasSession, logout } = useAuth()
  const summary = summaries(settings.data, chart)
  return (
    <div className="grid gap-5">
      <Group title="Preferencias">
        <ThemeRow />
        <Row icon={ChartLine} label="Gráfica" summary={summary.chart} onClick={() => onOpen('chart')} />
      </Group>
      <Group title="Mis finanzas">
        <Row icon={Wallet} label="Patrimonio inicial" summary={summary.balance} onClick={() => onOpen('balance')} />
        <Row icon={Target} label="Objetivo" summary={summary.goal} onClick={() => onOpen('goal')} />
        <Row icon={TrendingUp} label="Inversión" summary={summary.investment} onClick={() => onOpen('investment')} />
      </Group>
      <Group title="Datos">
        <Row
          icon={RotateCcw}
          label="Restablecer datos"
          summary="Borrar gastos, ingresos o ambos"
          onClick={() => onOpen('reset')}
          tone="text-destructive"
        />
        {hasSession && <Row icon={LogOut} label="Cerrar sesión en este dispositivo" onClick={logout} />}
      </Group>
    </div>
  )
}

/**
 * Ajustes, en dos niveles: un menú agrupado (Preferencias, Mis finanzas, Datos) donde cada fila
 * enseña su valor actual, y una pantalla por ajuste con su explicación, con flecha para volver.
 * El modo oscuro se cambia en el propio menú. `initialPage` abre directamente una pantalla
 * (p. ej. 'goal' desde la tarjeta del objetivo).
 */
function SettingsBody({ initialPage }) {
  const [page, setPage] = useState(initialPage)
  const ref = useRef(null)
  const current = page ? PAGES[page] : null

  // Cada pantalla empieza arriba del todo.
  useEffect(() => {
    ref.current?.closest('[data-slot=dialog-content]')?.scrollTo(0, 0)
  }, [page])

  return (
    <div ref={ref} className="grid gap-5">
      <DialogHeader className="flex-row items-center gap-1 pr-6">
        {current && (
          <Button variant="ghost" size="icon" onClick={() => setPage(null)} aria-label="Volver a Ajustes" className="-my-2 -ml-2 size-8">
            <ChevronLeft className="size-5" />
          </Button>
        )}
        <DialogTitle>{current ? current.title : 'Ajustes'}</DialogTitle>
        <DialogDescription className="sr-only">
          {current ? current.description : 'Preferencias, mis finanzas y datos'}
        </DialogDescription>
      </DialogHeader>
      {current ? (
        <div className="grid gap-4">
          <p className="text-muted-foreground text-xs leading-relaxed">{current.description}</p>
          <current.Content />
        </div>
      ) : (
        <Menu onOpen={setPage} />
      )}
    </div>
  )
}

export function SettingsDialog({ open, onOpenChange, page = null, formKey }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <SettingsBody key={formKey} initialPage={page} />
      </DialogContent>
    </Dialog>
  )
}
