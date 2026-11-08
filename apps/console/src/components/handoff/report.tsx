import { forwardRef } from 'react'
import { ActionsSection } from './actions-section'
import { LiveBadge, SampleBadge } from './badges'
import { BreakdownSection } from './breakdown-section'
import { ChartsSection } from './charts-section'
import { computeCosts, type useCostAssumptions } from './cost-model'
import { SavingsSection } from './savings-section'
import { SummarySection } from './summary-section'
import type { ShiftReportData } from './types'
import './handoff.css'

/**
 * The report itself: the one element that "Download PDF" prints. Everything inside carries its own labels
 * (Estimate, Sample shift) so a printed copy cannot be mistaken for live data.
 */
export const ShiftReport = forwardRef<HTMLElement, { report: ShiftReportData; assumptions: ReturnType<typeof useCostAssumptions> }>(function ShiftReport({ report, assumptions }, ref) {
  const costs = computeCosts(report, assumptions.values)
  const sample = report.kind === 'sample'
  return (
    <article ref={ref} className="handoff-report mx-auto flex w-full max-w-5xl flex-col gap-6" aria-label={`Shift report: ${report.title}`} data-report-id={report.id}>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">Shift report: {report.title}</h2>
          {sample ? <SampleBadge /> : <LiveBadge />}
        </div>
        <p className="text-sm text-muted-foreground tabular-nums">{report.windowLabel}</p>
        <p className="print-only text-xs text-muted-foreground">Printed {new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} from the MESA console.</p>
        {sample && (
          <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm" role="note">
            <b>Sample shift (illustrative).</b> Every number, rack and machine on this page is made up to show what a handoff looks like. None of it is read from the database. The cost arithmetic is real; the counts it uses are not.
          </p>
        )}
        {!sample && (
          <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
            <li>{report.provenance}</li>
            {report.caveats.map(c => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        )}
      </header>

      <SummarySection report={report} costs={costs} />
      <BreakdownSection report={report} costs={costs} assumptions={assumptions.values} />
      <SavingsSection report={report} costs={costs} assumptions={assumptions} />
      <ChartsSection report={report} costs={costs} />
      <ActionsSection report={report} />
    </article>
  )
})
