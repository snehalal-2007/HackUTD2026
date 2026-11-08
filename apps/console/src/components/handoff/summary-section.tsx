import { BotIcon } from 'lucide-react'
import { Section, Stat } from './section'
import { buildSummary } from './summary'
import type { CostResult } from './cost-model'
import type { ShiftReportData } from './types'

/** Plain-language summary first: what happened, what MESA did by itself, what is open, what to do next. */
export function SummarySection({ report, costs }: { report: ShiftReportData; costs: CostResult }) {
  const sentences = buildSummary(report, costs)
  const open = report.incidents.filter(i => i.status !== 'closed').length
  const auto = report.incidents.filter(i => i.status === 'closed' && !i.needsHuman).length
  return (
    <Section id="ho-summary" title="Shift summary">
      <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
        <p className="max-w-3xl text-[15px] leading-relaxed">{sentences.join(' ')}</p>
        <p className="text-xs text-muted-foreground">Written by a template from the counts below, not by an AI. Dollar figures are estimates.</p>
      </div>
      <ul className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Shift at a glance">
        <Stat label="Incidents" value={report.incidents.length} note="in this shift" />
        <Stat label="Closed by MESA" value={auto} note="no person needed" />
        <Stat label="Still open" value={open} note={open ? 'needs a person' : 'nothing waiting'} />
        <Stat label="Things for you" value={report.actions.length} note={`${report.actions.filter(a => a.priority === 'high').length} urgent`} />
      </ul>
      {report.aiBrief && (
        <div className="flex gap-2 rounded-lg border border-dashed bg-card p-3 text-sm">
          <BotIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">AI drafted shift brief{report.aiBrief.source === 'template' ? ' (template fallback)' : ''}</span>
            <p>{report.aiBrief.summary}</p>
          </div>
        </div>
      )}
    </Section>
  )
}
