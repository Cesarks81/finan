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

import { api } from '@/api/client'
import { GranularitySelector } from '@/components/GranularitySelector'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useApiQuery, useFinanceData } from '@/hooks/useFinanceData'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import {
  addDays,
  addMonths,
  currentPeriod,
  formatEUR,
  formatEURCompact,
  formatPeriod,
  toISODate,
} from '@/lib/format'
import { cn } from '@/lib/utils'

// Ventana que se pide a la API para cada vista: un poco de pasado y la proyección futura.
const RANGES = {
  D: { start: (t) => addDays(t, -14), end: (t) => addDays(t, 30) },
  M: { start: (t) => addMonths(t, -6), end: (t) => addMonths(t, 12) },
  A: { start: (t) => new Date(t.getFullYear() - 2, 0, 1), end: (t) => new Date(t.getFullYear() + 8, 11, 31) },
}

const axisTick = { fill: 'var(--muted-foreground)', fontSize: 12 }

function ChartTooltip({ active, payload, granularity }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
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
 */
export function NetWorthChart({ className }) {
  const gradientId = useId()
  const isDesktop = useIsDesktop()
  const [granularity, setGranularity] = useState('M')
  const { version } = useFinanceData()
  const range = RANGES[granularity]

  const { data, error, loading } = useApiQuery(() => {
    const today = new Date()
    return api.getProjection({
      granularity,
      start: toISODate(range.start(today)),
      end: toISODate(range.end(today)),
    })
  }, [granularity, version])

  const points = useMemo(
    () =>
      (data?.points ?? []).map((p) => ({
        period: p.period,
        balance: Number(p.balance),
        income: Number(p.income),
        expense: Number(p.expense),
      })),
    [data],
  )
  const hasNegative = points.some((p) => p.balance < 0)
  // Mientras llega la respuesta de otra vista, `points` aún es de la anterior.
  const stale = data?.granularity !== granularity

  return (
    <Card
      className={cn(
        '-mx-4 gap-3 rounded-none border-0 bg-transparent py-0 shadow-none',
        'md:mx-0 md:gap-4 md:rounded-xl md:border md:bg-card md:py-6 md:shadow-sm',
        className,
      )}
    >
      <CardHeader className="px-4 md:px-6">
        <CardTitle className="text-sm tracking-wide uppercase">Evolución patrimonio</CardTitle>
        <CardAction>
          {loading && <LoaderCircle className="text-muted-foreground size-4 animate-spin" aria-label="Cargando" />}
        </CardAction>
      </CardHeader>
      <CardContent className="px-0 md:px-4">
        <div className="relative h-72 md:h-80">
          {error ? (
            <div className="text-muted-foreground flex h-full items-center justify-center px-6 text-center text-sm">
              {error.message}
            </div>
          ) : (
            !stale && (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={points}
                  margin={isDesktop ? { top: 16, right: 12, left: 4, bottom: 0 } : { top: 16, right: 0, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                    </linearGradient>
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
                    tickFormatter={formatEURCompact}
                    tick={axisTick}
                    tickLine={false}
                    axisLine={false}
                    width={72}
                  />
                  <Tooltip
                    content={<ChartTooltip granularity={granularity} />}
                    cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '3 3' }}
                  />
                  {hasNegative && <ReferenceLine y={0} stroke="var(--expense)" strokeOpacity={0.5} />}
                  <ReferenceLine
                    x={currentPeriod(granularity)}
                    stroke="var(--muted-foreground)"
                    strokeDasharray="4 4"
                    label={{ value: 'Hoy', position: 'insideTopLeft', fill: 'var(--muted-foreground)', fontSize: 11 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="balance"
                    name="Patrimonio"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    fill={`url(#${gradientId})`}
                    activeDot={{ r: 4 }}
                  />
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
