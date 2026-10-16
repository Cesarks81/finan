import { useEffect, useRef, useState } from 'react'
import {
  CalendarCheck,
  ChartLine,
  Check,
  ChevronLeft,
  ChevronRight,
  DatabaseBackup,
  Download,
  LoaderCircle,
  LogOut,
  Moon,
  RotateCcw,
  Target,
  Upload,
  Wallet,
} from 'lucide-react'

import { api } from '@/api/client'
import { ReviewDiffText, ReviewHistory } from '@/components/MonthlyReview'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/hooks/useAuth'
import { useApiQuery, useFinanceData } from '@/hooks/useFinanceData'
import { useTheme } from '@/hooks/useTheme'
import { backupFile, readBackup, saveFile } from '@/lib/backup'
import { formatDate, formatEURWhole, toISODate } from '@/lib/format'
import { reviewMonth, savedReviewDiff } from '@/lib/review'
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

const names = new Intl.ListFormat('es', { type: 'conjunction' })

/**
 * Patrimonio inicial y su fecha. Las inversiones con capital (lo invertido > 0) salen de él, así
 * que cambiarlo una vez fijado las elimina: el formulario lo avisa y pide confirmación, y la API
 * las borra en el mismo paso (`remove_investments`). Las que solo reciben aportaciones se quedan.
 */
