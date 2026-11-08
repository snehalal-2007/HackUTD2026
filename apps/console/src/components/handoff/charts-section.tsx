import { CircleCheckIcon, InfoIcon, SirenIcon, TriangleAlertIcon } from 'lucide-react'
import { CauseDonut, SavingsDonut, TempChart } from './charts'
import type { CostResult } from './cost-model'
import { EstimateBadge } from './badges'
import { Section } from './section'
import { clockAt, type Moment, type ShiftReportData } from './types'

const TONE: Record<Moment['tone'], { icon: React.ReactNode; label: string }> = {
  ok: { icon: <CircleCheckIcon className="size-3.5 text-success" aria-hidden="true" />, label: 'Resolved' },
  info: { icon: <InfoIcon className="size-3.5 text-info" aria-hidden="true" />, label: 'Info' },
  warn: { icon: <TriangleAlertIcon className="size-3.5 text-warning" aria-hidden="true" />, label: 'Warning' },
  bad: { icon: <SirenIcon className="size-3.5 text-destructive" aria-hidden="true" />, label: 'Needs attention' },
}

function ChartCard({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-4" data-slot="card">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        {aside}
      </div>
      {children}
    </div>
  )
}

/** A line chart, two donuts and the shift's key moments in time order. */
export function ChartsSection({ report, costs }: { report: ShiftReportData; costs: CostResult }) {
  return (
    <Section id="ho-charts" title="Charts">
      <ChartCard title="Hottest GPU over the shift">
        <TempChart report={report} />
      </ChartCard>
      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title="Why incidents happened">
          <CauseDonut report={report} />
        </ChartCard>
        <ChartCard title="Where the estimated saving comes from" aside={<EstimateBadge />}>
          <SavingsDonut costs={costs} />
        </ChartCard>
      </div>
      {report.moments.length > 0 && (
        <ChartCard title="Key moments, in order">
          <ol className="flex flex-col gap-1.5 text-sm" aria-label="Key moments">
            {report.moments.slice(-16).map((m, i) => (
              <li key={`${m.min}-${i}`} className="flex items-start gap-2">
                <span className="w-12 shrink-0 text-xs text-muted-foreground tabular-nums">{clockAt(report.startClock, m.min)}</span>
                <span className="mt-0.5 shrink-0" title={TONE[m.tone].label}>
                  {TONE[m.tone].icon}
                  <span className="sr-only">{TONE[m.tone].label}: </span>
                </span>
                <span>{m.text}</span>
              </li>
            ))}
          </ol>
          {report.moments.length > 16 && <p className="text-xs text-muted-foreground">Showing the latest 16 of {report.moments.length}. The Log view has every event.</p>}
        </ChartCard>
      )}
    </Section>
  )
}
