import { useState } from 'react'
import { LoaderCircle, Trash2, TrendingDown, TrendingUp } from 'lucide-react'

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useFinanceData } from '@/hooks/useFinanceData'
import { FIXED_TYPES, FLOW_ORDER, FLOW_TYPES, VARIABLE_TYPES, isRecurringFlow } from '@/lib/flowTypes'
import { formatEURWhole, formatMonthYear, toISODate } from '@/lib/format'
import { goalBasis, goalImpact, goalPoints, goalToday } from '@/lib/goal'
import { investedShift, investmentImpact, surplusWith } from '@/lib/investment'
import { cn } from '@/lib/utils'

// Periodicidad de un flujo variable (GVM / IVM): puntual o temporal (durante N meses / hasta una fecha).
const variableModes = (income) => [
  { value: 'once', label: income ? 'Puntual (un solo cobro)' : 'Puntual (un solo pago)' },
  { value: 'months', label: 'Mensual durante N meses' },
  { value: 'until', label: 'Mensual hasta una fecha' },
]

function initialForm(flow, defaultType) {
  if (flow) {
    return {
      flow_type: flow.flow_type,
      concept: flow.concept,
      amount: flow.amount,
      start_date: flow.start_date,
      end_date: flow.end_date ?? '',
      duration_months: flow.duration_months ?? '',
      variableMode: flow.duration_months ? 'months' : flow.end_date ? 'until' : 'once',
    }
  }
  return {
    flow_type: defaultType,
    concept: '',
    amount: '',
    start_date: toISODate(new Date()),
    end_date: '',
    duration_months: '',
    variableMode: 'once',
  }
}

/** Convierte el formulario en el cuerpo que espera la API, descartando campos que no aplican al tipo. */
function toPayload(form) {
  const payload = {
    flow_type: form.flow_type,
    concept: form.concept.trim(),
    amount: String(form.amount).replace(',', '.'),
    start_date: form.start_date,
    end_date: null,
    duration_months: null,
  }
  if (FIXED_TYPES.includes(form.flow_type)) {
    payload.end_date = form.end_date || null
  } else if (form.variableMode === 'months') {
    payload.duration_months = Number(form.duration_months)
  } else if (form.variableMode === 'until') {
    payload.end_date = form.end_date
  }
  return payload
}

function startDateLabel(form) {
  const type = FLOW_TYPES[form.flow_type]
  const recurring = FIXED_TYPES.includes(form.flow_type) || form.variableMode !== 'once'
  if (!recurring) return 'Fecha'
  return type.income ? 'Primer cobro' : 'Primer pago'
}

function Field({ label, htmlFor, hint, children }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  )
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function ImpactRow({ label, before, after, tone }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[13px]">
      <span className="min-w-0 truncate">{label}</span>
      <span className="shrink-0 tabular-nums">
        <span className="text-muted-foreground">{before} → </span>
        <span className={cn('font-semibold', tone === 'bad' && 'text-expense', tone === 'good' && 'text-income')}>{after}</span>
      </span>
    </div>
  )
}

/** Al editar un flujo, poner el importe a 0 € es quitarlo: al guardar se elimina (tras confirmarlo). */
const isRemoval = (form, flow) => Boolean(flow) && String(form.amount).trim() !== '' && Number(toPayload(form).amount) === 0

const euros = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 })

/**
 * Cuánto cambia lo que se invierte, en una frase: «Desde nov 2026 inviertes 50 € menos al mes»,
 * «En nov 2026 inviertes 350 € menos», «De nov 2026 a ene 2027 inviertes 50 € menos al mes
 * (150 € en total)»…
 */
function contributionText(change) {
  const word = change.total < 0 ? 'menos' : 'más'
  const total = formatEURWhole(Math.abs(change.total))
  const perMonth =
    Math.round(change.min) === Math.round(change.max)
      ? formatEURWhole(change.max)
      : `entre ${euros.format(change.min)} y ${formatEURWhole(change.max)}`
  const from = formatMonthYear(change.first)
  if (change.mixed) return `En total inviertes ${total} ${word}.`
  if (change.count === 1) return `En ${from} inviertes ${total} ${word}.`
  if (change.open) return `Desde ${from} inviertes ${perMonth} ${word} al mes.`
  const range = `De ${from} a ${formatMonthYear(change.last)}`
  if (Math.round(change.min) === Math.round(change.max)) return `${range} inviertes ${perMonth} ${word} al mes (${total} en total).`
  return `${range} inviertes ${total} ${word} en total.`
}

