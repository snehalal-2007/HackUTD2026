// UI preview data. Phase 2 replaces this with the live `alert` and
// `latest_reading` tables from SpacetimeDB; field names follow docs/PLAN.md.

export type Severity = 'high' | 'medium' | 'low'

export interface PreviewAlert {
  alertId: string
  assetId: string
  kind: string
  severity: Severity
  status: 'open' | 'acknowledged' | 'mitigating'
  summary: string
  owner: string | null
  ackDueMin: number // minutes until the acknowledgment deadline
  breachInMin: number | null // predicted minutes until the limit is crossed
  runbookHint: string
}

export const PREVIEW_ALERTS: PreviewAlert[] = [
  {
    alertId: 'al-1042',
    assetId: 'B-12',
    kind: 'Inlet temperature',
    severity: 'high',
    status: 'open',
    summary: 'Rack B-12 inlet rising, crosses 32 °C in about 14 min',
    owner: null,
    ackDueMin: 6,
    breachInMin: 14,
    runbookHint: 'Shift load from B-12 to B-07, then dispatch facilities to swap the CRAC-2 fan tray.',
  },
  {
    alertId: 'al-1041',
    assetId: 'CRAC-2',
    kind: 'Cooling unit',
    severity: 'medium',
    status: 'acknowledged',
    summary: 'CRAC-2 fan 3 stopped, unit running at 66% airflow',
    owner: 'Night shift lead',
    ackDueMin: 0,
    breachInMin: null,
    runbookHint: 'Confirm the fan fault on the unit panel and open a facilities ticket.',
  },
  {
    alertId: 'al-1039',
    assetId: 'PDU-A4',
    kind: 'Power',
    severity: 'low',
    status: 'mitigating',
    summary: 'PDU-A4 load at 78% of rated capacity',
    owner: 'Operator on shift',
    ackDueMin: 0,
    breachInMin: 95,
    runbookHint: 'Watch the trend. Rebalance rows A1 to A3 if load passes 85%.',
  },
]

// Rack inlet temperatures in °C for the health chart.
export const PREVIEW_INLET = [
  { rack: 'B-07', temp: 24.1 },
  { rack: 'B-08', temp: 24.8 },
  { rack: 'B-09', temp: 26.2 },
  { rack: 'B-10', temp: 28.9 },
  { rack: 'B-11', temp: 29.7 },
  { rack: 'B-12', temp: 31.2 },
]

export const INLET_LIMIT_C = 32
export const INLET_WARN_C = 29
