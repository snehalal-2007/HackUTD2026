import { INLET_CRIT_C, INLET_WARN_C } from './sample'

export type Band = 'normal' | 'warm' | 'hot'

export function bandOf(t: number): Band {
  if (t >= INLET_CRIT_C) return 'hot'
  if (t >= INLET_WARN_C) return 'warm'
  return 'normal'
}

export const BAND_BORDER: Record<Band, string> = { // table mode: Tailwind classes
  normal: 'border-success/60',
  warm: 'border-warning',
  hot: 'border-destructive',
}

export const BAND_COLOR: Record<Band, string> = { // 3D mode: raw CSS colors for inline face styles
  normal: 'color-mix(in oklch, var(--success) 60%, transparent)',
  warm: 'var(--warning)',
  hot: 'var(--destructive)',
}
