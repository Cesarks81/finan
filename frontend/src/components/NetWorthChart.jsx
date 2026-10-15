import { useId, useMemo, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { GranularitySelector } from '@/components/GranularitySelector'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useFinanceData } from '@/hooks/useFinanceData'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import {
  currentPeriod,
  formatEUR,
  formatEURCompact,
  formatPeriod,
} from '@/lib/format'
import { cn } from '@/lib/utils'

const axisTick = { fill: 'var(--muted-foreground)', fontSize: 12 }

// El máximo visible queda hacia el 45 % de la altura, así la curva no se pega al borde
// superior y queda aire limpio por encima.
const PEAK_HEIGHT = 0.45

/** Paso «bonito» (1, 2, 2,5 o 5 × 10ⁿ) para dividir `range` en unas `count` marcas. */
function niceStep(range, count) {
  const raw = range / count
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const normalized = raw / magnitude
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10
  return nice * magnitude
}

/**
 * Escala del eje Y para los valores visibles: `domain` y marcas equidistantes con valores
 * limpios. El máximo queda hacia el 40–45 % de la altura, con un pequeño margen por debajo
 * (sin bajar de 0 si todo es positivo).
 */
function yScale(values) {
  if (!values.length) return { domain: ['auto', 'auto'], ticks: undefined }
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo || Math.max(Math.abs(hi) * 0.1, 1)
  const bottom = lo >= 0 ? Math.max(0, lo - span * 0.15) : lo - span * 0.15
  const top = Math.max(bottom + (hi - bottom) / PEAK_HEIGHT, bottom + span)

  const step = niceStep(top - bottom, 5)
  const first = Math.floor(bottom / step) * step
  let last = Math.ceil(top / step) * step
  // Redondear las marcas puede subir el pico: si pasa de la mitad, un paso más de aire.
  while ((hi - first) / (last - first) > 0.5) last += step
  const ticks = []
  for (let value = first; value <= last + step / 2; value += step) ticks.push(Math.round(value * 100) / 100)
  return { domain: [first, last], ticks }
}

// Modo «ingresos y gastos por separado»: ingresos y gastos acumulados desde el inicio de la vista.
const SPLIT_SERIES = [
  { key: 'incomeTotal', name: 'Ingresos', color: 'var(--chart-1)' },
  { key: 'expenseTotal', name: 'Gastos', color: 'var(--expense)' },
]

// Degradado bajo cada línea, el mismo de la gráfica de patrimonio.
const GRADIENTS = [{ key: 'balance', color: 'var(--chart-1)' }, ...SPLIT_SERIES]

// Capa por defecto de las áreas en Recharts; la línea de delante va una por encima.
const AREA_Z_INDEX = 100

/**
 * Capa de cada una de las dos líneas: la que llega más alto va detrás y la otra delante, para
 * que el degradado de la de arriba no tape a la de abajo y siempre se vean las dos.
 */
function splitLayers(points) {
  const peak = (key) => Math.max(0, ...points.map((p) => p[key]))
  const incomeOnTop = peak('incomeTotal') >= peak('expenseTotal')
  return {
    incomeTotal: AREA_Z_INDEX + (incomeOnTop ? 0 : 1),
    expenseTotal: AREA_Z_INDEX + (incomeOnTop ? 1 : 0),
  }
}

/** Puntos de /projection como números, con los ingresos y gastos acumulados desde el primero. */
function toChartPoints(apiPoints) {
  // Acumulados en céntimos para no arrastrar errores de coma flotante.
  let incomeCents = 0
  let expenseCents = 0
  return apiPoints.map((p) => {
    incomeCents += Math.round(Number(p.income) * 100)
    expenseCents += Math.round(Number(p.expense) * 100)
    return {
      period: p.period,
      balance: Number(p.balance),
      income: Number(p.income),
      expense: Number(p.expense),
      incomeTotal: incomeCents / 100,
      expenseTotal: expenseCents / 100,
    }
  })
}

function TooltipRow({ label, children, className }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('tabular-nums', className)}>{children}</span>
    </div>
  )
}

function SplitTooltip({ point }) {
  const difference = point.incomeTotal - point.expenseTotal
  return (
    <>
      <TooltipRow label="Ingresos acumulados" className="text-chart-1">
        +{formatEUR(point.incomeTotal)}
      </TooltipRow>
      <TooltipRow label="Gastos acumulados" className="text-expense">
        −{formatEUR(point.expenseTotal)}
      </TooltipRow>
      <TooltipRow label="Diferencia" className="font-semibold">
        {difference > 0 ? '+' : ''}
        {formatEUR(difference)}
      </TooltipRow>
    </>
  )
}

function ChartTooltip({ active, payload, granularity, splitLines }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  if (splitLines) {
    return (
      <div className="bg-popover text-popover-foreground grid min-w-52 gap-1.5 rounded-lg border px-3 py-2 text-xs shadow-md">
        <p className="font-medium">{formatPeriod(point.period, granularity, { long: true })}</p>
        <SplitTooltip point={point} />
      </div>
    )
  }
  return (
    <div className="bg-popover text-popover-foreground grid min-w-44 gap-1.5 rounded-lg border px-3 py-2 text-xs shadow-md">
      <p className="font-medium">{formatPeriod(point.period, granularity, { long: true })}</p>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Patrimonio</span>
        <span className="font-semibold tabular-nums">{formatEUR(point.balance)}</span>
      </div>
      {point.income > 0 && (
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Ingresos</span>
          <span className="text-income tabular-nums">+{formatEUR(point.income)}</span>
        </div>
      )}
      {point.expense > 0 && (
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Gastos</span>
          <span className="text-expense tabular-nums">−{formatEUR(point.expense)}</span>
        </div>
      )}
    </div>
  )
}

