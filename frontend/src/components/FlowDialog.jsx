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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useFinanceData } from '@/hooks/useFinanceData'
import { FIXED_TYPES, FLOW_ORDER, FLOW_TYPES, VARIABLE_TYPES } from '@/lib/flowTypes'
import { toISODate } from '@/lib/format'

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

  async function handleSubmit(event) {
    event.preventDefault()
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

        <Field label="Concepto" htmlFor="flow-concept">
          <Input
            id="flow-concept"
            value={form.concept}
            onChange={set('concept')}
            placeholder={`Ej.: ${type.placeholder}`}
            maxLength={120}
            required
            autoFocus
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field
            label={FIXED_TYPES.includes(form.flow_type) || form.variableMode !== 'once' ? 'Importe mensual (€)' : 'Importe (€)'}
            htmlFor="flow-amount"
          >
            <Input
              id="flow-amount"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={set('amount')}
              placeholder="0,00"
              required
            />
          </Field>
          <Field label={startDateLabel(form)} htmlFor="flow-start">
            <Input id="flow-start" type="date" value={form.start_date} onChange={set('start_date')} required />
          </Field>
        </div>

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

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {confirmingDelete ? (
        <div className="grid gap-3 rounded-lg border border-destructive/40 p-3">
          <p className="text-sm">
            ¿Eliminar «{flow.concept}»? La gráfica se recalculará sin él. No se puede deshacer.
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
