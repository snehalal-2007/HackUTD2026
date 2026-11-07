export type ViewId = 'floor' | 'agent' | 'alerts' | 'operators'

export const VIEW_TITLES: Record<ViewId, string> = {
  floor: 'Floor',
  agent: 'AI Agent',
  alerts: 'Alerts',
  operators: 'Operators',
}
