// The shape of one shift report, shared by the live report (read from SpacetimeDB) and the sample fixtures.
// Times inside a report are minutes from the start of the shift, so a live window and a 12-hour sample shift
// are drawn the same way. `startClock` ("19:00") turns an offset back into a clock time for display.

export type IncidentKind = 'gpu_temp' | 'gpu_failure' | 'feed_stale' | 'manual'
export type Severity = 'low' | 'medium' | 'high' | 'critical'
export type Priority = 'high' | 'medium' | 'low'

export interface ShiftIncident {
  id: string
  title: string
  kind: IncidentKind
  severity: Severity
  /** Where it happened, in console words: "Spartanburg · a18". */
  place: string
  openedMin: number
  /** Minutes from shift start when it closed; null while still open. */
  closedMin: number | null
  status: 'open' | 'acknowledged' | 'escalated' | 'closed'
  peakC: number | null
  /** What MESA did on its own, in plain words ("Throttled, then moved 1 instance to a cooler rack"). */
  mesaDid: string
  /** True when a person had to act (still open, a hardware fault, or a manual incident). */
  needsHuman: boolean
}

/** Totals for in-place remediation during the shift (docs/CLUSTER-CYCLING.md). */
export interface Remediation {
  instancesMoved: number
  duplicatesAvoided: number
  downtimeS: number
  /** Average warning lead time in seconds, or null when no run recorded one. */
  leadTimeS: number | null
  throttles: number
  migrations: number
  patches: number
  /** Runs waiting for a lead's approval (a failover is last resort and always needs one). */
  needsApproval: number
}

export interface Moment {
  min: number
  text: string
  tone: 'ok' | 'info' | 'warn' | 'bad'
}

export interface ActionItem {
  id: string
  /** What to do. */
  what: string
  /** Where: a rack, machine, data center. */
  where: string
  /** Why, in one sentence. */
  why: string
  priority: Priority
  /** Who should act: a role, never a person. */
  role: string
  /** True for suggestions the telemetry cannot support (RAM, fans); only sample shifts have these. */
  illustrative: boolean
  /** Which console view has the details, so the row's one action can open it. */
  view?: 'floor' | 'cluster' | 'alerts' | 'log'
}

export interface TempPoint {
  min: number
  tempC: number
}

export interface ShiftReportData {
  id: string
  kind: 'live' | 'sample'
  /** Short label for the switcher. */
  tabLabel: string
  title: string
  /** "19:00 to 07:00" or the live window. */
  windowLabel: string
  startClock: string
  durationMin: number
  incidents: ShiftIncident[]
  remediation: Remediation
  /** Hottest GPU in any rack, per bucket across the shift, for the line chart. */
  hottest: TempPoint[]
  /** Plain sentence on where the numbers come from. */
  provenance: string
  moments: Moment[]
  actions: ActionItem[]
  /** Live only: the agent's shift brief if one has been written, always labeled AI drafted. */
  aiBrief?: { summary: string; source: string } | null
  /** Live only: the incident log has fewer rows than the shift would have, say so. */
  caveats: string[]
}

export const KIND_LABEL: Record<IncidentKind, string> = {
  gpu_temp: 'GPU too hot',
  gpu_failure: 'GPU fault',
  feed_stale: 'Data feed silent',
  manual: 'Raised by hand',
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
}

/** "19:00" plus 95 minutes is "20:35". */
export function clockAt(startClock: string, min: number): string {
  const [h, m] = startClock.split(':').map(Number)
  const total = (((h ?? 0) * 60 + (m ?? 0) + Math.round(min)) % 1440 + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** "1 h 5 min", "12 min". */
export function durationText(min: number): string {
  const m = Math.max(0, Math.round(min))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`
}