/**
 * «Así te afecta»: cómo cambian, con el flujo del formulario (al editar, en lugar del original),
 * la fecha del objetivo (con todo el patrimonio o solo con lo invertido, `goalBasis`) y, si hay
 * inversión, lo que se invierte: cada mes se aporta como mucho lo que sobra, así que un gasto
 * puede recortar las aportaciones (y lo que rinden) y un ingreso completarlas. Nada si no cambia
 * ninguna de las dos o si el formulario aún no está completo.
 */
function ImpactPreview({ form, flow }) {
  const { settings, projections, surplus, investments } = useFinanceData()
  const candidate = toPayload(form)
  // Al editar, 0 € es quitar el flujo: se ve cómo queda sin él.
  const removing = isRemoval(form, flow)
  const complete =
    removing ||
    (Number(candidate.amount) > 0 &&
    ISO_DATE.test(candidate.start_date) &&
    (form.variableMode !== 'months' || candidate.duration_months >= 1) &&
    (form.variableMode !== 'until' || ISO_DATE.test(candidate.end_date ?? '')))
  const long = projections.data?.long
  if (!complete || !long || !settings.data) return null

  const candidateFlow = removing ? null : { ...candidate, is_recurring: isRecurringFlow(candidate) }
  const balanceDate = settings.data.balance_date
  const list = surplus && investments.list?.length ? investments.list : null
  const after = list ? surplusWith(surplus, candidateFlow, flow) : null
  const invest = list ? investmentImpact(list, balanceDate, surplus, after, long.at(-1).period) : null
  const change = invest?.change && Math.abs(invest.change.total) >= 1 ? invest.change : null

  // Si el objetivo cuenta solo lo invertido, el flujo solo lo mueve por lo que cambia lo que se
  // aporta (y lo que eso rinde); sin inversiones, no lo mueve.
  const goal = settings.data.goal_amount
  const basis = goalBasis(settings.data)
  const reached = Number(goalToday(projections.data, basis)) >= Number(goal)
  const goalChange =
    !goal || reached
      ? null
      : basis === 'invested'
        ? list && goalImpact(goalPoints(long, basis), goal, null, null, null, investedShift(list, surplus, after))
        : goalImpact(long, goal, candidateFlow, flow, balanceDate, invest?.shift)
  const showGoal = goalChange && goalChange.before !== goalChange.after
  if (!showGoal && !change) return null
  const text = (month) => (month ? formatMonthYear(month) : 'más de 40 años')
  const later = goalChange && (goalChange.delta === null ? !goalChange.after : goalChange.delta > 0)
  const ChangeIcon = change?.total < 0 ? TrendingDown : TrendingUp
  const yourContribution =
    change &&
    `${investments.list.length > 1 ? 'tus aportaciones' : 'tu aportación'} de ${formatEURWhole(change.monthly)}`

  return (
    <section aria-label="Así te afecta" className="bg-muted/60 grid gap-2.5 rounded-lg px-3.5 py-3">
      <h3 className="text-muted-foreground m-0 text-xs font-semibold tracking-wide uppercase">Así te afecta</h3>
      {showGoal && (
        <ImpactRow
          label={settings.data.goal_name || 'Objetivo'}
          before={text(goalChange.before)}
          after={text(goalChange.after)}
          tone={later ? 'bad' : 'good'}
        />
      )}
      {change && (
        <p className={cn('m-0 flex gap-2 text-[13px] leading-snug', change.total < 0 ? 'text-expense' : 'text-income')}>
          <ChangeIcon className="mt-px size-4 shrink-0" aria-hidden="true" />
          <span>
            {contributionText(change)}{' '}
            <span className="text-muted-foreground">
              {change.total < 0
                ? `${change.count === 1 ? 'Ese mes' : 'Esos meses'} no te sobra para ${yourContribution}.`
                : `Te sobra más para completar ${yourContribution}.`}
            </span>
          </span>
        </p>
      )}
    </section>
  )
}

