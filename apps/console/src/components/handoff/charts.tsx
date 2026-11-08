import { CartesianGrid, Line, LineChart, Pie, PieChart, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { money, type CostResult } from './cost-model'
import { causesOf } from './summary'
import { clockAt, type IncidentKind, type ShiftReportData } from './types'

// Charts for the shift report, drawn with the shadcn chart container (recharts). None of them animate: they are
// read once, and nothing about them is a live arrival. Every colour is paired with a text label in the legend.

const WARN_C = 50
const CRIT_C = 55

const CAUSE_COLOR: Record<IncidentKind, string> = {
  gpu_temp: 'var(--ho-hot)',
  gpu_failure: 'var(--ho-fault)',
  feed_stale: 'var(--ho-feed)',
  manual: 'var(--ho-manual)',
}

const tempConfig = { tempC: { label: 'Hottest GPU', color: 'var(--ho-line)' } } satisfies ChartConfig

/** Evenly spaced, round-numbered minute ticks, at most six (every 1, 2, 5, 10, 15, 30, 60, 120 or 180 minutes). */
function minuteTicks(durationMin: number): number[] {
  const step = [1, 2, 5, 10, 15, 30, 60, 120, 180].find(s => durationMin / s <= 5) ?? 240
  const ticks: number[] = []
  for (let m = 0; m <= durationMin; m += step) ticks.push(m)
  return ticks
}

/** Line chart: hottest GPU in any rack over the shift, against the warning and critical limits. */
export function TempChart({ report }: { report: ShiftReportData }) {
  const data = report.hottest
  if (!data.length) {
    return <p className="rounded-lg border bg-card px-4 py-8 text-center text-sm text-muted-foreground">No temperature readings were recorded in this window.</p>
  }
  const peak = data.reduce((a, b) => (b.tempC > a.tempC ? b : a))
  const low = Math.min(...data.map(d => d.tempC))
  const domain: [number, number] = [Math.floor(Math.min(low, WARN_C - 6)), Math.ceil(Math.max(peak.tempC, CRIT_C) + 2)]
  const when = (min: number) => clockAt(report.startClock, min)
  return (
    <figure className="m-0 flex flex-col gap-2">
      <ChartContainer
        config={tempConfig}
        className="aspect-auto h-64 w-full"
        role="img"
        aria-label={`Line chart of the hottest GPU temperature. It peaked at ${peak.tempC} degrees Celsius at ${when(peak.min)}. The warning limit is ${WARN_C} and the critical limit is ${CRIT_C}.`}
      >
        <LineChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="min" type="number" domain={[0, Math.max(1, report.durationMin)]} ticks={minuteTicks(report.durationMin)} interval="preserveStartEnd" tickFormatter={(v: number) => when(v)} tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis domain={domain} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => `${v} °C`} />
          <ReferenceLine y={WARN_C} stroke="var(--ho-warn)" strokeDasharray="5 4" label={{ value: `Warning ${WARN_C} °C`, position: 'insideBottomLeft', fill: 'var(--ho-warn)', fontSize: 11 }} />
          <ReferenceLine y={CRIT_C} stroke="var(--ho-fault)" strokeDasharray="5 4" label={{ value: `Critical ${CRIT_C} °C`, position: 'insideTopLeft', fill: 'var(--ho-fault)', fontSize: 11 }} />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                hideIndicator
                labelFormatter={(_, payload) => (payload?.[0] ? `At ${when(Number(payload[0].payload.min))}` : '')}
                formatter={value => <span>Hottest GPU <b className="tabular-nums">{String(value)} °C</b></span>}
              />
            }
          />
          <Line dataKey="tempC" type="monotone" stroke="var(--color-tempC)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
        </LineChart>
      </ChartContainer>
      <figcaption className="text-xs text-muted-foreground">
        Hottest GPU in any rack. Peak <span className="tabular-nums">{peak.tempC} °C</span> at {when(peak.min)}.
      </figcaption>
    </figure>
  )
}

interface Slice {
  key: string
  label: string
  value: number
  color: string
  /** Text shown in the legend next to the swatch. */
  display: string
}

function Donut({ slices, center, centerSub, label }: { slices: Slice[]; center: string; centerSub: string; label: string }) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  const config: ChartConfig = Object.fromEntries(slices.map(s => [s.key, { label: s.label, color: s.color }]))
  if (!total) {
    return <p className="rounded-lg border bg-card px-4 py-8 text-center text-sm text-muted-foreground">Nothing to show for this shift.</p>
  }
  return (
    <div className="@container">
      <div className="flex flex-col items-center gap-3 @md:flex-row @md:items-center">
      <div className="relative size-44 shrink-0">
        <ChartContainer config={config} className="aspect-square size-44" role="img" aria-label={`${label}: ${slices.map(s => `${s.label} ${s.display}`).join(', ')}`}>
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="key" />} />
            <Pie
              data={slices.map(s => ({ key: s.key, value: s.value, fill: `var(--color-${s.key})` }))}
              dataKey="value"
              nameKey="key"
              innerRadius={54}
              outerRadius={82}
              paddingAngle={2}
              stroke="var(--card)"
              strokeWidth={2}
              isAnimationActive={false}
            />
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div className="leading-tight">
            <div className="text-xl font-semibold tabular-nums">{center}</div>
            <div className="text-[11px] text-muted-foreground">{centerSub}</div>
          </div>
        </div>
      </div>
      <ul className="flex w-full min-w-0 flex-1 flex-col gap-1.5 text-sm" aria-label={`${label}, legend`}>
        {slices.map(s => (
          <li key={s.key} className="flex items-center gap-2">
            <span aria-hidden="true" className="size-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className="min-w-0 flex-1">{s.label}</span>
            <span className="tabular-nums text-muted-foreground">{s.display}</span>
          </li>
        ))}
      </ul>
      </div>
    </div>
  )
}

/** Donut: incidents by cause. */
export function CauseDonut({ report }: { report: ShiftReportData }) {
  const causes = causesOf(report)
  const total = report.incidents.length
  return (
    <Donut
      label="Incidents by cause"
      center={String(total)}
      centerSub={total === 1 ? 'incident' : 'incidents'}
      slices={causes.map(c => ({ key: c.kind, label: c.label, value: c.count, color: CAUSE_COLOR[c.kind], display: `${c.count} (${Math.round((c.count / total) * 100)}%)` }))}
    />
  )
}

/** Donut: where the estimated saving comes from. */
export function SavingsDonut({ costs }: { costs: CostResult }) {
  const a = costs.avoided
  const slices: Slice[] = [
    { key: 'duplicateRunning', label: 'Duplicate copies not run', value: a.duplicateRunning, color: 'var(--ho-save-1)', display: money(a.duplicateRunning) },
    { key: 'failoverHandling', label: 'Failover handling not needed', value: a.failoverHandling, color: 'var(--ho-save-2)', display: money(a.failoverHandling) },
    { key: 'failoverDowntime', label: 'Failover downtime not suffered', value: a.failoverDowntime, color: 'var(--ho-save-3)', display: money(a.failoverDowntime) },
  ].filter(s => s.value > 0)
  return <Donut label="Estimated saving by source" center={money(a.total)} centerSub="estimate" slices={slices} />
}
