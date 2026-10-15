import { useEffect, useId, useMemo, useState } from 'react'
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
  useActiveTooltipLabel,
  usePlotArea,
  useYAxisScale,
} from 'recharts'

import { GranularitySelector } from '@/components/GranularitySelector'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useFinanceData } from '@/hooks/useFinanceData'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import {
  currentPeriod,
  formatEUR,
  formatEURCompact,
  formatPercentSigned,
  formatPointsSigned,
  formatPeriod,
} from '@/lib/format'
import { savingsTrend } from '@/lib/savingsStats'
import { cn } from '@/lib/utils'

const axisTick = { fill: 'var(--muted-foreground)', fontSize: 12 }
// Móvil: ejes discretos. Las fechas, pequeñas debajo; los importes, dentro de la gráfica a la
// izquierda (`mirror`), tenues y justo encima de su línea guía, alineados con el margen de la página.

/** Fecha del eje X en móvil: las de los extremos se alinean hacia dentro para no cortarse. */
function MobileXTick({ x, y, payload, width, index, tickFormatter }) {
  const anchor = x < 24 ? 'start' : x > Number(width) - 24 ? 'end' : 'middle'
  return (
    <text x={x} y={y} dy="0.71em" textAnchor={anchor} fill="var(--muted-foreground)" fontSize={10}>
      {tickFormatter ? tickFormatter(payload.value, index) : payload.value}
    </text>
  )
}
const mobileYTick = { fill: 'var(--muted-foreground)', fillOpacity: 0.7, fontSize: 10, dx: 8, dy: -6 }

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

// Lo que se muestra como «0,0» (menos de 0,05 puntos) va en gris, no en verde ni en rojo.
function toneOf(value) {
  if (value > 0.0005) return 'text-income'
  if (value < -0.0005) return 'text-expense'
  return 'text-muted-foreground'
}

/**
 * Línea discreta con la evolución del ahorro (`savingsTrend`): en móvil bajo el título; en PC
 * arriba a la derecha, a la altura del título. `unit` es el periodo comparado («mes» o «año»).
 */
function ChartSummary({ stats, unit, className }) {
  return (
    <CardDescription className={cn('flex flex-wrap gap-x-3 gap-y-0.5 text-xs', className)}>
      <span title={`Media de cuánto cambia lo que ahorras (ingresos − gastos) de un ${unit} al siguiente`}>
        Media de ahorro{' '}
        <span className={cn('font-medium tabular-nums', toneOf(stats.average))}>
          {stats.average === null ? '—' : formatPercentSigned(stats.average)}
        </span>
      </span>
      <span title={`Si ese cambio se acelera (+) o se frena (−) de un ${unit} al siguiente, en puntos porcentuales`}>
        Tendencia{' '}
        <span className={cn('font-medium tabular-nums', toneOf(stats.trend))}>
          {stats.trend === null ? '—' : formatPointsSigned(stats.trend)}
        </span>
      </span>
    </CardDescription>
  )
}

/*
 * Con el dedo, la información de un punto solo se ve mientras se toca la gráfica. Recharts solo
 * atiende al dedo cuando se mueve y, tras un toque, el navegador emite eventos de ratón que lo
 * dejan «encima» para siempre (un dedo nunca sale de la gráfica). Así que se le avisa a mano:
 * al tocar, un movimiento de ratón en ese punto (sale al instante, aunque no se mueva el dedo);
 * al levantarlo, que el ratón ha salido (se quita la información, la línea y el punto), y se
 * cancelan los eventos de ratón de después. Solo dentro de la gráfica: el selector D M A sigue
 * recibiendo sus toques.
 *
 * El aviso de levantar el dedo se escucha en el propio elemento tocado: si es el relleno de un
 * área, Recharts lo vuelve a dibujar al tocarlo y lo saca de la página, y entonces el evento ya
 * no llega a los elementos de alrededor (sí al tocado, que siempre lo recibe).
 */
function trackTouchOnChart(event) {
  const target = event.target
  const chart = target instanceof Element ? target.closest('.recharts-wrapper') : null
  const touch = event.touches[0]
  if (!chart || !touch || event.touches.length > 1) return
  chart.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: touch.clientX, clientY: touch.clientY }))

  const release = (end) => {
    if (end.touches.length > 0) return
    target.removeEventListener('touchend', release)
    target.removeEventListener('touchcancel', release)
    if (end.cancelable) end.preventDefault()
    // En el siguiente fotograma: Recharts aplica los movimientos en un requestAnimationFrame, y en
    // un toque muy corto el del dedo llegaría después y dejaría el punto fijo.
    requestAnimationFrame(() =>
      chart.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })),
    )
  }
  target.addEventListener('touchend', release, { passive: false })
  target.addEventListener('touchcancel', release)
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