function InitialBalanceForm({ settings }) {
  const { refresh, investments } = useFinanceData()
  const [amount, setAmount] = useState(settings.balance_date ? settings.initial_balance : '')
  const [balanceDate, setBalanceDate] = useState(() => settings.balance_date ?? toISODate(new Date()))
  const [status, setStatus] = useState('idle') // idle | saving | saved
  const [confirming, setConfirming] = useState(false)
  const [removed, setRemoved] = useState(0)
  const [error, setError] = useState(null)

  const value = String(amount).replace(',', '.')
  const changed =
    Boolean(settings.balance_date) &&
    (Number(value) !== Number(settings.initial_balance) || balanceDate !== settings.balance_date)
  const funded = (investments.data ?? []).filter((row) => Number(row.amount) > 0)
  const removing = changed && funded.length > 0
  const fundedNames = names.format(funded.map((row) => `«${row.name}»`))

  const edit = (setter) => (event) => {
    setter(event.target.value)
    setStatus('idle')
    setConfirming(false)
  }

  async function save() {
    setStatus('saving')
    setError(null)
    try {
      await api.updateSettings({ initial_balance: value, balance_date: balanceDate, remove_investments: removing })
      refresh()
      setRemoved(removing ? funded.length : 0)
      setConfirming(false)
      setStatus('saved')
    } catch (err) {
      setError(err.message)
      setStatus('idle')
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (removing) setConfirming(true)
    else save()
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-end gap-4">
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

      {removing && !confirming && (
        <p className="text-expense -mt-1 text-xs leading-relaxed">
          Si lo cambias, se eliminarán {funded.length === 1 ? 'tu inversión' : 'tus inversiones'} con capital (
          {fundedNames}), porque sale{funded.length === 1 ? '' : 'n'} de este patrimonio.
        </p>
      )}

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {confirming ? (
        <div className="border-destructive/40 grid gap-3 rounded-lg border p-3">
          <p className="text-sm">
            ¿Cambiar el patrimonio inicial y eliminar {fundedNames}? Lo invertido sale de este patrimonio. Las inversiones
            que solo reciben aportaciones mensuales se mantienen. No se puede deshacer.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setConfirming(false)} disabled={status === 'saving'}>
              No, cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={save} disabled={status === 'saving'}>
              {status === 'saving' && <LoaderCircle className="animate-spin" />}
              Sí, cambiar y eliminar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-end gap-3">
          {status === 'saved' && (
            <p role="status" className="text-income flex items-center gap-1 text-sm">
              <Check className="size-4" /> Guardado
              {removed > 0 && ` · ${removed} ${removed === 1 ? 'inversión eliminada' : 'inversiones eliminadas'}`}
            </p>
          )}
          <Button type="submit" disabled={status === 'saving'}>
            {status === 'saving' && <LoaderCircle className="animate-spin" />}
            Guardar
          </Button>
        </div>
      )}
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

/**
 * Copia de seguridad: guardar en un archivo los ajustes y todos los flujos, o importar uno, que
 * sustituye todos los datos tras confirmarlo. La copia se pide al abrir la pantalla para que el
 * botón la guarde sin esperas (en el móvil, compartir solo se permite justo al tocar).
 */
function BackupSetting() {
  const { version, refresh, flows } = useFinanceData()
  const backup = useApiQuery(api.exportBackup, [version])
  const input = useRef(null)
  const [pending, setPending] = useState(null) // copia leída del archivo, a falta de confirmar
  const [status, setStatus] = useState(null) // null | 'importing' | { imported }
  const [error, setError] = useState(null)

  async function handleChoose(event) {
    const file = event.target.files?.[0]
    event.target.value = '' // para poder volver a elegir el mismo archivo
    if (!file) return
    setPending(null)
    setStatus(null)
    setError(null)
    try {
      setPending(await readBackup(file))
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleImport() {
    setStatus('importing')
    setError(null)
    try {
      const { flows: imported } = await api.importBackup(pending)
      refresh()
      setPending(null)
      setStatus({ imported })
    } catch (err) {
      // Si el archivo no vale, no tiene sentido reintentarlo; si falla la conexión, sí.
      if (err.status === 422) setPending(null)
      setError(err.status === 422 ? 'El archivo tiene datos que finan no acepta. No se ha cambiado nada.' : err.message)
      setStatus(null)
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
        <div className="grid min-w-48 flex-1 gap-1">
          <p className="text-sm font-medium">Exportar</p>
          <p className="text-muted-foreground text-xs">
            {backup.data ? `Tus ${flowCount(backup.data.flows.length)} y tus ajustes, en un archivo.` : 'Preparando la copia…'}
          </p>
        </div>
        <Button variant="outline" onClick={() => saveFile(backupFile(backup.data))} disabled={!backup.data} className="ml-auto">
          <Download />
          Guardar copia
        </Button>
      </div>
      {backup.error && (
        <p role="alert" className="text-destructive text-sm">
          {backup.error.message}
        </p>
      )}

      <div className="grid gap-3 rounded-lg border p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="grid min-w-48 flex-1 gap-1">
            <p className="text-sm font-medium">Importar</p>
            <p className="text-muted-foreground text-xs">Recupera una copia: sustituye todos tus datos por los suyos.</p>
          </div>
          <Button
            variant="outline"
            onClick={() => input.current.click()}
            disabled={status === 'importing'}
            className="ml-auto"
          >
            <Upload />
            Elegir archivo…
          </Button>
          <input ref={input} type="file" accept=".json,application/json" onChange={handleChoose} className="hidden" />
        </div>

        {pending && (
          <div className="border-destructive/40 grid gap-3 rounded-lg border p-3">
            <p className="text-sm">
              Copia {pending.exported_on ? `del ${formatDate(pending.exported_on)} ` : ''}con{' '}
              {flowCount(pending.flows.length)}. Sustituirá todo lo que tienes ahora ({flowCount(flows.data?.length ?? 0)},
              patrimonio inicial, objetivo, inversiones y revisiones). No se puede deshacer: si quieres conservarlo, guarda
              antes una copia.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setPending(null)} disabled={status === 'importing'}>
                No, cancelar
              </Button>
              <Button variant="destructive" onClick={handleImport} disabled={status === 'importing'}>
                {status === 'importing' && <LoaderCircle className="animate-spin" />}
                Sí, importar
              </Button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {status?.imported !== undefined && (
        <p role="status" className="text-income flex items-center justify-end gap-1 text-sm">
          <Check className="size-4" /> Copia importada · {flowCount(status.imported)}
        </p>
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
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-end gap-4">
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

/** Historial de revisiones mensuales, con la opción de borrar una (tras confirmarlo). */
function ReviewsSetting() {
  const { reviews, refresh } = useFinanceData()
  const [confirming, setConfirming] = useState(null) // revisión a borrar
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      await api.deleteReview(confirming.id)
      refresh()
      setConfirming(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  if (reviews.error) return <p className="text-destructive text-sm">{reviews.error.message}</p>
  if (!reviews.data) return <LoaderCircle className="text-muted-foreground mx-auto size-5 animate-spin" />
  if (!reviews.data.length) {
    return (
      <p className="text-muted-foreground rounded-lg border p-3 text-sm">
        Aún no has hecho ninguna. Cuando toque, finan te avisará en la pantalla principal.
      </p>
    )
  }
  return (
    <div className="grid gap-3">
      <div className="rounded-lg border px-3 py-2">
        <ReviewHistory
          reviews={reviews.data}
          onDelete={(review) => {
            setConfirming(review)
            setError(null)
          }}
        />
      </div>
      {confirming && (
        <div className="border-destructive/40 grid gap-3 rounded-lg border p-3">
          <p className="text-sm">
            ¿Borrar la revisión de {reviewMonth(confirming)}? Solo se quita del historial: tu patrimonio inicial no
            cambia.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setConfirming(null)} disabled={deleting}>
              No, cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <LoaderCircle className="animate-spin" />}
              Sí, borrar
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  )
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
      'Tu patrimonio neto (ahorros menos deudas) en una fecha, normalmente hoy. La gráfica parte de ese valor: suma o resta los flujos desde esa fecha y reconstruye hacia atrás los anteriores. Puede ser negativo. Lo invertido sale de él: si lo cambias, se eliminan tus inversiones con capital. Para ajustarlo a tu saldo real sin tocarlas, usa la revisión mensual.',
    Content: InitialBalanceSetting,
  },
  goal: {
    title: 'Objetivo',
    description:
      'El patrimonio al que quieres llegar (un colchón, la entrada de un piso…). finan lo marca en la gráfica con una línea azul, te dice cuándo llegas y, al añadir un gasto o un ingreso, cuánto lo adelanta o lo retrasa.',
    Content: GoalSetting,
  },
  reviews: {
    title: 'Revisiones',
    description:
      'Cada mes, la revisión compara el saldo real de tus cuentas con lo que preveía finan. Lo que falta suele ser gasto que no apuntaste (tu fuga), repartido por día desde la revisión anterior. Si baja mes a mes, vas bien.',
    Content: ReviewsSetting,
  },
  backup: {
    title: 'Copia de seguridad',
    description:
      'Guarda en un archivo tus flujos, el patrimonio inicial, el objetivo, tus inversiones y tus revisiones, y recupéralos cuando quieras, en este dispositivo o en otro. El modo oscuro y las opciones de la gráfica no van en la copia: son de cada dispositivo.',
    Content: BackupSetting,
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
function summaries(settings, chart, reviews) {
  const options = [
    chart.splitLines && 'Ingresos y gastos',
    chart.calendar && 'Calendario',
    chart.realTerms && `€ de hoy (${String(chart.inflation).replace('.', ',')} %)`,
  ].filter(Boolean)
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
    reviews: !reviews
      ? null
      : reviews.length
        ? { last: reviews[0], diff: savedReviewDiff(reviews[0]).diff }
        : 'Ninguna todavía',
  }
}

function Menu({ onOpen }) {
  const { settings, chart, reviews } = useFinanceData()
  const { required: hasSession, logout } = useAuth()
  const summary = summaries(settings.data, chart, reviews.data)
  return (
    <div className="grid gap-5">
      <Group title="Preferencias">
        <ThemeRow />
        <Row icon={ChartLine} label="Gráfica" summary={summary.chart} onClick={() => onOpen('chart')} />
      </Group>
      <Group title="Mis finanzas">
        <Row icon={Wallet} label="Patrimonio inicial" summary={summary.balance} onClick={() => onOpen('balance')} />
        <Row icon={Target} label="Objetivo" summary={summary.goal} onClick={() => onOpen('goal')} />
        <Row
          icon={CalendarCheck}
          label="Revisiones"
          summary={
            summary.reviews?.last ? (
              <>
                Última: {reviewMonth(summary.reviews.last)} · <ReviewDiffText diff={summary.reviews.diff} />
              </>
            ) : (
              summary.reviews
            )
          }
          onClick={() => onOpen('reviews')}
        />
      </Group>
      <Group title="Datos">
        <Row
          icon={DatabaseBackup}
          label="Copia de seguridad"
          summary="Exportar o importar tus datos"
          onClick={() => onOpen('backup')}
        />
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
