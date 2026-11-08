export type ViewId = 'floor' | 'agent' | 'alerts' | 'operators' | 'security'

export const VIEW_TITLES: Record<ViewId, string> = {
  floor: 'Floor',
  agent: 'AI Agent',
  alerts: 'Alerts',
  operators: 'Operators',
  security: 'Security',
}
