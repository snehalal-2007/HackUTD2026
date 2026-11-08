import type { ShiftReportData } from './types'

/** Starter questions drawn from the live report, so they are about this shift and answerable from the database. */
export function suggestionsFor(report: ShiftReportData): string[] {
  const urgent = report.incidents.find(i => i.status === 'escalated') ?? report.incidents.find(i => i.status !== 'closed') ?? report.incidents[report.incidents.length - 1]
  return [
    'What should I do first this shift?',
    'Which incidents are still open?',
    ...(urgent ? [`Why did incident #${urgent.id} at ${urgent.place} happen?`] : []),
  ]
}
