import { CpuIcon, DropletsIcon, FanIcon, HandIcon, ThermometerIcon, WifiOffIcon, ZapIcon, type LucideIcon } from 'lucide-react'

// What an alert is about. Each type maps to the `kind` the threshold rules write on the incident.
// Leak, power and cooling have no sensors in the telemetry yet (it covers servers only), so they're listed as
// coming, never shown as if they were live.

export interface AlertType {
  id: string
  label: string
  icon: LucideIcon
  kinds: string[] // incident.kind values that belong to this type; empty = no data source yet
}

export const ALERT_TYPES: AlertType[] = [
  { id: 'heat', label: 'Heat', icon: ThermometerIcon, kinds: ['gpu_temp'] },
  { id: 'hardware', label: 'GPU failure', icon: CpuIcon, kinds: ['gpu_failure'] },
  { id: 'feed', label: 'Feed silent', icon: WifiOffIcon, kinds: ['feed_stale'] },
  { id: 'reported', label: 'Reported', icon: HandIcon, kinds: ['manual'] },
  { id: 'leak', label: 'Leak', icon: DropletsIcon, kinds: [] },
  { id: 'power', label: 'Power', icon: ZapIcon, kinds: [] },
  { id: 'cooling', label: 'Cooling', icon: FanIcon, kinds: [] },
]

export const typeOf = (kind: string): AlertType => ALERT_TYPES.find(t => t.kinds.includes(kind)) ?? ALERT_TYPES[3]