/**
 * Gráfica de patrimonio con el selector D/M/A integrado abajo a la derecha. En móvil ocupa
 * todo el ancho, sin tarjeta ni ejes; en PC va en tarjeta, con ejes y rejilla.
 * Con `splitLines` (ajuste «Ingresos y gastos por separado») muestra en su lugar dos líneas:
 * ingresos (azul) y gastos (rojo) acumulados desde el inicio de la vista.
 */
export function NetWorthChart({ splitLines = false, className }) {
  const gradientId = useId()
  const isDesktop = useIsDesktop()
  const [granularity, setGranularity] = useState('M')
  // Las tres vistas ya están en memoria: cambiar de una a otra no hace peticiones.
  const { projections } = useFinanceData()
  const { error, loading } = projections
  const data = projections.data?.[granularity]

  const points = useMemo(() => toChartPoints(data?.points ?? []), [data])
  const layers = useMemo(() => splitLayers(points), [points])
  const hasNegative = !splitLines && points.some((p) => p.balance < 0)
  const scale = useMemo(
    () =>
      yScale(splitLines ? points.flatMap((p) => [p.incomeTotal, p.expenseTotal]) : points.map((p) => p.balance)),
    [points, splitLines],
  )

  return (
    <Card
      className={cn(
        '-mx-4 gap-3 rounded-none border-0 bg-transparent py-0 shadow-none',
        'md:mx-0 md:gap-4 md:rounded-xl md:border md:bg-card md:py-6 md:shadow-sm',
        className,
      )}
    >
      <CardHeader className="px-4 md:px-6">
        <CardTitle className="flex items-center gap-2 text-sm tracking-wide uppercase">
          {splitLines ? 'Ingresos y gastos' : 'Evolución patrimonio'}
          {/* Indicador discreto de actualización: aparece al instante y, al terminar, se queda un
              momento y se desvanece, para que se note aunque la recarga sea rápida. La gráfica
              sigue mostrando los datos anteriores y se puede usar mientras tanto. */}
          <LoaderCircle
            role={loading ? 'status' : undefined}
            aria-label={loading ? 'Actualizando' : undefined}
            aria-hidden={!loading}
            className={cn(
              'text-muted-foreground size-3.5 animate-spin transition-opacity',
              loading ? 'opacity-60 duration-150' : 'opacity-0 delay-300 duration-700',
            )}
          />
        </CardTitle>
        {splitLines && (
          <CardAction className="flex gap-3 text-xs">
            {SPLIT_SERIES.map((series) => (
              <span key={series.key} className="text-muted-foreground flex items-center gap-1.5">
                <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ backgroundColor: series.color }} />
                {series.name}
              </span>
            ))}
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col px-0 md:px-4">
        {/* touch-none: al arrastrar el dedo por la gráfica solo se mueve el indicador, no la página. */}
        <div className="relative min-h-40 flex-1 touch-none md:h-80 md:flex-none">
          {error ? (
            <div className="text-muted-foreground flex h-full items-center justify-center px-6 text-center text-sm">
              {error.message}
            </div>
          ) : (
            data && (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  // Montar de nuevo al cambiar de vista (o de modo) repite la animación de la línea dibujándose.
                  key={`${granularity}-${splitLines}`}
                  data={points}
                  margin={isDesktop ? { top: 16, right: 12, left: 4, bottom: 0 } : { top: 16, right: 0, left: 0, bottom: 0 }}
                >
                  <defs>
                    {GRADIENTS.map(({ key, color }) => (
                      <linearGradient key={key} id={`${gradientId}-${key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={color} stopOpacity={0.35} />
                        <stop offset="95%" stopColor={color} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  {isDesktop && <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />}
                  <XAxis
                    hide={!isDesktop}
                    dataKey="period"
                    tickFormatter={(p) => formatPeriod(p, granularity)}
                    tick={axisTick}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                    tickMargin={8}
                  />
                  <YAxis
                    hide={!isDesktop}
                    domain={scale.domain}
                    ticks={scale.ticks}
                    tickFormatter={formatEURCompact}
                    tick={axisTick}
                    tickLine={false}
                    axisLine={false}
                    width={72}
                  />
                  <Tooltip
                    content={<ChartTooltip granularity={granularity} splitLines={splitLines} />}
                    cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '3 3' }}
                  />
                  {hasNegative && <ReferenceLine y={0} stroke="var(--expense)" strokeOpacity={0.5} />}
                  <ReferenceLine
                    x={currentPeriod(granularity)}
                    stroke="var(--muted-foreground)"
                    strokeDasharray="4 4"
                    label={{ value: 'Hoy', position: 'insideTopLeft', fill: 'var(--muted-foreground)', fontSize: 11 }}
                  />
                  {splitLines ? (
                    SPLIT_SERIES.map((series) => (
                      <Area
                        key={series.key}
                        zIndex={layers[series.key]}
                        type="monotone"
                        dataKey={series.key}
                        name={series.name}
                        stroke={series.color}
                        strokeWidth={2}
                        fill={`url(#${gradientId}-${series.key})`}
                        activeDot={{ r: 4 }}
                      />
                    ))
                  ) : (
                    <Area
                      type="monotone"
                      dataKey="balance"
                      name="Patrimonio"
                      stroke="var(--chart-1)"
                      strokeWidth={2}
                      fill={`url(#${gradientId}-balance)`}
                      activeDot={{ r: 4 }}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            )
          )}
          {/* En PC queda justo encima de las etiquetas del eje X. */}
          <GranularitySelector
            value={granularity}
            onChange={setGranularity}
            className="absolute right-4 bottom-2 md:right-3 md:bottom-9"
          />
        </div>
      </CardContent>
    </Card>
  )
}
