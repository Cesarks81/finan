import { useState } from 'react'
import { CalendarCheck, ChevronRight, LoaderCircle, Trash2 } from 'lucide-react'

import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useFinanceData } from '@/hooks/useFinanceData'
import { formatDate, formatEUR, formatEURWhole, toISODate } from '@/lib/format'
import { anchorForToday, reviewDiff, reviewMonth, savedReviewDiff } from '@/lib/review'
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

/** Diferencia con signo y color: «+30 €» en verde, «−240 €» en rojo, «0 €» tenue. */
export function ReviewDiffText({ diff, className }) {
  const even = Math.abs(diff) < 1
  return (
    <span className={cn(even ? 'text-muted-foreground' : diff < 0 ? 'text-expense' : 'text-income', className)}>
      {!even && (diff > 0 ? '+' : '−')}
      {formatEURWhole(even ? 0 : Math.abs(diff))}
    </span>
  )
}

/**
 * Historial de revisiones: por cada una, lo previsto, lo real y la diferencia, con lo que se
 * escapó al día desde el ajuste anterior si faltaba dinero. Así se ve si la fuga baja mes a mes.
 * Con `onDelete`, cada fila tiene un botón para borrarla.
 */
export function ReviewHistory({ reviews, onDelete }) {
  return (
    <table className="w-full text-xs tabular-nums">
      <thead className="text-muted-foreground">
        <tr>
          <th className="py-1 text-left font-normal">Mes</th>
          <th className="py-1 text-right font-normal">Previsto</th>
          <th className="py-1 text-right font-normal">Real</th>
          <th className="py-1 text-right font-normal">Diferencia</th>
          {onDelete && (
            <th className="w-7 py-1">
              <span className="sr-only">Borrar</span>
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {reviews.map((review) => {
          const { diff, perDay } = savedReviewDiff(review)
          return (
            <tr key={review.id} className="border-t align-top">
              <td className="py-1.5">{reviewMonth(review)}</td>
              <td className="text-muted-foreground py-1.5 text-right">{formatEURWhole(review.forecast)}</td>
              <td className="py-1.5 text-right">{formatEURWhole(review.actual)}</td>
              <td className="py-1.5 text-right">
                <ReviewDiffText diff={diff} className="font-medium" />
                {perDay && <span className="text-muted-foreground block text-[11px]">{formatEURWhole(perDay)}/día</span>}
              </td>
              {onDelete && (
                <td className="py-0.5 text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(review)}
                    aria-label={`Borrar la revisión de ${reviewMonth(review)}`}
                    className="text-muted-foreground size-7"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </td>
              )}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function ReviewForm({ onDone, onSkip }) {
  const { projections, settings, reviews, refresh } = useFinanceData()
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
  const earlier = (reviews.data ?? []).filter((review) => review.review_date < today).slice(0, 3)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!valid) return
    setSaving(true)
    setError(null)
    try {
      // Guarda la revisión en el historial y ancla el patrimonio hoy: desde aquí la proyección
      // parte del saldo real.
      await api.createReview({
        review_date: today,
        forecast: forecast.toFixed(2),
        actual: value.toFixed(2),
        anchor: anchorForToday(value, todayPoint).toFixed(2),
      })
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

      {earlier.length > 0 && (
        <section aria-label="Revisiones anteriores" className="grid gap-1.5 border-t pt-4">
          <h3 className="text-muted-foreground m-0 text-xs font-semibold tracking-wide uppercase">
            Revisiones anteriores
          </h3>
          <ReviewHistory reviews={earlier} />
        </section>
      )}
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
