// UI preview data. Phase 2 replaces this with the live `asset` and `latest_reading` tables; field names follow docs/PLAN.md.

export const HALL_NAME = 'Hall 3'
export const INLET_WARN_C = 28 // 28–31 °C is the warm band
export const INLET_CRIT_C = 31 // 31 °C and over is hot

export interface PreviewRack {
  assetId: string
  row: string
  col: number
  inletC: number
}

export interface PreviewUnit {
  assetId: string
  kind: 'cooling' | 'power'
  status: string // "cooling", "71% load"
  ok: boolean
}

const INLET: Record<string, number[]> = {
  A: [24.9, 24.5, 25.5, 25.3, 25.6, 25.6],
  B: [25.7, 24.3, 24.4, 24.9, 24.6, 25.0],
  C: [25.4, 24.4, 24.5, 25.2, 25.0, 24.8],
  D: [25.3, 25.1, 24.5, 25.4, 25.1, 24.9],
}

export const PREVIEW_RACKS: PreviewRack[] = Object.entries(INLET).flatMap(([row, temps]) =>
  temps.map((inletC, i) => ({ assetId: `${row}-${String(i + 1).padStart(2, '0')}`, row, col: i + 1, inletC })),
)

export const PREVIEW_UNITS: PreviewUnit[] = [
  { assetId: 'CRAC-1', kind: 'cooling', status: 'cooling', ok: true },
  { assetId: 'CRAC-2', kind: 'cooling', status: 'cooling', ok: true },
  { assetId: 'PDU-1', kind: 'power', status: '71% load', ok: true },
  { assetId: 'PDU-2', kind: 'power', status: '74% load', ok: true },
]
