import { MapPinIcon } from 'lucide-react'
import { EstimateBadge, IncidentStatusBadge } from './badges'
import { money, type CostAssumptions, type CostResult } from './cost-model'
import { Section } from './section'
import { clockAt, durationText, SEVERITY_LABEL, type ShiftReportData } from './types'

/** Every incident with what happened, what MESA did on its own, and an estimated cost. */
export function BreakdownSection({ report, costs, assumptions }: { report: ShiftReportData; costs: CostResult; assumptions: CostAssumptions }) {
  const { incidents } = report
  return (
    <Section id="ho-breakdown" title="Breakdown and costs" aside={<EstimateBadge />}>
      {incidents.length === 0 ? (
        <p className="rounded-lg border bg-card px-4 py-6 text-center text-sm text-muted-foreground">No incidents were recorded in this shift.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border bg-card" aria-label="Incidents in this shift">
          {incidents.map(i => {
            const cost = costs.perIncident.get(i.id) ?? 0
            return (
              <li key={i.id} className="flex flex-col gap-1.5 px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-medium">{i.title}</span>
                  <IncidentStatusBadge status={i.status} />
                  <span className="text-xs text-muted-foreground">{SEVERITY_LABEL[i.severity]} severity</span>
                  <span className="ml-auto flex items-baseline gap-1.5 tabular-nums">
                    <span className="text-sm font-semibold">{money(cost)}</span>
                    <span className="text-[11px] text-muted-foreground">est.</span>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <MapPinIcon className="size-3" aria-hidden="true" />
                    {i.place}
                  </span>
                  <span className="tabular-nums">
                    {clockAt(report.startClock, i.openedMin)}
                    {i.closedMin != null ? ` to ${clockAt(report.startClock, i.closedMin)} (${durationText(i.closedMin - i.openedMin)})` : ' to now (still open)'}
                  </span>
                  {i.peakC != null && <span className="tabular-nums">Peak {i.peakC.toFixed(1)} °C</span>}
                  <span className="tabular-nums">Incident #{i.id}</span>
                </div>
                <p className="text-sm">
                  <span className="font-medium">What MESA did: </span>
                  {i.mesaDid}
                </p>
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex flex-col gap-1 rounded-lg border bg-card px-3 py-2.5 text-sm" role="group" aria-label="Estimated cost of this shift">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium">Estimated cost of this shift</span>
          <span className="text-lg font-semibold tabular-nums">{money(costs.incurred.total)}</span>
          <EstimateBadge />
        </div>
        <p className="text-xs text-muted-foreground">
          {costs.humanIncidents} incident{costs.humanIncidents === 1 ? '' : 's'} needed a person × {assumptions.humanMinutesPerIncident} min × {money(assumptions.operatorCostPerHour)}/h = {money(costs.incurred.humanResponse)}.
          Downtime {report.remediation.downtimeS} s × {money(assumptions.downtimeCostPerHour)} per instance-hour = {money(costs.incurred.downtime)}.
        </p>
      </div>
    </Section>
  )
}
