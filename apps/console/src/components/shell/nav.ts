export type ViewId = 'floor' | 'agent' | 'alerts' | 'log' | 'operators' | 'security'

export const VIEW_TITLES: Record<ViewId, string> = {
  floor: 'Floor',
  agent: 'AI Agent',
  alerts: 'Alerts',
  log: 'Log',
  operators: 'Operators',
  security: 'Security',
}