// Hueco entre las líneas y el borde inferior de la información.
const TOOLTIP_GAP = 12
// Ancho que puede llegar a ocupar la información (más el hueco de 10 px con el punto), y el
// mínimo, según el modo: depende de las cifras, así que se trabaja con un margen.
const TOOLTIP_WIDTH = { split: { min: 210, max: 250 }, balance: { min: 180, max: 230 } }

/**
 * Dentro de la gráfica: calcula a qué altura (px) queda lo más alto de las líneas en el tramo
 * que ocupa la información alrededor del punto señalado (patrimonio, o la mayor de ingresos y
 * gastos) y se lo pasa a `onChange`, para colocarla justo encima sin tapar ninguna línea.
 */
function TooltipAnchor({ points, splitLines, onChange }) {
  const label = useActiveTooltipLabel()
  const scale = useYAxisScale()
  const plot = usePlotArea()
  let top = null
  const active = label === undefined ? -1 : points.findIndex((p) => p.period === label)
  if (active >= 0 && scale && plot) {
    // Tramo que tapa la información: a la derecha del punto, o a la izquierda si no cabe (como
    // la coloca Recharts). Cerca del borde derecho puede ir a cualquiera de los dos lados según
    // su ancho real, y se miran ambos.
    const step = points.length > 1 ? plot.width / (points.length - 1) : plot.width
    const width = TOOLTIP_WIDTH[splitLines ? 'split' : 'balance']
    const reach = Math.ceil(width.max / step)
    const x = active * step
    const mayGoRight = x + width.min <= plot.width
    const mayGoLeft = x + width.max > plot.width
    const near = points.slice(mayGoLeft ? Math.max(0, active - reach) : active, mayGoRight ? active + reach + 1 : active + 1)
    const highest = Math.max(...near.map((p) => (splitLines ? Math.max(p.incomeTotal, p.expenseTotal) : p.balance)))
    top = scale(highest)
  }
  useEffect(() => onChange(Number.isFinite(top) ? top : null), [top, onChange])
  return null
}

