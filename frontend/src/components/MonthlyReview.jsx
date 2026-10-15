import { useState } from 'react'
import { CalendarCheck, ChevronRight, LoaderCircle } from 'lucide-react'

import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useFinanceData } from '@/hooks/useFinanceData'
import { formatDate, formatEUR, formatEURWhole, toISODate } from '@/lib/format'
import { anchorForToday, reviewDiff } from '@/lib/review'
import { cn } from '@/lib/utils'

const monthName = new Intl.DateTimeFormat('es-ES', { month: 'long' })
const reviewTitle = () => `Revisión de ${monthName.format(new Date())}`

/**
 * Aviso de que toca la revisión del mes. En móvil, una barra sobre los botones de flujo; en PC
 * (`card`), una tarjeta en la columna de los botones.
 */
export function ReviewReminder({ card = false, onOpen, className }) {
  if (card) {
    return (
      <Card className={cn('gap-2 px-5 py-4', className)}>
        <p className="m-0 flex items-center gap-2 text-sm font-semibold">
          <CalendarCheck className="text-chart-1 size-4" aria-hidden="true" /> {reviewTitle()}
        </p>
        <p className="text-muted-foreground m-0 text-xs leading-relaxed">
          Compara tu saldo real con lo previsto. 2 minutos.
        </p>
        <Button variant="outline" size="sm" onClick={onOpen} className="mt-1">
          Revisar ahora
        </Button>
      </Card>
    )
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'bg-card hover:bg-accent flex h-11 w-full shrink-0 items-center gap-2.5 rounded-xl border px-3 text-left text-[13px] transition-colors',
        className,
      )}
    >
      <CalendarCheck className="text-chart-1 size-[18px] shrink-0" aria-hidden="true" />
      <span className="flex-1">
        <span className="font-semibold">{reviewTitle()}</span> <span className="text-muted-foreground">· 2 min</span>
      </span>
      <ChevronRight className="text-muted-foreground size-4" aria-hidden="true" />
    </button>
  )
}

function Row({ label, children, strong = false }) {
  return (
    <div className={cn('flex justify-between gap-3', strong ? 'text-sm font-semibold' : 'text-[13px]')}>
      <span className={cn(!strong && 'text-muted-foreground')}>{label}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  )
}

/** Qué significa la diferencia, en una frase. */
function diffHint({ diff, perDay }, previous) {
  if (Math.abs(diff) < 1) return 'Cuadra con lo previsto: lo tienes todo apuntado.'
  if (diff > 0) return 'Tienes más de lo previsto: algún ingreso sin apuntar o un gasto que no llegó a hacerse.'
  if (perDay) {
    return `Gastos que no llegaste a apuntar: unos ${formatEURWhole(perDay)} al día desde el ${formatDate(previous)}. Es tu fuga.`
  }
  return 'Tienes menos de lo previsto: algún gasto sin apuntar.'
}

function ReviewForm({ onDone, onSkip }) {
  const { projections, settings, refresh } = useFinanceData()
  const [real, setReal] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Fijo mientras el formulario está abierto.
  const [today] = useState(() => toISODate(new Date()))
  const forecast = Number(projections.data?.todayBalance ?? 0)
  const todayPoint = projections.data?.D.points.find((p) => p.period === today)
  const value = Number(String(real).replace(',', '.'))
  const valid = real !== '' && Number.isFinite(value)
  const previous = settings.data?.balance_date && settings.data.balance_date < today ? settings.data.balance_date : null
  const result = valid ? reviewDiff(value, forecast, previous) : null

  async function handleSubmit(event) {
    event.preventDefault()
    if (!valid) return
    setSaving(true)
    setError(null)
    try {
      // Ancla el patrimonio hoy: desde aquí la proyección parte del saldo real.
      await api.updateSettings({ initial_balance: anchorForToday(value, todayPoint).toFixed(2), balance_date: today })
      refresh()
      onDone()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{reviewTitle()}</DialogTitle>
        <DialogDescription>Mira el saldo de tus cuentas y escríbelo aquí: es tu patrimonio real de hoy.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-2">
        <Label htmlFor="review-real">Saldo real hoy (€)</Label>
        <Input
          id="review-real"
          type="number"
          inputMode="decimal"
          step="0.01"
          value={real}
          onChange={(event) => setReal(event.target.value)}
          required
          autoFocus
          className="h-11 text-lg font-semibold tabular-nums"
        />
      </div>

      <section aria-label="Comparación" className="bg-muted/60 grid gap-2.5 rounded-lg px-3.5 py-3">
        <Row label="Previsto por finan">{formatEUR(forecast)}</Row>
        <Row label="Real">{valid ? formatEUR(value) : '—'}</Row>
        <div aria-hidden="true" className="bg-border h-px" />
        <Row label="Diferencia" strong>
          {result ? (
            <span className={cn(result.diff < 0 ? 'text-expense' : result.diff > 0 ? 'text-income' : 'text-muted-foreground')}>
              {result.diff > 0 && '+'}
              {formatEUR(result.diff)}
            </span>
          ) : (
            '—'
          )}
        </Row>
        {result && <p className="text-muted-foreground m-0 text-xs leading-relaxed">{diffHint(result, previous)}</p>}
      </section>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <div className="grid gap-2">
        <Button type="submit" disabled={!valid || saving}>
          {saving && <LoaderCircle className="animate-spin" />}
          Ajustar al saldo real
        </Button>
        <Button type="button" variant="outline" onClick={onSkip}>
          Este mes no
        </Button>
      </div>
      <p className="text-muted-foreground m-0 text-center text-xs leading-relaxed">
        La gráfica partirá de este saldo; tus flujos no cambian.
      </p>
    </form>
  )
}

/** Modal de la revisión: saldo real frente a lo previsto y ajuste de la proyección. */
export function ReviewDialog({ open, onOpenChange, onSkip, formKey }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <ReviewForm
          key={formKey}
          onDone={() => onOpenChange(false)}
          onSkip={() => {
            onSkip()
            onOpenChange(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
