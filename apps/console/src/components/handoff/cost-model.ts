import { useCallback, useState } from 'react'
import type { ShiftReportData } from './types'

// The cost model for the shift report. Every figure it produces is an ESTIMATE: real counts from the shift
// (instances moved, duplicates avoided, downtime seconds, incidents that needed a person) multiplied by the
// assumptions below. The assumptions are placeholders, not measured prices; the report shows them in one place
// and lets a lead change them. Nothing here is sent anywhere.

export interface CostAssumptions {
  /** US dollars lost per hour that one service instance is down. */
  downtimeCostPerHour: number
  /** Seconds of downtime a duplicate-and-failover would cause per moved instance (a restart elsewhere). */
  failoverDowntimeS: number
  /** US dollars per hour to run one duplicate copy of an instance. */
  duplicateCostPerHour: number
  /** Hours a duplicate copy would keep running before the original is trusted again. */
  duplicateHours: number
  /** US dollars of handling per failover: moving traffic, cleaning up the extra copy. */
  failoverHandlingCost: number
  /** US dollars per hour of operator time. */
  operatorCostPerHour: number
  /** Minutes an incident that needs a person takes to deal with. */
  humanMinutesPerIncident: number
}

export const DEFAULT_ASSUMPTIONS: CostAssumptions = {
  downtimeCostPerHour: 1500,
  failoverDowntimeS: 45,
  duplicateCostPerHour: 6,
  duplicateHours: 4,
  failoverHandlingCost: 50,
  operatorCostPerHour: 60,
  humanMinutesPerIncident: 30,
}

export interface AssumptionField {
  key: keyof CostAssumptions
  label: string
  unit: string
  prefix?: string
  step: number
}

export const ASSUMPTION_FIELDS: AssumptionField[] = [
  { key: 'downtimeCostPerHour', label: 'Cost of downtime', unit: 'per instance-hour', prefix: '$', step: 100 },
  { key: 'failoverDowntimeS', label: 'Downtime of a failover', unit: 'seconds per instance', step: 5 },
  { key: 'duplicateCostPerHour', label: 'Cost of a duplicate copy', unit: 'per hour', prefix: '$', step: 1 },
  { key: 'duplicateHours', label: 'How long a duplicate would run', unit: 'hours', step: 1 },
  { key: 'failoverHandlingCost', label: 'Handling one failover', unit: 'each', prefix: '$', step: 10 },
  { key: 'operatorCostPerHour', label: 'Operator time', unit: 'per hour', prefix: '$', step: 5 },
  { key: 'humanMinutesPerIncident', label: 'Time for an incident a person handles', unit: 'minutes', step: 5 },
]

const KEY = 'mesa:handoff-cost-assumptions:v1'

function readStored(): CostAssumptions {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_ASSUMPTIONS
    const parsed = JSON.parse(raw) as Partial<CostAssumptions>
    const next = { ...DEFAULT_ASSUMPTIONS }
    for (const k of Object.keys(DEFAULT_ASSUMPTIONS) as (keyof CostAssumptions)[]) {
      const v = parsed[k]
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) next[k] = v
    }
    return next
  } catch {
    return DEFAULT_ASSUMPTIONS // storage blocked or unreadable: the defaults still work
  }
}

/** The assumptions, editable, kept on this device only. */
export function useCostAssumptions() {
  const [values, setValues] = useState<CostAssumptions>(readStored)

  const save = (next: CostAssumptions) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      // Blocked storage: the change still applies until the page closes.
    }
  }
  const set = useCallback((key: keyof CostAssumptions, value: number) => {
    setValues(prev => {
      const next = { ...prev, [key]: Number.isFinite(value) && value >= 0 ? value : prev[key] }
      save(next)
      return next
    })
  }, [])
  const reset = useCallback(() => {
    setValues(DEFAULT_ASSUMPTIONS)
    try {
      localStorage.removeItem(KEY)
    } catch {
      // Nothing stored that we could remove.
    }
  }, [])
  const isCustom = (Object.keys(DEFAULT_ASSUMPTIONS) as (keyof CostAssumptions)[]).some(k => values[k] !== DEFAULT_ASSUMPTIONS[k])
  return { values, set, reset, isCustom }
}

export interface CostResult {
  incurred: { downtime: number; humanResponse: number; total: number }
  avoided: { duplicateRunning: number; failoverHandling: number; failoverDowntime: number; total: number }
  /** Avoided minus incurred. */
  net: number
  /** Seconds of downtime a failover would have caused for the instances that were moved instead. */
  avoidedDowntimeS: number
  perIncident: Map<string, number>
  humanIncidents: number
}

/** Counts from the shift times the assumptions. Pure, so the live report and the samples use the same maths. */
export function computeCosts(report: ShiftReportData, a: CostAssumptions): CostResult {
  const r = report.remediation
  const perIncident = new Map<string, number>()
  let humanIncidents = 0
  for (const inc of report.incidents) {
    const cost = inc.needsHuman ? (a.humanMinutesPerIncident / 60) * a.operatorCostPerHour : 0
    if (inc.needsHuman) humanIncidents += 1
    perIncident.set(inc.id, cost)
  }
  const humanResponse = [...perIncident.values()].reduce((s, v) => s + v, 0)
  const downtime = (r.downtimeS / 3600) * a.downtimeCostPerHour

  const duplicateRunning = r.duplicatesAvoided * a.duplicateCostPerHour * a.duplicateHours
  const failoverHandling = r.duplicatesAvoided * a.failoverHandlingCost
  const avoidedDowntimeS = r.instancesMoved * a.failoverDowntimeS
  const failoverDowntime = (avoidedDowntimeS / 3600) * a.downtimeCostPerHour

  const incurredTotal = downtime + humanResponse
  const avoidedTotal = duplicateRunning + failoverHandling + failoverDowntime
  return {
    incurred: { downtime, humanResponse, total: incurredTotal },
    avoided: { duplicateRunning, failoverHandling, failoverDowntime, total: avoidedTotal },
    net: avoidedTotal - incurredTotal,
    avoidedDowntimeS,
    perIncident,
    humanIncidents,
  }
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
export const money = (n: number) => usd.format(Math.round(n))