function FlowForm({ flow, defaultType, onDone }) {
  const { refresh } = useFinanceData()
  const [form, setForm] = useState(() => initialForm(flow, defaultType))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const type = FLOW_TYPES[form.flow_type]
  const variable = VARIABLE_TYPES.includes(form.flow_type)
  const set = (field) => (eventOrValue) =>
    setForm((current) => ({ ...current, [field]: eventOrValue?.target ? eventOrValue.target.value : eventOrValue }))

  const removing = isRemoval(form, flow)

  async function handleSubmit(event) {
    event.preventDefault()
    // Guardar un flujo a 0 € es eliminarlo: se pide la misma confirmación que con «Eliminar».
    if (removing) {
      setConfirmingDelete(true)
      return
    }
    const payload = toPayload(form)
    if (!payload.concept) {
      setError('Escribe un concepto.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (flow) await api.updateFlow(flow.id, payload)
      else await api.createFlow(payload)
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
      await api.deleteFlow(flow.id)
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
        <DialogTitle>
          {flow ? 'Editar' : 'Nuevo'} {type.label.toLowerCase()} · {type.code}
        </DialogTitle>
        <DialogDescription>{type.description}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
        {/* Al añadir, el tipo lo fija el botón pulsado (y lo dice el título); al editar se puede cambiar. */}
        {flow && (
          <Field label="Tipo" htmlFor="flow-type">
            <Select value={form.flow_type} onValueChange={set('flow_type')}>
              <SelectTrigger id="flow-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FLOW_ORDER.map((code) => (
                  <SelectItem key={code} value={code}>
                    <span className="font-semibold">{code}</span>
                    <span className="text-muted-foreground">{FLOW_TYPES[code].label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        {/* Primero el importe (el cursor empieza ahí: en móvil sale el teclado numérico, más bajo)
            y la fecha; después el concepto. Columnas que pueden encoger: en iOS el campo de fecha
            tiene un ancho mínimo y se salía por la derecha. */}
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-end gap-4">
          <Field
            label={FIXED_TYPES.includes(form.flow_type) || form.variableMode !== 'once' ? 'Importe mensual (€)' : 'Importe (€)'}
            htmlFor="flow-amount"
          >
            <Input
              id="flow-amount"
              type="number"
              inputMode="decimal"
              min={flow ? '0' : '0.01'}
              step="0.01"
              value={form.amount}
              onChange={set('amount')}
              required
              autoFocus
            />
          </Field>
          <Field label={startDateLabel(form)} htmlFor="flow-start">
            <Input
              id="flow-start"
              type="date"
              value={form.start_date}
              onChange={set('start_date')}
              required
              className="min-w-0 appearance-none"
            />
          </Field>
        </div>

        <Field label="Concepto" htmlFor="flow-concept">
          <Input
            id="flow-concept"
            value={form.concept}
            onChange={set('concept')}
            maxLength={120}
            required
          />
        </Field>


        {FIXED_TYPES.includes(form.flow_type) && (
          <Field label="Fecha de fin (opcional)" htmlFor="flow-end" hint="Déjala vacía si no tiene fecha de fin.">
            <Input
              id="flow-end"
              type="date"
              min={form.start_date}
              value={form.end_date}
              onChange={set('end_date')}
            />
          </Field>
        )}

        {variable && (
          <Field label="Periodicidad" htmlFor="flow-variable-mode">
            <Select value={form.variableMode} onValueChange={set('variableMode')}>
              <SelectTrigger id="flow-variable-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {variableModes(type.income).map((mode) => (
                  <SelectItem key={mode.value} value={mode.value}>
                    {mode.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        {variable && form.variableMode === 'months' && (
          <Field
            label="Duración (meses)"
            htmlFor="flow-duration"
            hint={type.income ? 'Ej.: 40 € al mes durante 10 meses.' : 'Ej.: una consola financiada a 200 € al mes durante 3 meses.'}
          >
            <Input
              id="flow-duration"
              type="number"
              inputMode="numeric"
              min="1"
              max="600"
              step="1"
              value={form.duration_months}
              onChange={set('duration_months')}
              required
            />
          </Field>
        )}

        {variable && form.variableMode === 'until' && (
          <Field label={type.income ? 'Último cobro' : 'Último pago'} htmlFor="flow-until">
            <Input
              id="flow-until"
              type="date"
              min={form.start_date}
              value={form.end_date}
              onChange={set('end_date')}
              required
            />
          </Field>
        )}
      </div>

      <ImpactPreview form={form} flow={flow} />

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {confirmingDelete ? (
        <div className="grid gap-3 rounded-lg border border-destructive/40 p-3">
          <p className="text-sm">
            {removing ? 'Con 0 €, ¿eliminar' : '¿Eliminar'} «{flow.concept}»? La gráfica se recalculará sin él. No se
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
          {flow && (
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
            {flow ? 'Guardar cambios' : 'Añadir'}
          </Button>
        </DialogFooter>
      )}
    </form>
  )
}

/**
 * Modal para crear (con `defaultType`) o editar (con `flow`) un flujo. Cambiar `formKey`
 * en cada apertura reinicia el formulario aunque el cierre anterior siga animándose.
 */
export function FlowDialog({ open, onOpenChange, flow = null, defaultType = 'GVM', formKey }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <FlowForm key={formKey} flow={flow} defaultType={defaultType} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}