function ChartTooltip({ active, payload, granularity, splitLines, lifted }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  // Anclado al punto más alto: sube toda su altura para quedar justo encima, sin tapar las líneas.
  const box = cn('bg-popover text-popover-foreground grid gap-1.5 rounded-lg border px-3 py-2 text-xs shadow-md', lifted && '-translate-y-full')
  if (splitLines) {
    return (
      <div className={cn(box, 'min-w-52')}>
        <p className="font-medium">{formatPeriod(point.period, granularity, { long: true })}</p>
        <SplitTooltip point={point} />
      </div>
    )
  }
  return (
    <div className={cn(box, 'min-w-44')}>
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
 * todo el ancho, sin tarjeta y con ejes discretos (los importes, dentro de la gráfica); en PC va
 * en tarjeta, con ejes y rejilla.
 * Con el ajuste «Ingresos y gastos por separado» muestra en su lugar dos líneas: ingresos
 * (azul) y gastos (rojo) acumulados desde el inicio de la vista. Con «Vista de calendario»,
 * las ventanas son el mes y el año en curso (ver `lib/projections.js`).
 */
export function NetWorthChart({ className }) {
  const gradientId = useId()
  const isDesktop = useIsDesktop()
  const [granularity, setGranularity] = useState('M')
  const [tooltipTop, setTooltipTop] = useState(null)
  // Las tres vistas ya están en memoria: cambiar de una a otra no hace peticiones.
  const { projections, chart } = useFinanceData()
  const { splitLines, calendar } = chart
  const { error, loading } = projections
  const data = projections.data?.[granularity]

  const points = useMemo(() => toChartPoints(data?.points ?? []), [data])
  const layers = useMemo(() => splitLayers(points), [points])
  // El ahorro se compara mes a mes (en D también: día a día casi siempre es 0 € y el % no dice
  // nada) y, en la vista A, año a año. Sale de las vistas M y A ya en caché.
  const statsSource = granularity === 'A' ? projections.data?.A : projections.data?.M
  const stats = useMemo(() => (statsSource ? savingsTrend(statsSource.points) : null), [statsSource])
  const statsUnit = granularity === 'A' ? 'año' : 'mes'
  const hasNegative = !splitLines && points.some((p) => p.balance < 0)
  // Solo en la vista de patrimonio y si se ha indicado un patrimonio inicial (con su fecha).
  const initialBalance = !splitLines && data?.balance_date ? Number(data.initial_balance) : null
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
        {stats && !isDesktop && <ChartSummary stats={stats} unit={statsUnit} />}
        {((stats && isDesktop) || splitLines) && (
          // PC: el resumen a la altura del título y, debajo, la leyenda. Móvil: solo la leyenda.
          <CardAction className="flex flex-col items-end gap-1.5">
            {stats && isDesktop && (
              <ChartSummary stats={stats} unit={statsUnit} className="min-h-5 items-center justify-end" />
            )}
            {splitLines && (
              <div className="flex gap-3 text-xs">
                {SPLIT_SERIES.map((series) => (
                  <span key={series.key} className="text-muted-foreground flex items-center gap-1.5">
                    <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ backgroundColor: series.color }} />
                    {series.name}
                  </span>
                ))}
              </div>
            )}
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col px-0 md:px-4">
        {/* touch-none: al arrastrar el dedo por la gráfica solo se mueve el indicador, no la página. */}
        <div
          className="relative min-h-40 flex-1 touch-none md:h-80 md:flex-none"
          onTouchStart={trackTouchOnChart}
        >
          {error ? (
            <div className="text-muted-foreground flex h-full items-center justify-center px-6 text-center text-sm">
              {error.message}
            </div>
          ) : (
            data && (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  // Montar de nuevo al cambiar de vista (o de modo) repite la animación de la línea dibujándose.
                  key={`${granularity}-${splitLines}-${calendar}`}
                  data={points}
                  // PC: el mismo margen a los dos lados, alineado con el título (los importes ocupan solo lo que necesitan).
                  margin={isDesktop ? { top: 16, right: 8, left: 8, bottom: 0 } : { top: 16, right: 0, left: 0, bottom: 0 }}
                >
                  <defs>
                    {GRADIENTS.map(({ key, color }) => (
                      <linearGradient key={key} id={`${gradientId}-${key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={color} stopOpacity={0.35} />
                        <stop offset="95%" stopColor={color} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid
                    vertical={false}
                    strokeDasharray="3 3"
                    stroke="var(--border)"
                    strokeOpacity={isDesktop ? 1 : 0.6}
                  />
                  <XAxis
                    dataKey="period"
                    tickFormatter={(p) => formatPeriod(p, granularity)}
                    tick={isDesktop ? axisTick : MobileXTick}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={isDesktop ? 24 : 32}
                    height={isDesktop ? 30 : 20}
                    // En la vista de calendario (12 meses, 25 años…) el reparto por defecto deja huecos
                    // desiguales: ahí se reparten las etiquetas por igual desde la primera.
                    interval={calendar ? 'equidistantPreserveStart' : 'preserveEnd'}
                    tickMargin={isDesktop ? 8 : 4}
                  />
                  <YAxis
                    mirror={!isDesktop}
                    domain={scale.domain}
                    ticks={scale.ticks}
                    tickFormatter={formatEURCompact}
                    tick={isDesktop ? axisTick : mobileYTick}
                    tickLine={false}
                    axisLine={false}
                    width={isDesktop ? 'auto' : 72}
                  />
                  <TooltipAnchor points={points} splitLines={splitLines} onChange={setTooltipTop} />
                  <Tooltip
                    // Encima del punto más alto del periodo (la información sube su propia altura);
                    // en horizontal sigue al dedo o al ratón. La escala deja libre la mitad de arriba.
                    position={tooltipTop === null ? undefined : { y: tooltipTop - TOOLTIP_GAP }}
                    allowEscapeViewBox={{ x: false, y: true }}
                    animationDuration={150}
                    content={<ChartTooltip granularity={granularity} splitLines={splitLines} lifted={tooltipTop !== null} />}
                    cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '3 3' }}
                  />
                  {hasNegative && <ReferenceLine y={0} stroke="var(--expense)" strokeOpacity={0.5} />}
                  {initialBalance !== null && (
                    // Patrimonio inicial de Ajustes: línea horizontal muy tenue, sin etiqueta (solo si cae en la vista).
                    <ReferenceLine
                      y={initialBalance}
                      stroke="var(--muted-foreground)"
                      strokeOpacity={0.45}
                      strokeDasharray="2 4"
                    />
                  )}
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
          {/* Justo encima de las etiquetas del eje X. */}
          <GranularitySelector
            value={granularity}
            onChange={setGranularity}
            className="absolute right-4 bottom-7 md:right-3 md:bottom-9"
          />
        </div>
      </CardContent>
    </Card>
  )
}
