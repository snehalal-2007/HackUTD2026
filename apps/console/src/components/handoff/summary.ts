import type { CostResult } from './cost-model'
import { money } from './cost-model'
import { KIND_LABEL, type IncidentKind, type ShiftReportData } from './types'

// The plain-language summary at the top of the report. It is assembled from the report's own counts by a
// template, so every number in it can be traced to the sections below. No AI writes this text.

/** "Data feed silent" becomes "data feed silent"; "GPU fault" stays as it is. */
const lowerFirst = (t: string) => (/^[A-Z]{2}/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1))
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** What the incidents were, as a noun phrase: "3 from GPUs running too hot". */
const CAUSE_PHRASE: Record<IncidentKind, (n: number) => string> = {
  gpu_temp: n => `${n} from ${n === 1 ? 'a GPU' : 'GPUs'} running too hot`,
  gpu_failure: n => `${n} GPU ${n === 1 ? 'fault' : 'faults'}`,
  feed_stale: n => `${n} silent data ${n === 1 ? 'feed' : 'feeds'}`,
  manual: n => `${n} raised by hand`,
}
const ALL_PHRASE: Record<IncidentKind, string> = {
  gpu_temp: 'GPUs running too hot',
  gpu_failure: 'GPU faults',
  feed_stale: 'silent data feeds',
  manual: 'incidents raised by hand',
}

export interface Cause {
  kind: IncidentKind
  label: string
  count: number
}

/** Incident counts by cause, biggest first, for the donut and the summary. */
export function causesOf(report: ShiftReportData): Cause[] {
  const counts = new Map<IncidentKind, number>()
  for (const i of report.incidents) counts.set(i.kind, (counts.get(i.kind) ?? 0) + 1)
  return [...counts.entries()].map(([kind, count]) => ({ kind, label: KIND_LABEL[kind], count })).sort((a, b) => b.count - a.count)
}

/** Three to five short sentences: what happened, what MESA did by itself, what is still open, what to do next. */
export function buildSummary(report: ShiftReportData, costs: CostResult): string[] {
  const sentences: string[] = []
  const { incidents, remediation: r, actions } = report
  const total = incidents.length

  if (!total) {
    sentences.push('No incidents were recorded in this shift.')
  } else {
    const causes = causesOf(report)
    if (causes.length === 1) {
      sentences.push(total === 1 ? `There was 1 incident, from ${CAUSE_PHRASE[causes[0].kind](1).replace(/^1 from /, '')}.` : `There were ${total} incidents, all from ${ALL_PHRASE[causes[0].kind]}.`)
    } else {
      const parts = causes.map(c => CAUSE_PHRASE[c.kind](c.count))
      sentences.push(`There were ${total} incidents: ${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}.`)
    }
  }

  const auto = incidents.filter(i => i.status === 'closed' && !i.needsHuman).length
  if (total) {
    const did: string[] = []
    if (r.throttles) did.push(`slowed work on ${plural(r.throttles, 'rack')}`)
    if (r.instancesMoved) did.push(`moved ${plural(r.instancesMoved, 'running instance')} to cooler racks`)
    if (r.patches) did.push(`patched ${plural(r.patches, 'service')} without a restart`)
    const acted = did.length ? `: it ${did.join(' and ')}` : ''
    sentences.push(`MESA closed ${auto} of them on its own${acted}.`)
  }

  if (r.instancesMoved || r.duplicatesAvoided) {
    sentences.push(
      `Downtime was ${r.downtimeS} s, and ${plural(r.duplicatesAvoided, 'duplicate copy', 'duplicate copies')} ${r.duplicatesAvoided === 1 ? 'was' : 'were'} avoided, an estimated ${money(costs.avoided.total)} saved.`,
    )
  }

  const open = incidents.filter(i => i.status !== 'closed')
  if (open.length) {
    sentences.push(`${plural(open.length, 'incident')} ${open.length === 1 ? 'is' : 'are'} still open${open.length <= 2 ? ` (${open.map(i => `${lowerFirst(i.title)} at ${i.place}`).join('; ')})` : ''}.`)
  } else if (total) {
    sentences.push('Nothing is still open.')
  }

  if (actions.length) {
    const high = actions.filter(a => a.priority === 'high').length
    const first = actions[0]
    sentences.push(`You have ${plural(actions.length, 'thing')} to do${high ? `, ${high} of them urgent` : ''}. Start with “${first.what}” at ${first.where}.`)
  } else {
    sentences.push('There is nothing you need to do first; keep an eye on the Alerts view.')
  }
  return sentences.slice(0, 5)
}
